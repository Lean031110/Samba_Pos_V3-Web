// =====================================================================
// printers.js — Printer management and print routes
// =====================================================================
// Endpoints:
//   GET    /api/printers                       — list all printers
//   POST   /api/printers                       — create a printer
//   GET    /api/printers/:id                   — get printer by ID
//   GET    /api/printers/:id/status            — check if printer is online
//   POST   /api/printers/:id/test              — send test print
//
//   GET    /api/print/areas                    — list print areas
//   GET    /api/print/areas/:id                — get print area
//   POST   /api/print/areas                    — create print area
//   PATCH  /api/print/areas/:id                — update print area
//   DELETE /api/print/areas/:id                — delete print area
//
//   GET    /api/print/routing-rules            — list routing rules
//   POST   /api/print/routing-rules            — create routing rule
//   DELETE /api/print/routing-rules/:id        — delete routing rule
//
//   GET    /api/print/jobs                     — list print job instances
//   GET    /api/print/jobs/:id                 — get job instance by ID
//   POST   /api/print/jobs/:id/cancel          — cancel a pending job
//   POST   /api/print/jobs/:id/reprint         — reprint (creates new job)
//   GET    /api/print/stats                    — queue stats by status
//
//   POST   /api/print/tickets/:id/send         — print ticket receipt (routed)
//   POST   /api/print/tickets/:id/kitchen      — print kitchen orders (routed)
//   POST   /api/print/tickets/:id/receipt     — print receipt after payment
// =====================================================================

const express = require('express');
const crypto = require('crypto');
const { PrinterManager, EscPosRenderer } = require('../services/PrinterManager');
const { PrintQueue } = require('../services/PrintQueue');
const { PrintRouter } = require('../services/PrintRouter');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();
const printerManager = new PrinterManager();
const printQueue = new PrintQueue();
const printRouter = new PrintRouter();

// =====================================================================
// Printers CRUD
// =====================================================================

// GET /api/printers — list all (requires manage.printers)
router.get('/', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const printers = await db('Printers').orderBy('SortOrder').orderBy('Name');
    res.json({ data: printers, count: printers.length });
  } catch (err) { next(err); }
});

// POST /api/printers — create a new printer
router.post('/',
  requirePermission('manage.printers'),
  auditLog('printer.create', 'Printer'),
  async (req, res, next) => {
    try {
      const {
        name, shareName, printerType, codePage, charsPerLine,
        printAreaId, isActive, sortOrder,
      } = req.body || {};
      if (!name) throw new ValidationError('name is required');
      if (!shareName) throw new ValidationError('shareName is required (host:port for TCP printers)');
      const [id] = await db('Printers').insert({
        Name: name,
        ShareName: shareName,
        PrinterType: printerType || 0,
        CodePage: codePage || 857,
        CharsPerLine: charsPerLine || 42,
        PrintAreaId: printAreaId || null,
        IsActive: isActive === false ? 0 : 1,
        SortOrder: sortOrder || 0,
      });
      const printer = await db('Printers').where({ Id: id }).first();
      res.status(201).json({ data: printer });
    } catch (err) { next(err); }
  });

// =====================================================================
// Print Areas CRUD (must be defined BEFORE /:id to avoid route shadowing)
// =====================================================================

// GET /api/print/areas/list
router.get('/areas/list', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const areas = await db('PrintAreas').orderBy('SortOrder');
    res.json({ data: areas, count: areas.length });
  } catch (err) { next(err); }
});

// POST /api/print/areas
router.post('/areas',
  requirePermission('manage.printers'),
  auditLog('printarea.create', 'PrintArea'),
  async (req, res, next) => {
    try {
      const { name, displayName, description, areaType, color, sortOrder } = req.body || {};
      if (!name) throw new ValidationError('name is required');
      const [id] = await db('PrintAreas').insert({
        Name: name,
        DisplayName: displayName || name,
        Description: description || null,
        AreaType: areaType || 'OTHER',
        Color: color || '#2196F3',
        SortOrder: sortOrder || 0,
        IsActive: 1,
      });
      const area = await db('PrintAreas').where({ Id: id }).first();
      res.status(201).json({ data: area });
    } catch (err) { next(err); }
  });

