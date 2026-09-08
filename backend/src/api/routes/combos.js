// =====================================================================
// combos.js — Combo product routes
// =====================================================================
// BLOQUE D — Fase 4: Combos
//
// Endpoints:
//   GET    /api/combos                      — list all combos
//   GET    /api/combos/:id                   — get combo by ID with sub-items
//   GET    /api/combos/by-menu-item/:menuItemId — get combo by container MenuItem
//   POST   /api/combos                       — create combo
//   PATCH  /api/combos/:id                   — update combo metadata
//   PUT    /api/combos/:id/items             — replace combo items
//   DELETE /api/combos/:id                   — deactivate combo (soft delete)
// =====================================================================

const express = require('express');
const { ComboService } = require('../services/ComboService');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { withTransaction } = require('../../infrastructure/db/db');

const router = express.Router();
const comboService = new ComboService();

// GET /api/combos — list all
router.get('/', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    if (req.query.menuItemId) filter.menuItemId = parseInt(req.query.menuItemId, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const combos = await comboService.listCombos(filter, limit);
    res.json({ data: combos, count: combos.length });
  } catch (err) { next(err); }
});

// GET /api/combos/by-menu-item/:menuItemId — get by container MenuItem
router.get('/by-menu-item/:menuItemId', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const menuItemId = parseInt(req.params.menuItemId, 10);
    if (isNaN(menuItemId)) throw new ValidationError('menuItemId must be a number');
    const result = await comboService.getComboByMenuItemId(menuItemId);
    if (!result) throw new NotFoundError(`No active combo for MenuItem ${menuItemId}`);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/combos/:id — get by ID (with sub-items + computed prices)
router.get('/:id', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const result = await comboService.getCombo(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/combos — create combo
router.post('/',
  requirePermission('manage.inventory'),
  auditLog('combo.create', 'Combo'),
  async (req, res, next) => {
    try {
      const { menuItemId, name, items, comboPrice, useCustomPrice } = req.body || {};
      const result = await withTransaction(async (trx) => {
        return comboService.createCombo({
          menuItemId, name, items,
          comboPrice, useCustomPrice,
          userId: req.user?.userId || 0,
        }, trx);
      });
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  });

// PATCH /api/combos/:id — update metadata (name, comboPrice, useCustomPrice, isActive)
router.patch('/:id',
  requirePermission('manage.inventory'),
  auditLog('combo.update', 'Combo'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const result = await withTransaction(async (trx) => {
        return comboService.updateCombo(id, req.body || {}, trx);
      });
      res.json({ data: result });
    } catch (err) { next(err); }
  });

// PUT /api/combos/:id/items — replace all items
router.put('/:id/items',
  requirePermission('manage.inventory'),
  auditLog('combo.replaceItems', 'ComboItem'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const { items } = req.body || {};
      const result = await withTransaction(async (trx) => {
        return comboService.replaceItems(id, items || [], trx);
      });
      res.json({ data: result });
    } catch (err) { next(err); }
  });

// DELETE /api/combos/:id — soft delete
router.delete('/:id',
  requirePermission('manage.inventory'),
  auditLog('combo.deactivate', 'Combo'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('id must be a number');
      const result = await comboService.deactivateCombo(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

module.exports = router;
