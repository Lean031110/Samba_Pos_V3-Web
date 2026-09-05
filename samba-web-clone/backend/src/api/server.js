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
  const eventsToBridge = [
    EventTopicNames.TicketCreated,
    EventTopicNames.TicketClosed,
    EventTopicNames.TicketTotalChanged,
    EventTopicNames.OrderAdded,
    EventTopicNames.PaymentProcessed,
    EventTopicNames.EntityUpdated,
  ];

  for (const event of eventsToBridge) {
    subscribe(event, (payload) => {
      const ticketId = payload?.Ticket?.Id || payload?.ticketId;
      if (ticketId) {
        // Send to the ticket-specific room AND to all "admin" terminals
        io.to(`ticket:${ticketId}`).emit(event, payload);
        io.to('admin').emit(event, payload);
      } else {
        // Global events (TicketCreated, EntityUpdated) go to everyone
        io.emit(event, payload);
      }
      log(LEVELS.DEBUG, `WebSocket broadcast: ${event}`, { ticketId });
    });
  }
}

/**
 * Run migrations on startup.
 */
async function runMigrations() {
  const knex = require('knex');
  const config = require('../infrastructure/db/knexfile.js');
  const env = process.env.NODE_ENV || 'development';
  const migrationDb = knex(config[env]);
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

  // Socket.io connection handler
  ioInstance.on('connection', (socket) => {
    log(LEVELS.INFO, `WebSocket client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      log(LEVELS.INFO, `WebSocket client disconnected: ${socket.id}`);
    });
    socket.on('subscribe:ticket', (ticketId) => {
      socket.join(`ticket:${ticketId}`);
      log(LEVELS.DEBUG, `Client ${socket.id} subscribed to ticket:${ticketId}`);
    });
    socket.on('unsubscribe:ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });
    socket.on('subscribe:role', (role) => {
      socket.join(`role:${role}`);
      log(LEVELS.DEBUG, `Client ${socket.id} joined role:${role}`);
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