// =====================================================================
// Print Routing Rules CRUD (must be defined BEFORE /:id)
// =====================================================================

// GET /api/print/routing-rules/list
router.get('/routing-rules/list', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const rules = await db('PrintRoutingRules').orderBy('Priority', 'desc');
    res.json({ data: rules, count: rules.length });
  } catch (err) { next(err); }
});

// POST /api/print/routing-rules
router.post('/routing-rules',
  requirePermission('manage.printers'),
  auditLog('printrule.create', 'PrintRoutingRule'),
  async (req, res, next) => {
    try {
      const {
        ruleType, matchValue, menuItemId, printAreaId, printerId, priority,
      } = req.body || {};
      if (!ruleType) throw new ValidationError('ruleType is required');
      if (!printAreaId) throw new ValidationError('printAreaId is required');
      const validTypes = ['GROUP_CODE', 'MENU_ITEM', 'TAG', 'DEFAULT'];
      if (!validTypes.includes(ruleType)) {
        throw new ValidationError(`ruleType must be one of: ${validTypes.join(', ')}`);
      }
      const [id] = await db('PrintRoutingRules').insert({
        RuleType: ruleType,
        MatchValue: matchValue || null,
        MenuItemId: menuItemId || null,
        PrintAreaId: printAreaId,
        PrinterId: printerId || null,
        Priority: priority || 0,
        IsActive: 1,
      });
      const rule = await db('PrintRoutingRules').where({ Id: id }).first();
      res.status(201).json({ data: rule });
    } catch (err) { next(err); }
  });

// DELETE /api/print/routing-rules/:id
router.delete('/routing-rules/:id',
  requirePermission('manage.printers'),
  auditLog('printrule.delete', 'PrintRoutingRule'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const deleted = await db('PrintRoutingRules').where({ Id: id }).del();
      if (deleted === 0) throw new NotFoundError(`Routing rule ${id} not found`);
      res.json({ data: { deleted: true, id } });
    } catch (err) { next(err); }
  });

// =====================================================================
// Printer Templates CRUD — BLOQUE F (P2: template editor)
// =====================================================================

// GET /api/print/templates/list — list all templates
router.get('/templates/list', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    let query = db('PrinterTemplates').orderBy('TemplateType').orderBy('Name');
    if (req.query.type) {
      query = query.where({ TemplateType: req.query.type });
    }
    if (req.query.includeInactive !== 'true') {
      query = query.where({ IsActive: 1 });
    }
    const templates = await query;
    res.json({ data: templates, count: templates.length });
  } catch (err) { next(err); }
});

// GET /api/print/templates/:id — get template by ID
router.get('/templates/:id', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const template = await db('PrinterTemplates').where({ Id: id }).first();
    if (!template) throw new NotFoundError(`Template ${id} not found`);
    res.json({ data: template });
  } catch (err) { next(err); }
});

// POST /api/print/templates — create a new template
router.post('/templates',
  requirePermission('manage.printers'),
  auditLog('printtemplate.create', 'PrinterTemplate'),
  async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!body.name) throw new ValidationError('name is required');
      if (!body.templateType) throw new ValidationError('templateType is required');
      const validTypes = ['RECEIPT', 'KITCHEN_ORDER', 'TEST', 'CUSTOM'];
      if (!validTypes.includes(body.templateType)) {
        throw new ValidationError(`templateType must be one of: ${validTypes.join(', ')}`);
      }
      const [id] = await db('PrinterTemplates').insert({
        Name: body.name,
        TemplateType: body.templateType,
        Template: body.template || '',
        Description: body.description || null,
        MergeLines: body.mergeLines || 0,
        PrinterId: body.printerId || null,
        IsActive: 1,
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      });
      const created = await db('PrinterTemplates').where({ Id: id }).first();
      res.status(201).json({ data: created });
    } catch (err) { next(err); }
  });

