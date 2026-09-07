// =====================================================================
// tables.js — Express routes for /api/tables
// =====================================================================
// Endpoints:
//   GET    /api/tables           — list all tables
//   GET    /api/tables/:id       — get table by ID
//   PATCH  /api/tables/:id/state — update table state
// =====================================================================

const express = require('express');
const { TableRepository } = require('../../infrastructure/repositories/TableRepository');
const { TicketRepository } = require('../../infrastructure/repositories/TicketRepository');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const { requirePermission } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();
const tableRepo = new TableRepository();
const ticketRepo = new TicketRepository();

// GET /api/tables — list all (requires pos.login)
router.get('/', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const tables = await tableRepo.getTables();
    res.json({ data: tables, count: tables.length });
  } catch (err) { next(err); }
});

// GET /api/tables/:id — get by ID (requires pos.login)
router.get('/:id', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const table = await tableRepo.getTableById(id);
    if (!table) throw new NotFoundError(`Table ${id} not found`);
    res.json({ data: table });
  } catch (err) { next(err); }
});

// PATCH /api/tables/:id/state — update table state (requires pos.change_table)
router.patch('/:id/state', requirePermission('pos.change_table'), auditLog('table.changeState', 'Table'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { state, stateValue } = req.body || {};
    if (!state) throw new ValidationError('state is required');

    const table = await tableRepo.getTableById(id);
    if (!table) throw new NotFoundError(`Table ${id} not found`);

    // If trying to set to "Available" but there's an open ticket, conflict
    if (state === 'Available') {
      const openTicketIds = await ticketRepo.getOpenTicketIds(id);
      if (openTicketIds.length > 0) {
        throw new ConflictError(
          `Cannot mark table ${id} as Available: it has ${openTicketIds.length} open ticket(s)`,
          { openTicketIds }
        );
      }
    }

    const updatedStates = await tableRepo.updateEntityState(id, 'Status', state, stateValue || '');
    res.json({ data: { tableId: id, state, stateValue: stateValue || '', entityStates: updatedStates } });
  } catch (err) { next(err); }
});

module.exports = router;
