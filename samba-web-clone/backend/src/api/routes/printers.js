// =====================================================================
// printers.js — Printer management and print routes
// =====================================================================
// Endpoints:
//   GET    /api/printers                    — list all printers
//   GET    /api/printers/:id                — get printer by ID
//   GET    /api/printers/:id/status         — check if printer is online
//   POST   /api/printers/:id/test           — send test print
//   POST   /api/tickets/:id/print/send      — print ticket to configured printer
//   POST   /api/tickets/:id/print/kitchen   — print kitchen orders (routed)
// =====================================================================

const express = require('express');
const { PrinterManager } = require('../services/PrinterManager');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();
const printerManager = new PrinterManager();

// GET /api/printers — list all
router.get('/', async (req, res, next) => {
  try {
    const printers = await db('Printers').orderBy('Name');
    res.json({ data: printers, count: printers.length });
  } catch (err) { next(err); }
});

// GET /api/printers/:id — get by ID
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const printer = await db('Printers').where({ Id: id }).first();
    if (!printer) throw new NotFoundError(`Printer ${id} not found`);
    res.json({ data: printer });
  } catch (err) { next(err); }
});

// GET /api/printers/:id/status — check online status
router.get('/:id/status', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const result = await printerManager.checkStatus(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/printers/:id/test — send test print
router.post('/:id/test', requirePermission('manage.printers'), auditLog('printer.test', 'Printer'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const result = await printerManager.testPrint(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/printers — create a new printer
router.post('/', requirePermission('manage.printers'), auditLog('printer.create', 'Printer'), async (req, res, next) => {
  try {
    const { name, shareName, printerType, codePage, charsPerLine } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (!shareName) throw new ValidationError('shareName is required (host:port for TCP printers)');
    const [id] = await db('Printers').insert({
      Name: name,
      ShareName: shareName,
      PrinterType: printerType || 0,
      CodePage: codePage || 857,
      CharsPerLine: charsPerLine || 42,
    });
    const printer = await db('Printers').where({ Id: id }).first();
    res.status(201).json({ data: printer });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/print/send — print ticket to configured printer
// NOTE: This route is mounted on /api/tickets, not /api/printers
// But we define it here for logical grouping.
// Actually, this should be in tickets.js. Let's add it as a separate router.

// Print routing for tickets — mounted at /api/print/tickets/:id
router.post('/tickets/:id/send', requirePermission('pos.print'), auditLog('printer.ticket', 'Ticket'), async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) throw new ValidationError('id must be a number');
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

    // Load full ticket with orders, payments, entities
    const orders = await db('Orders').where({ TicketId: ticketId });
    const payments = await db('Payments').where({ TicketId: ticketId });
    const entities = await db('TicketEntities').where({ TicketId: ticketId });
    ticket.Orders = orders;
    ticket.Payments = payments;
    ticket.TicketEntities = entities;

    const results = await printerManager.routePrint(ticket, 'Print Bill');
    res.json({ data: results });
  } catch (err) { next(err); }
});

// POST /api/print/tickets/:id/kitchen — print kitchen orders (routed by station)
router.post('/tickets/:id/kitchen', requirePermission('pos.print'), auditLog('printer.kitchen', 'Ticket'), async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) throw new ValidationError('id must be a number');
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const entities = await db('TicketEntities').where({ TicketId: ticketId });
    ticket.Orders = orders;
    ticket.TicketEntities = entities;

    const results = await printerManager.routePrint(ticket, 'Print Orders to Kitchen Printer');
    res.json({ data: results });
  } catch (err) { next(err); }
});

module.exports = router;
