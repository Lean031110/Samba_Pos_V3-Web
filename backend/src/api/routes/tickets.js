// =====================================================================
// tickets.js — Express routes for /api/tickets
// =====================================================================
// Endpoints:
//   GET    /api/tickets              — list open tickets
//   GET    /api/tickets/:id          — get ticket by ID
//   POST   /api/tickets              — create new ticket
//   POST   /api/tickets/:id/orders   — add order
//   POST   /api/tickets/:id/calculations — add discount/service
//   POST   /api/tickets/:id/payments — process payment
//   POST   /api/tickets/:id/close    — close ticket
//   GET    /api/tickets/:id/print    — generate print preview (ESC/POS base64)
// =====================================================================

const express = require('express');
const { TicketService } = require('../services/TicketService');
const { TicketServiceExtended } = require('../services/TicketServiceExtended');
const { ValidationError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { idempotent } = require('../middleware/idempotency');
const {
  createTicketSchema, addOrderSchema, addCalculationSchema, addPaymentSchema,
  closeTicketSchema, noteSchema, giftSchema, tagsSchema, splitTicketSchema,
  refundTicketSchema, mergeTicketsSchema, parseOrThrow,
} = require('../middleware/schemas');

const router = express.Router();
const ticketService = new TicketService();
const ticketServiceExt = new TicketServiceExtended();

// GET /api/tickets — list open tickets (requires pos.login)
router.get('/', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const tickets = await ticketService.getOpenTickets();
    res.json({ data: tickets, count: tickets.length });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id — get ticket by ID (requires pos.login)
router.get('/:id', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const ticket = await ticketService.getTicketById(id);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets — create new ticket
router.post('/', requirePermission('pos.open_ticket'), async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createTicketSchema, req.body || {});
    const ticket = await ticketService.createTicket(parsed);
    res.status(201).json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/merge — merge multiple tickets into one
// NOTE: must be defined BEFORE /:id routes to avoid path conflict
router.post('/merge', requirePermission('pos.merge'), auditLog('ticket.merge', 'Ticket'), async (req, res, next) => {
  try {
    const { sourceTicketIds } = parseOrThrow(mergeTicketsSchema, req.body || {});
    const result = await ticketServiceExt.mergeTickets(sourceTicketIds);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/orders — add order
router.post('/:id/orders', requirePermission('pos.add_order'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { menuItemId, quantity, portionName } = req.body || {};
    const ticket = await ticketService.addOrder(id, { menuItemId, quantity, portionName }, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/calculations — add discount/service
router.post('/:id/calculations', requirePermission('pos.discount'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { calculationTypeId, amount } = req.body || {};
    const ticket = await ticketService.addCalculation(id, { calculationTypeId, amount }, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/payments — process payment (idempotent)
router.post('/:id/payments',
  requirePermission('pos.payment'),
  idempotent('POST /api/tickets/:id/payments'),
  auditLog('payment.process', 'Payment'),
  async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { paymentTypeId, amount } = parseOrThrow(addPaymentSchema, req.body || {});
    const ticket = await ticketService.addPayment(id, { paymentTypeId, amount, idempotencyKey: req.body?.idempotencyKey, tenderedAmount: req.body?.tenderedAmount }, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/close — close ticket (idempotent)
router.post('/:id/close',
  requirePermission('pos.close_ticket'),
  idempotent('POST /api/tickets/:id/close'),
  auditLog('ticket.close', 'Ticket'),
  async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { expectedVersion, idempotencyKey } = parseOrThrow(closeTicketSchema, req.body || {});
    const ticket = await ticketService.closeTicket(id, req.user, { expectedVersion, idempotencyKey });
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id/print — generate print preview (requires pos.login)
router.get('/:id/print', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const result = await ticketService.printTicket(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =====================================================================
// Sprint 5 — Extended endpoints
// =====================================================================

// POST /api/tickets/:id/note — set ticket note (requires pos.add_order)
router.post('/:id/note', requirePermission('pos.add_order'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { note } = parseOrThrow(noteSchema, req.body || {});
    const ticket = await ticketServiceExt.setNote(id, note);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/gift — mark orders as Gift (CalculatePrice=false)
router.post('/:id/gift', requirePermission('pos.gift'), auditLog('ticket.gift', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { orderId, orderIds } = req.body || {};
    const ids = orderIds || (orderId ? [orderId] : []);
    const ticket = await ticketServiceExt.giftOrders(id, ids);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/void — void the entire ticket (idempotent)
router.post('/:id/void',
  requirePermission('pos.void'),
  idempotent('POST /api/tickets/:id/void'),
  auditLog('ticket.void', 'Ticket'),
  async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const ticket = await ticketServiceExt.voidTicket(id);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/tags — set ticket tags (requires pos.add_order)
router.post('/:id/tags', requirePermission('pos.add_order'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { tags } = parseOrThrow(tagsSchema, req.body || {});
    const ticket = await ticketServiceExt.setTags(id, tags);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/split — split ticket (move orders to new ticket)
router.post('/:id/split', requirePermission('pos.split'), auditLog('ticket.split', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { orderIds } = parseOrThrow(splitTicketSchema, req.body || {});
    const result = await ticketServiceExt.splitTicket(id, orderIds);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/refund — refund a closed ticket (idempotent)
router.post('/:id/refund',
  requirePermission('pos.refund'),
  idempotent('POST /api/tickets/:id/refund'),
  auditLog('ticket.refund', 'Ticket'),
  async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { amount, reason } = parseOrThrow(refundTicketSchema, req.body || {});
    const result = await ticketServiceExt.refundTicket(id, amount, reason);
    res.json({ data: result });
  } catch (err) { next(err); }
});

module.exports = router;
