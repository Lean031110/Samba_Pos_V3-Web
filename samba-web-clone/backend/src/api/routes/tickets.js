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
const { ValidationError } = require('../middleware/errorHandler');

const router = express.Router();
const ticketService = new TicketService();

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

// POST /api/tickets/:id/orders — add order
router.post('/:id/orders', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { menuItemId, quantity, portionName } = req.body || {};
    const ticket = await ticketService.addOrder(id, { menuItemId, quantity, portionName });
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/calculations — add discount/service
router.post('/:id/calculations', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { calculationTypeId, amount } = req.body || {};
    const ticket = await ticketService.addCalculation(id, { calculationTypeId, amount });
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/payments — process payment
router.post('/:id/payments', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { paymentTypeId, amount, tenderedAmount } = req.body || {};
    const ticket = await ticketService.addPayment(id, { paymentTypeId, amount, tenderedAmount });
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/close — close ticket
router.post('/:id/close', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const ticket = await ticketService.closeTicket(id);
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

module.exports = router;
