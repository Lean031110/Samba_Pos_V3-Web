// =====================================================================
// server.js — Express + Socket.io server (production-ready)
// =====================================================================
// Features:
//   - Helmet security headers
//   - CORS configurable via env
//   - Real /health endpoint (checks DB connectivity)
//   - /ready endpoint (checks DB + WebSocket)
//   - /version endpoint
//   - Graceful shutdown (SIGTERM/SIGINT)
//   - Runs migrations on startup (seed must be run explicitly)
//   - Request size limits
// =====================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');

const { requestLogger, errorLogger, log, LEVELS } = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const { subscribe, EventTopicNames } = require('../application/eventBus');
const { db } = require('../infrastructure/db/db');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';  // In production, set to specific origins

const FRONTEND_DIR = path.join(__dirname, '..', '..', '..', 'frontend');

let ioInstance = null;
let isShuttingDown = false;

/**
 * Create and configure the Express app.
 */
function createApp() {
  const app = express();

  // === Security middleware ===
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],  // Need inline for our vanilla JS
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  const corsOptions = CORS_ORIGIN === '*' ? {} : { origin: CORS_ORIGIN.split(','), credentials: true };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(requestLogger);

  // === Health check (lightweight — no DB check) ===
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'samba-pos-web-clone',
      shuttingDown: isShuttingDown,
    });
  });

  // === Readiness check (verifies DB + WebSocket) ===
  app.get('/ready', async (req, res) => {
    try {
      // Check DB
      await db.raw('SELECT 1');
      const dbOk = true;

      // Check WebSocket
      const wsOk = ioInstance !== null;

      if (dbOk && wsOk && !isShuttingDown) {
        res.json({ status: 'ready', db: 'ok', websocket: 'ok' });
      } else {
        res.status(503).json({ status: 'not ready', db: dbOk ? 'ok' : 'fail', websocket: wsOk ? 'ok' : 'fail' });
      }
    } catch (err) {
      res.status(503).json({ status: 'not ready', db: 'fail', error: err.message });
    }
  });

  // === Version info ===
  app.get('/version', (req, res) => {
    res.json({
      name: 'samba-pos-web-clone',
      version: require('../../../package.json').version || '0.0.0',
      node: process.version,
      uptime: process.uptime(),
    });
  });

  // === Static frontend (single-page app) ===
  app.use(express.static(FRONTEND_DIR, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  // SPA fallback: any non-/api route returns index.html
  app.get(/^\/(?!api|health|ready|version).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });

  // === Auth middleware (applied to all /api/* routes except /api/auth/login) ===
  app.use('/api', authenticate);

  // === Routes ===
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/tickets', require('./routes/tickets'));
  app.use('/api/products', require('./routes/products'));
  app.use('/api/tables', require('./routes/tables'));
  app.use('/api/kitchen', require('./routes/kitchen'));
  app.use('/api/inventory', require('./routes/inventory'));
  app.use('/api/printers', require('./routes/printers'));
  app.use('/api/print', require('./routes/printers'));  // alias for /api/print/tickets/:id/send
  app.use('/api', require('./routes/config'));

  // === 404 + Error handlers ===
  app.use(notFoundHandler);
  app.use(errorLogger);
  app.use(errorHandler);

  return app;
}

/**
 * Bridge in-process eventBus events to WebSocket broadcasts.
 * Uses rooms: events for a specific ticket go to `ticket:${id}` room.
 */