// PATCH /api/print/templates/:id — update template
router.patch('/templates/:id',
  requirePermission('manage.printers'),
  auditLog('printtemplate.update', 'PrinterTemplate'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const existing = await db('PrinterTemplates').where({ Id: id }).first();
      if (!existing) throw new NotFoundError(`Template ${id} not found`);

      const allowed = {};
      const body = req.body || {};
      if (body.name !== undefined) allowed.Name = body.name;
      if (body.templateType !== undefined) {
        const validTypes = ['RECEIPT', 'KITCHEN_ORDER', 'TEST', 'CUSTOM'];
        if (!validTypes.includes(body.templateType)) {
          throw new ValidationError(`templateType must be one of: ${validTypes.join(', ')}`);
        }
        allowed.TemplateType = body.templateType;
      }
      if (body.template !== undefined) allowed.Template = body.template;
      if (body.description !== undefined) allowed.Description = body.description;
      if (body.mergeLines !== undefined) allowed.MergeLines = body.mergeLines;
      if (body.printerId !== undefined) allowed.PrinterId = body.printerId;
      if (body.isActive !== undefined) allowed.IsActive = body.isActive ? 1 : 0;
      allowed.UpdatedAt = new Date().toISOString();

      if (Object.keys(allowed).length > 1) {
        await db('PrinterTemplates').where({ Id: id }).update(allowed);
      }
      const updated = await db('PrinterTemplates').where({ Id: id }).first();
      res.json({ data: updated });
    } catch (err) { next(err); }
  });

// DELETE /api/print/templates/:id — soft delete (IsActive=0)
router.delete('/templates/:id',
  requirePermission('manage.printers'),
  auditLog('printtemplate.delete', 'PrinterTemplate'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const template = await db('PrinterTemplates').where({ Id: id }).first();
      if (!template) throw new NotFoundError(`Template ${id} not found`);
      await db('PrinterTemplates').where({ Id: id }).update({
        IsActive: 0,
        UpdatedAt: new Date().toISOString(),
      });
      res.json({ data: { id, isActive: false } });
    } catch (err) { next(err); }
  });

// POST /api/print/templates/:id/preview — render template with sample data
router.post('/templates/:id/preview',
  requirePermission('manage.printers'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const template = await db('PrinterTemplates').where({ Id: id }).first();
      if (!template) throw new NotFoundError(`Template ${id} not found`);

      const sampleData = generateSampleData(template.TemplateType);
      const renderer = new EscPosRenderer({ charsPerLine: 42, codePage: 857 });
      let bytes;
      if (template.TemplateType === 'KITCHEN_ORDER') {
        bytes = renderer.renderKitchenOrder(sampleData);
      } else if (template.TemplateType === 'TEST') {
        bytes = renderer.renderTestPrint('Sample Printer');
      } else {
        bytes = renderer.render(sampleData, template);
      }
      res.json({
        data: {
          templateId: id,
          templateType: template.TemplateType,
          bytesHex: bytes.toString('hex'),
          bytesLength: bytes.length,
          sampleData,
        },
      });
    } catch (err) { next(err); }
  });

/**
 * Generate sample ticket/kitchen data for template preview.
 */
