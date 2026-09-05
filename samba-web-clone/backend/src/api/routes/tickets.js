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

const router = express.Router();
const ticketService = new TicketService();
const ticketServiceExt = new TicketServiceExtended();

// GET /api/tickets — list open tickets
router.get('/', async (req, res, next) => {
  try {
    const tickets = await ticketService.getOpenTickets();
    res.json({ data: tickets, count: tickets.length });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id — get ticket by ID
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const ticket = await ticketService.getTicketById(id);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets — create new ticket
router.post('/', async (req, res, next) => {
  try {
    const { departmentId, ticketTypeId, tableId } = req.body || {};
    const ticket = await ticketService.createTicket({ departmentId, ticketTypeId, tableId });
    res.status(201).json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/merge — merge multiple tickets into one
// NOTE: must be defined BEFORE /:id routes to avoid path conflict
router.post('/merge', auditLog('ticket.merge', 'Ticket'), async (req, res, next) => {
  try {
    const { sourceTicketIds } = req.body || {};
    const result = await ticketServiceExt.mergeTickets(sourceTicketIds);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/orders — add order
router.post('/:id/orders', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { menuItemId, quantity, portionName } = req.body || {};
    const ticket = await ticketService.addOrder(id, { menuItemId, quantity, portionName }, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/calculations — add discount/service
router.post('/:id/calculations', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { calculationTypeId, amount } = req.body || {};
    const ticket = await ticketService.addCalculation(id, { calculationTypeId, amount }, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/payments — process payment
router.post('/:id/payments', auditLog('payment.process', 'Payment'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { paymentTypeId, amount, tenderedAmount, idempotencyKey } = req.body || {};
    const ticket = await ticketService.addPayment(id, { paymentTypeId, amount, tenderedAmount, idempotencyKey }, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/close — close ticket
router.post('/:id/close', auditLog('ticket.close', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const ticket = await ticketService.closeTicket(id, req.user);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id/print — generate print preview
router.get('/:id/print', async (req, res, next) => {
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

// POST /api/tickets/:id/note — set ticket note
router.post('/:id/note', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { note } = req.body || {};
    const ticket = await ticketServiceExt.setNote(id, note);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/gift — mark orders as Gift (CalculatePrice=false)
router.post('/:id/gift', auditLog('ticket.gift', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { orderId, orderIds } = req.body || {};
    const ids = orderIds || (orderId ? [orderId] : []);
    const ticket = await ticketServiceExt.giftOrders(id, ids);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/void — void the entire ticket
router.post('/:id/void', auditLog('ticket.void', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const ticket = await ticketServiceExt.voidTicket(id);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/tags — set ticket tags
router.post('/:id/tags', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { tags } = req.body || {};
    const ticket = await ticketServiceExt.setTags(id, tags);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/split — split ticket (move orders to new ticket)
router.post('/:id/split', auditLog('ticket.split', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { orderIds } = req.body || {};
    const result = await ticketServiceExt.splitTicket(id, orderIds);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/refund — refund a closed ticket
router.post('/:id/refund', auditLog('ticket.refund', 'Ticket'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { amount, reason } = req.body || {};
    const result = await ticketServiceExt.refundTicket(id, amount, reason);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

module.exports = router;