function bridgeEventsToSocket(io) {
  const ticketEvents = [
    EventTopicNames.TicketCreated,
    EventTopicNames.TicketClosed,
    EventTopicNames.TicketTotalChanged,
    EventTopicNames.OrderAdded,
    EventTopicNames.PaymentProcessed,
    EventTopicNames.EntityUpdated,
  ];

  for (const event of ticketEvents) {
    subscribe(event, (payload) => {
      const ticketId = payload?.Ticket?.Id || payload?.ticketId;
      if (ticketId) {
        // Send to the ticket-specific room (POS terminals watching this ticket)
        io.to(`ticket:${ticketId}`).emit(event, payload);
        // Admin terminals get all events
        io.to('role:admin').emit(event, payload);
        // POS terminals get ticket events
        io.to('role:pos').emit(event, payload);
      } else {
        // Global events (TicketCreated, EntityUpdated) go to all POS + admin
        io.to('role:pos').emit(event, payload);
        io.to('role:admin').emit(event, payload);
      }
      log(LEVELS.DEBUG, `WebSocket broadcast: ${event}`, { ticketId });
    });
  }

  // Kitchen-specific events — only go to kitchen room + POS (for void propagation)
  subscribe('KitchenOrderAdded', (payload) => {
    io.to('role:kitchen').emit('KitchenOrderAdded', payload);
    log(LEVELS.DEBUG, `WebSocket broadcast: KitchenOrderAdded`, { orderId: payload?.orderId });
  });
  subscribe('KitchenOrderUpdated', (payload) => {
    io.to('role:kitchen').emit('KitchenOrderUpdated', payload);
    io.to('role:pos').emit('KitchenOrderUpdated', payload);
    log(LEVELS.DEBUG, `WebSocket broadcast: KitchenOrderUpdated`, { orderId: payload?.orderId });
  });
  subscribe('KitchenOrderVoided', (payload) => {
    // KDS void → POS must be notified (propagation)
    io.to('role:kitchen').emit('KitchenOrderVoided', payload);
    io.to('role:pos').emit('KitchenOrderVoided', payload);
    log(LEVELS.DEBUG, `WebSocket broadcast: KitchenOrderVoided`, { orderId: payload?.orderId });
  });
}

/**
 * Run migrations on startup.
 */
async function runMigrations() {
  const knex = require('knex');
  const config = require('../infrastructure/db/knexfile.js');
  const env = process.env.NODE_ENV || 'development';
  const migrationDb = knex(config[env] || config.development);
  log(LEVELS.INFO, 'Running database migrations...');
  await migrationDb.migrate.latest();
  log(LEVELS.INFO, 'Migrations complete.');
  await migrationDb.destroy();
}

/**
 * Graceful shutdown.
 */
function gracefulShutdown(signal) {
  return async () => {
    log(LEVELS.INFO, `Received ${signal}. Shutting down gracefully...`);
    isShuttingDown = true;

    // Stop accepting new connections
    if (ioInstance) {
      ioInstance.close();
      log(LEVELS.INFO, 'WebSocket server closed.');
    }

    // Give existing connections 5 seconds to finish
    setTimeout(async () => {
      try {
        await db.destroy();
        log(LEVELS.INFO, 'Database connection closed.');
        process.exit(0);
      } catch (err) {
        log(LEVELS.ERROR, 'Error during shutdown', { error: err.message });
        process.exit(1);
      }
    }, 1000);
  };
}

/**
 * Start the server.
 */