function generateSampleData(type) {
  if (type === 'KITCHEN_ORDER') {
    return {
      TicketId: 999,
      TicketNumber: 'SAMPLE-001',
      TableName: 'Mesa 5',
      CreatedAt: new Date().toISOString(),
      State: 'NEW',
      Items: [
        { Quantity: 2, MenuItemName: 'Hamburguesa Clásica', PortionName: 'Normal', Notes: 'Sin cebolla' },
        { Quantity: 1, MenuItemName: 'Papas Fritas', PortionName: 'Grande', Notes: '' },
        { Quantity: 3, MenuItemName: 'Coca Cola', PortionName: '500ml', Notes: 'Sin hielo' },
      ],
    };
  }
  return {
    Id: 999,
    TicketNumber: 'SAMPLE-001',
    Date: new Date().toISOString(),
    LastModifiedUserName: 'Administrator',
    TotalAmount: 25.50,
    RemainingAmount: 0,
    Orders: [
      { Quantity: 2, Price: 5.00, MenuItemName: 'Hamburguesa Clásica', PortionName: 'Normal', CalculatePrice: 1 },
      { Quantity: 1, Price: 3.50, MenuItemName: 'Papas Fritas', PortionName: 'Grande', CalculatePrice: 1 },
      { Quantity: 3, Price: 2.00, MenuItemName: 'Coca Cola', PortionName: '500ml', CalculatePrice: 1 },
    ],
    Payments: [
      { Amount: 25.50, Name: 'Cash' },
    ],
    TicketEntities: [{ EntityName: 'Mesa 5' }],
  };
}

// =====================================================================
// Print Job Instances (queue monitoring) — defined BEFORE /:id
// =====================================================================

// GET /api/print/jobs — list job instances (with optional filters)
router.get('/jobs/list', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.printerId) filter.printerId = parseInt(req.query.printerId, 10);
    if (req.query.ticketId) filter.ticketId = parseInt(req.query.ticketId, 10);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const jobs = await printQueue.list(filter, limit);
    res.json({ data: jobs, count: jobs.length });
  } catch (err) { next(err); }
});

// GET /api/print/jobs/:id
router.get('/jobs/:id', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const job = await printQueue.get(id);
    res.json({ data: job });
  } catch (err) { next(err); }
});

// POST /api/print/jobs/:id/cancel
router.post('/jobs/:id/cancel',
  requirePermission('manage.printers'),
  auditLog('printjob.cancel', 'PrintJobInstance'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const reason = req.body?.reason || 'Cancelled by operator';
      const job = await printQueue.cancel(id, reason);
      res.json({ data: job });
    } catch (err) { next(err); }
  });

// POST /api/print/jobs/:id/reprint
router.post('/jobs/:id/reprint',
  requirePermission('pos.print'),
  auditLog('printjob.reprint', 'PrintJobInstance'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const original = await printQueue.get(id);
      // Create a new PrintJobInstance with the same payload but a new
      // idempotency key (so it doesn't dedupe against the original).
      const idempotencyKey = `reprint:${original.Uuid}:${Date.now()}`;
      const newJob = await printQueue.enqueue({
        printerId: original.PrinterId,
        jobType: 'REPRINT',
        payload: original.Payload,
        idempotencyKey,
        ticketId: original.TicketId,
        orderId: original.OrderId,
        userId: req.user?.userId,
        fallbackPrinterId: original.FallbackPrinterId,
        printAreaId: original.PrintAreaId,
      });
      res.status(201).json({ data: newJob });
    } catch (err) { next(err); }
  });

// GET /api/print/stats/list — queue health
router.get('/stats/list', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const stats = await printQueue.getStats();
    const pending = await printQueue.countPending();
    const retryReady = await printQueue.countRetryReady();
    res.json({ data: { byStatus: stats, pending, retryReady } });
  } catch (err) { next(err); }
});

// =====================================================================
// Printers (parameterized routes — defined AFTER all static routes
// so they don't shadow /areas/*, /routing-rules/*, /jobs/*, /stats/*)
// =====================================================================

// GET /api/printers/:id — get by ID
router.get('/:id', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const printer = await db('Printers').where({ Id: id }).first();
    if (!printer) throw new NotFoundError(`Printer ${id} not found`);
    res.json({ data: printer });
  } catch (err) { next(err); }
});

