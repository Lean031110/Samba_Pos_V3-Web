// =====================================================================
// server.js — Express + Socket.io server
// =====================================================================
// Starts the HTTP server on port 3001 (default) and attaches Socket.io
// for real-time multi-terminal sync.
//
// WebSocket events (broadcast to all connected clients):
//   - TicketTotalChanged  — fired when a ticket's total changes
//   - TicketClosed        — fired when a ticket is closed
//   - OrderAdded          — fired when an order is added to a ticket
//   - PaymentProcessed    — fired when a payment is processed
//
// These events are bridged from the in-process eventBus (Node EventEmitter)
// to all connected WebSocket clients, replacing Samba.MessagingServer (TCP).
// =====================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const { requestLogger, errorLogger, log, LEVELS } = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const { subscribe, EventTopicNames } = require('../application/eventBus');

const PORT = process.env.PORT || 3001;

// Frontend is served from /frontend (sibling of /backend, both inside /samba-web-clone)
// __dirname = /samba-web-clone/backend/src/api
// So ../.. = /samba-web-clone/backend, ../../.. = /samba-web-clone, then /frontend
const FRONTEND_DIR = path.join(__dirname, '..', '..', '..', 'frontend');

/**
 * Create and configure the Express app.
 * Extracted as a factory so supertest can import the app without starting the server.
 */
function createApp() {
  const app = express();

  // === Middleware ===
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // === Health check ===
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'samba-web-clone' });
  });

  // === Static frontend (single-page app) ===
  // Serves /frontend/index.html at / and /frontend/css/* at /css/* etc.
  app.use(express.static(FRONTEND_DIR));
  // SPA fallback: any non-/api route returns index.html
  app.get(/^\/(?!api|health).*/, (req, res, next) => {
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

  // === 404 + Error handlers ===
  app.use(notFoundHandler);
  app.use(errorLogger);
  app.use(errorHandler);

  return app;
}

/**
 * Bridge in-process eventBus events to WebSocket broadcasts.
 * @param {Server} io
 */
function bridgeEventsToSocket(io) {
  const eventsToBridge = [
    EventTopicNames.TicketCreated,
    EventTopicNames.TicketOpened,
    EventTopicNames.TicketClosing,
    EventTopicNames.TicketClosed,
    EventTopicNames.TicketTotalChanged,
    EventTopicNames.OrderAdded,
    EventTopicNames.PaymentProcessed,
    EventTopicNames.EntityUpdated,
  ];

  for (const event of eventsToBridge) {
    subscribe(event, (payload) => {
      // Broadcast to all connected clients
      io.emit(event, payload);
      log(LEVELS.DEBUG, `WebSocket broadcast: ${event}`, {
        ticketId: payload?.Ticket?.Id || payload?.ticketId,
      });
    });
  }
}

/**
 * Start the server (only when run directly, not when imported by tests).
 */
function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] },
  });

  // Socket.io connection handler
  io.on('connection', (socket) => {
    log(LEVELS.INFO, `WebSocket client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      log(LEVELS.INFO, `WebSocket client disconnected: ${socket.id}`);
    });
    // Allow clients to subscribe to specific ticket IDs
    socket.on('subscribe:ticket', (ticketId) => {
      socket.join(`ticket:${ticketId}`);
      log(LEVELS.DEBUG, `Client ${socket.id} subscribed to ticket:${ticketId}`);
    });
    socket.on('unsubscribe:ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });
  });

  // Bridge eventBus → WebSocket
  bridgeEventsToSocket(io);

  server.listen(PORT, () => {
    log(LEVELS.INFO, `SambaPOS V3 Web Clone — API server listening on port ${PORT}`);
    log(LEVELS.INFO, `WebSocket server attached (socket.io)`);
    log(LEVELS.INFO, `Health check: http://localhost:${PORT}/health`);
    log(LEVELS.INFO, `API base:     http://localhost:${PORT}/api`);
  });

  return { app, server, io };
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