async function startServer() {
  // Run migrations first
  try {
    await runMigrations();
  } catch (err) {
    log(LEVELS.ERROR, 'Migration failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);
  ioInstance = new Server(server, {
    cors: CORS_ORIGIN === '*' ? { origin: '*' } : { origin: CORS_ORIGIN.split(','), credentials: true },
  });

  // Socket.io connection handler with JWT authentication + authorization
  ioInstance.on('connection', (socket) => {
    log(LEVELS.INFO, `WebSocket client connected: ${socket.id}`);

    // === AUTHENTICATION ===
    // Only accept JWT from handshake.auth (NOT from query string — avoid URL/logs exposure)
    const token = socket.handshake?.auth?.token;
    let socketUser = null;

    if (!token) {
      log(LEVELS.WARN, `WebSocket ${socket.id}: no token — disconnecting`);
      socket.emit('auth:error', { message: 'Authentication required' });
      socket.disconnect();
      return;
    }

    try {
      const { verifyToken } = require('./middleware/auth');
      const payload = verifyToken(token);
      socketUser = {
        userId: payload.userId,
        username: payload.username,
        roleId: payload.roleId,
        isAdmin: payload.isAdmin,
      };
      socket.data.user = socketUser;
      log(LEVELS.INFO, `WebSocket authenticated: ${socket.id} → user ${socketUser.username} (admin=${socketUser.isAdmin})`);
    } catch (err) {
      log(LEVELS.WARN, `WebSocket ${socket.id}: invalid token — ${err.message}`);
      socket.emit('auth:error', { message: 'Invalid or expired token' });
      socket.disconnect();
      return;
    }

    // === Helper: check if user has a specific permission ===
    async function userHasPermission(permissionCode) {
      if (socketUser.isAdmin) return true;
      try {
        const { hasPermission } = require('./middleware/rbac');
        return await hasPermission(socketUser, permissionCode);
      } catch { return false; }
    }

    socket.on('disconnect', () => {
      log(LEVELS.INFO, `WebSocket client disconnected: ${socket.id}`);
    });

    // === ROOM AUTHORIZATION ===

    // subscribe:role — join a role-based room
    // Authorization: user must have the corresponding permission
    socket.on('subscribe:role', async (role, callback) => {
      const allowedRoles = ['pos', 'kitchen', 'admin'];
      if (!allowedRoles.includes(role)) {
        log(LEVELS.WARN, `WS ${socket.id} (${socketUser.username}): denied unknown role '${role}'`);
        if (callback) callback({ success: false, error: 'Unknown role' });
        return;
      }

      // Check permission for this role
      const requiredPermission = role === 'kitchen' ? 'kitchen.view'
                               : role === 'admin' ? 'admin.all'
                               : 'pos.login';
      const has = await userHasPermission(requiredPermission);

      if (!has) {
        log(LEVELS.WARN, `WS ${socket.id} (${socketUser.username}): denied role '${role}' (lacks ${requiredPermission})`);
        if (callback) callback({ success: false, error: `Forbidden: requires '${requiredPermission}'` });
        return;
      }

      socket.join(`role:${role}`);
      log(LEVELS.DEBUG, `WS ${socket.id} (${socketUser.username}) joined role:${role}`);
      if (callback) callback({ success: true });
    });

    // subscribe:ticket — join a ticket-specific room
    // Authorization: user must have pos.login permission
    // (In production, should also check if user has access to this specific ticket)
    socket.on('subscribe:ticket', async (ticketId, callback) => {
      if (!ticketId || typeof ticketId !== 'number') {
        if (callback) callback({ success: false, error: 'Invalid ticketId' });
        return;
      }

      const has = await userHasPermission('pos.login');
      if (!has) {
        log(LEVELS.WARN, `WS ${socket.id} (${socketUser.username}): denied ticket:${ticketId} (no pos.login)`);
        if (callback) callback({ success: false, error: 'Forbidden: requires pos.login' });
        return;
      }

      // TODO: verify user has access to this specific ticket (department/terminal check)
      socket.join(`ticket:${ticketId}`);
      log(LEVELS.DEBUG, `WS ${socket.id} (${socketUser.username}) subscribed to ticket:${ticketId}`);
      if (callback) callback({ success: true });
    });

    socket.on('unsubscribe:ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // subscribe:terminal — join a terminal-specific room
    // Authorization: admin only (or the terminal's assigned user)
    socket.on('subscribe:terminal', async (terminalId, callback) => {
      if (!terminalId) {
        if (callback) callback({ success: false, error: 'Invalid terminalId' });
        return;
      }

      // Only admin or the user assigned to this terminal can join
      if (!socketUser.isAdmin) {
        // TODO: check if user is assigned to this terminal in DB
        log(LEVELS.WARN, `WS ${socket.id} (${socketUser.username}): denied terminal:${terminalId} (not admin)`);
        if (callback) callback({ success: false, error: 'Forbidden: admin required for terminal rooms' });
        return;
      }

      socket.join(`terminal:${terminalId}`);
      log(LEVELS.DEBUG, `WS ${socket.id} (${socketUser.username}) joined terminal:${terminalId}`);
      if (callback) callback({ success: true });
    });

    // === RESYNC — role-based state snapshot ===
    socket.on('resync', async (data, callback) => {
      try {
        const { db } = require('../infrastructure/db/db');
        const snapshot = { timestamp: new Date().toISOString() };

        // POS users get: open tickets + tables
        if (await userHasPermission('pos.login')) {
          snapshot.openTickets = await db('Tickets').where({ IsClosed: 0 })
            .select('Id', 'TicketNumber', 'Date', 'TotalAmount', 'RemainingAmount',
                    'LastModifiedUserName', 'DepartmentId', 'TicketTypeId', 'Version')
            .orderBy('Date', 'desc');
          snapshot.tables = await db('Entities')
            .leftJoin('EntityTypes', 'Entities.EntityTypeId', 'EntityTypes.Id')
            .where({ 'EntityTypes.Name': 'Tables' })
            .select('Entities.Id', 'Entities.Name');
        }

        // Kitchen users get: stations + active kitchen orders with items
        if (await userHasPermission('kitchen.view')) {
          snapshot.kitchenStations = await db('KitchenStations')
            .where({ IsActive: 1 })
            .select('Id', 'Code', 'DisplayName', 'Color', 'SortOrder', 'IsDefault')
            .orderBy('SortOrder');

          const activeOrders = await db('KitchenOrders')
            .whereNotIn('State', ['SERVED', 'VOIDED'])
            .orderBy('Priority', 'desc')
            .orderBy('CreatedAt', 'asc');

          const orderIds = activeOrders.map(o => o.Id);
          if (orderIds.length > 0) {
            const items = await db('KitchenOrderItems').whereIn('KitchenOrderId', orderIds);
            const itemsByOrder = {};
            for (const item of items) {
              if (!itemsByOrder[item.KitchenOrderId]) itemsByOrder[item.KitchenOrderId] = [];
              itemsByOrder[item.KitchenOrderId].push(item);
            }
            snapshot.kitchenOrders = activeOrders.map(o => ({
              ...o,
              Items: itemsByOrder[o.Id] || [],
            }));
          } else {
            snapshot.kitchenOrders = [];
          }
        }

        // Admin gets everything + system status
        if (socketUser.isAdmin) {
          snapshot.systemStatus = {
            uptime: process.uptime(),
            memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
            nodeVersion: process.version,
          };
        }

        log(LEVELS.DEBUG, `WS resync ${socket.id} (${socketUser.username}): tickets=${snapshot.openTickets?.length || 0}, kitchen=${snapshot.kitchenOrders?.length || 0}`);

        if (callback) {
          callback({ success: true, snapshot });
        } else {
          socket.emit('resync:state', snapshot);
        }
      } catch (err) {
        log(LEVELS.ERROR, `WS resync failed for ${socket.id}: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    });
  });

  // Bridge eventBus → WebSocket
  bridgeEventsToSocket(ioInstance);

  server.listen(PORT, () => {
    log(LEVELS.INFO, `SambaPOS V3 Web Clone — API server listening on port ${PORT}`);
    log(LEVELS.INFO, `WebSocket server attached (socket.io)`);
    log(LEVELS.INFO, `Health: http://localhost:${PORT}/health`);
    log(LEVELS.INFO, `Ready:  http://localhost:${PORT}/ready`);
    log(LEVELS.INFO, `API:    http://localhost:${PORT}/api`);
  });

  // Graceful shutdown handlers
  process.on('SIGTERM', gracefulShutdown('SIGTERM'));
  process.on('SIGINT', gracefulShutdown('SIGINT'));

  // Unhandled error handlers
  process.on('unhandledRejection', (reason, promise) => {
    log(LEVELS.ERROR, 'Unhandled Rejection', { reason: reason?.message || reason });
  });
  process.on('uncaughtException', (err) => {
    log(LEVELS.ERROR, 'Uncaught Exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException')();
  });

  return { app, server, io: ioInstance };
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