// GET /api/printers/:id/status — check online status
router.get('/:id/status', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const result = await printerManager.checkStatus(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/printers/:id/test — send test print (creates a PrintJobInstance)
router.post('/:id/test',
  requirePermission('manage.printers'),
  auditLog('printer.test', 'Printer'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const printer = await printerManager.getPrinter(id);
      const renderer = new EscPosRenderer({
        charsPerLine: printer.CharsPerLine || 42,
        codePage: printer.CodePage || 857,
      });
      const payload = renderer.renderTestPrint(printer.Name);
      const idempotencyKey = req.body?.idempotencyKey
        || `test:${id}:${Date.now()}`;
      const job = await printQueue.enqueue({
        printerId: id,
        jobType: 'REPRINT',
        payload,
        idempotencyKey,
        userId: req.user?.userId,
      });
      res.status(202).json({
        data: {
          jobId: job.Id,
          jobUuid: job.Uuid,
          status: job.Status,
          payloadSize: job.PayloadSize,
          checksum: job.Checksum,
        },
      });
    } catch (err) { next(err); }
  });

// PATCH /api/printers/:id — update a printer
router.patch('/:id',
  requirePermission('manage.printers'),
  auditLog('printer.update', 'Printer'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const allowed = ['Name', 'ShareName', 'PrinterType', 'CodePage',
                      'CharsPerLine', 'PrintAreaId', 'IsActive', 'SortOrder'];
      const updates = {};
      for (const k of allowed) {
        if (req.body && req.body[k] !== undefined) updates[k] = req.body[k];
      }
      if (Object.keys(updates).length === 0) {
        throw new ValidationError('No valid fields to update');
      }
      await db('Printers').where({ Id: id }).update(updates);
      const printer = await db('Printers').where({ Id: id }).first();
      res.json({ data: printer });
    } catch (err) { next(err); }
  });

// =====================================================================
// Ticket print routing — uses PrintRouter + PrintQueue
// =====================================================================

// POST /api/print/tickets/:id/send — print ticket receipt (routed)
router.post('/tickets/:id/send',
  requirePermission('pos.print'),
  auditLog('printer.ticket', 'Ticket'),
  async (req, res, next) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) throw new ValidationError('id must be a number');
      const ticket = await db('Tickets').where({ Id: ticketId }).first();
      if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

      const orders = await db('Orders').where({ TicketId: ticketId });
      const payments = await db('Payments').where({ TicketId: ticketId });
      const entities = await db('TicketEntities').where({ TicketId: ticketId });
      ticket.Orders = orders;
      ticket.Payments = payments;
      ticket.TicketEntities = entities;

      // Resolve the receipt printer via the router
      const target = await printRouter.resolveReceiptPrinter();
      if (!target) throw new NotFoundError('No receipt printer configured');

      // Render ESC/POS bytes
      const printer = await printerManager.getPrinter(target.printerId);
      const renderer = new EscPosRenderer({
        charsPerLine: printer.CharsPerLine || 42,
        codePage: printer.CodePage || 857,
      });
      const payload = renderer.render(ticket);

      // Enqueue (idempotent by ticketId + 'receipt')
      const idempotencyKey = req.body?.idempotencyKey
        || `receipt:ticket:${ticketId}`;
      const job = await printQueue.enqueue({
        printerId: target.printerId,
        jobType: 'RECEIPT',
        payload,
        idempotencyKey,
        ticketId,
        userId: req.user?.userId,
        printAreaId: target.printAreaId,
      });

      res.status(202).json({
        data: {
          jobId: job.Id,
          jobUuid: job.Uuid,
          status: job.Status,
          printerId: target.printerId,
          areaName: target.areaName,
          payloadSize: job.PayloadSize,
          checksum: job.Checksum,
        },
      });
    } catch (err) { next(err); }
  });

// POST /api/print/tickets/:id/kitchen — print kitchen orders (routed by station)
router.post('/tickets/:id/kitchen',
  requirePermission('pos.print'),
  auditLog('printer.kitchen', 'Ticket'),
  async (req, res, next) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) throw new ValidationError('id must be a number');
      const ticket = await db('Tickets').where({ Id: ticketId }).first();
      if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

      const orders = await db('Orders').where({ TicketId: ticketId });
      const entities = await db('TicketEntities').where({ TicketId: ticketId });
      ticket.Orders = orders;
      ticket.TicketEntities = entities;

      // Group orders by their target printer
      const groups = await printRouter.groupOrdersByPrinter(orders);
      if (groups.length === 0) {
        throw new NotFoundError('No kitchen printers matched for ticket orders');
      }

      // Enqueue a KITCHEN_ORDER job per printer
      const jobs = [];
      for (const g of groups) {
        const printer = await printerManager.getPrinter(g.printerId);
        const renderer = new EscPosRenderer({
          charsPerLine: printer.CharsPerLine || 42,
          codePage: printer.CodePage || 857,
        });
        const kitchenOrder = {
          TicketId: ticket.Id,
          TicketNumber: ticket.TicketNumber,
          TableName: entities[0]?.EntityName || '',
          CreatedAt: new Date().toISOString(),
          State: 'NEW',
          Items: g.orders.map(o => ({
            Quantity: o.Quantity,
            MenuItemName: o.MenuItemName,
            PortionName: o.PortionName,
            Notes: o.Tag,
          })),
        };
        const payload = renderer.renderKitchenOrder(kitchenOrder);
        const idempotencyKey = `kitchen:ticket:${ticketId}:printer:${g.printerId}`;
        const job = await printQueue.enqueue({
          printerId: g.printerId,
          jobType: 'KITCHEN_ORDER',
          payload,
          idempotencyKey,
          ticketId,
          userId: req.user?.userId,
          printAreaId: g.printAreaId,
        });
        jobs.push({
          jobId: job.Id,
          jobUuid: job.Uuid,
          status: job.Status,
          printerId: g.printerId,
          areaName: g.areaName,
          itemsCount: g.orders.length,
          payloadSize: job.PayloadSize,
          checksum: job.Checksum,
        });
      }

      res.status(202).json({ data: jobs });
    } catch (err) { next(err); }
  });

// POST /api/print/tickets/:id/receipt — alias for /send (post-payment receipt)
router.post('/tickets/:id/receipt',
  requirePermission('pos.print'),
  auditLog('printer.receipt', 'Ticket'),
  async (req, res, next) => {
    // Same logic as /send but with stricter idempotency (post-payment)
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) throw new ValidationError('id must be a number');
      const ticket = await db('Tickets').where({ Id: ticketId }).first();
      if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

      // Verify the ticket is closed (paid) before printing the receipt
      if (ticket.RemainingAmount > 0) {
        throw new ValidationError(
          `Ticket ${ticketId} is not fully paid (remaining: ${ticket.RemainingAmount})`,
          { remaining: ticket.RemainingAmount }
        );
      }

      const orders = await db('Orders').where({ TicketId: ticketId });
      const payments = await db('Payments').where({ TicketId: ticketId });
      const entities = await db('TicketEntities').where({ TicketId: ticketId });
      ticket.Orders = orders;
      ticket.Payments = payments;
      ticket.TicketEntities = entities;

      const target = await printRouter.resolveReceiptPrinter();
      if (!target) throw new NotFoundError('No receipt printer configured');

      const printer = await printerManager.getPrinter(target.printerId);
      const renderer = new EscPosRenderer({
        charsPerLine: printer.CharsPerLine || 42,
        codePage: printer.CodePage || 857,
      });
      const payload = renderer.render(ticket);

      // Strict idempotency: receipt for a closed ticket should only print once
      const idempotencyKey = `receipt:closed:${ticketId}`;
      const job = await printQueue.enqueue({
        printerId: target.printerId,
        jobType: 'RECEIPT',
        payload,
        idempotencyKey,
        ticketId,
        userId: req.user?.userId,
        printAreaId: target.printAreaId,
      });

      res.status(202).json({
        data: {
          jobId: job.Id,
          jobUuid: job.Uuid,
          status: job.Status,
          printerId: target.printerId,
          areaName: target.areaName,
          payloadSize: job.PayloadSize,
          checksum: job.Checksum,
          isReprint: job.Attempts > 0 || job.PrintedAt !== null,
        },
      });
    } catch (err) { next(err); }
  });

module.exports = router;
