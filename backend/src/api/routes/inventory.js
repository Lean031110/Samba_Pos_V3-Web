// =====================================================================
// inventory.js — Inventory management routes
// =====================================================================
// Endpoints:
//   GET  /api/inventory/ingredients                    — list all ingredients
//   GET  /api/inventory/ingredients/:id                — get ingredient by ID
//   POST /api/inventory/ingredients                    — create ingredient
//   GET  /api/inventory/units                          — list all units
//   GET  /api/inventory/recipes/:portionId             — get recipe for a portion
//   POST /api/inventory/recipes/:portionId             — save recipe
//   GET  /api/inventory/stock/:warehouseId             — stock balances for warehouse
//   GET  /api/inventory/stock/:warehouseId/low         — low stock alerts
//   GET  /api/inventory/movements                      — movement history (ledger)
//   POST /api/inventory/movements                      — manual movement (adjustment, waste, purchase)
//
// BLOQUE D — new endpoints:
//   POST /api/inventory/transfer                        — traspaso entre almacenes
//   GET  /api/inventory/transfers                       — list traspasos
//   GET  /api/inventory/transfers/:id                   — get traspaso by ID
//   POST /api/inventory/waste                           — merma (dedicated endpoint with reason)
//   POST /api/inventory/physical-count                  — create physical count session
//   GET  /api/inventory/physical-count                  — list sessions
//   GET  /api/inventory/physical-count/:id             — get session with items
//   PATCH /api/inventory/physical-count/:id/items/:ingredientId  — set counted qty
//   POST /api/inventory/physical-count/:id/finalize     — finalize + apply adjustments
//   GET  /api/inventory/kardex                          — kardex (ingredientId required)
// =====================================================================

const express = require('express');
const { InventoryService, MOVEMENT_TYPES } = require('../services/InventoryService');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();
const inventoryService = new InventoryService();

// GET /api/inventory/ingredients (requires pos.login)
router.get('/ingredients', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const ingredients = await db('Ingredients')
      .join('IngredientUnits', 'Ingredients.BaseUnitId', 'IngredientUnits.Id')
      .select('Ingredients.*', 'IngredientUnits.Code as BaseUnitCode', 'IngredientUnits.Name as BaseUnitName')
      .orderBy('Ingredients.Name');
    res.json({ data: ingredients, count: ingredients.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/ingredients/:id (requires pos.login)
router.get('/ingredients/:id', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const ingredient = await db('Ingredients').where({ Id: id }).first();
    if (!ingredient) throw new NotFoundError(`Ingredient ${id} not found`);
    res.json({ data: ingredient });
  } catch (err) { next(err); }
});

// POST /api/inventory/ingredients
router.post('/ingredients', requirePermission('manage.inventory'), auditLog('inventory.createIngredient', 'Ingredient'), async (req, res, next) => {
  try {
    const { name, code, groupCode, baseUnitId, minimumStock, costPerUnit } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (!baseUnitId) throw new ValidationError('baseUnitId is required');
    const [id] = await db('Ingredients').insert({
      Name: name, Code: code, GroupCode: groupCode,
      BaseUnitId: baseUnitId,
      MinimumStock: minimumStock || 0,
      CostPerUnit: costPerUnit || 0,
    });
    const ingredient = await db('Ingredients').where({ Id: id }).first();
    res.status(201).json({ data: ingredient });
  } catch (err) { next(err); }
});

// GET /api/inventory/units (requires pos.login)
router.get('/units', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const units = await db('IngredientUnits').orderBy('SortOrder');
    res.json({ data: units, count: units.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/recipes/:portionId (requires pos.login)
router.get('/recipes/:portionId', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const portionId = parseInt(req.params.portionId, 10);
    if (isNaN(portionId)) throw new ValidationError('portionId must be a number');
    const { recipe, items } = await inventoryService.getRecipe(portionId);
    res.json({ data: { recipe, items } });
  } catch (err) { next(err); }
});

// POST /api/inventory/recipes/:portionId
router.post('/recipes/:portionId', requirePermission('manage.inventory'), auditLog('inventory.saveRecipe', 'Recipe'), async (req, res, next) => {
  try {
    const portionId = parseInt(req.params.portionId, 10);
    if (isNaN(portionId)) throw new ValidationError('portionId must be a number');
    const { items, fixedCost } = req.body || {};
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    const result = await inventoryService.saveRecipe(portionId, items, fixedCost || 0);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/inventory/stock/:warehouseId (requires pos.login)
router.get('/stock/:warehouseId', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId, 10);
    if (isNaN(warehouseId)) throw new ValidationError('warehouseId must be a number');
    const balances = await inventoryService.getStockBalances(warehouseId);
    res.json({ data: balances, count: balances.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/stock/:warehouseId/low (requires pos.login)
router.get('/stock/:warehouseId/low', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId, 10);
    if (isNaN(warehouseId)) throw new ValidationError('warehouseId must be a number');
    const alerts = await inventoryService.getLowStockAlerts(warehouseId);
    res.json({ data: alerts, count: alerts.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/movements (requires pos.login)
router.get('/movements', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const ingredientId = req.query.ingredientId ? parseInt(req.query.ingredientId, 10) : null;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const movements = await inventoryService.getMovementHistory(ingredientId, warehouseId, limit);
    res.json({ data: movements, count: movements.length });
  } catch (err) { next(err); }
});

// POST /api/inventory/movements — manual movement (adjustment, waste, purchase)
router.post('/movements', requirePermission('manage.inventory'), auditLog('inventory.movement', 'StockMovement'), async (req, res, next) => {
  try {
    const {
      ingredientId, warehouseId, unitId,
      movementType, quantity, unitCost,
      supplierId, reference, notes,
    } = req.body || {};

    if (!ingredientId) throw new ValidationError('ingredientId is required');
    if (!warehouseId) throw new ValidationError('warehouseId is required');
    if (!movementType) throw new ValidationError('movementType is required');
    if (typeof quantity !== 'number') throw new ValidationError('quantity must be a number');

    const result = await inventoryService.recordMovement({
      ingredientId, warehouseId, unitId,
      movementType, quantity, unitCost: unitCost || 0,
      supplierId, reference, notes,
      userId: req.user?.userId || 0,
    });
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// =====================================================================
// BLOQUE D — Traspasos entre almacenes
// =====================================================================

// POST /api/inventory/transfer — traspaso entre almacenes
router.post('/transfer', requirePermission('inventory.transfer'), auditLog('inventory.transfer', 'WarehouseTransfer'), async (req, res, next) => {
  try {
    const { fromWarehouseId, toWarehouseId, items, transferNumber, notes } = req.body || {};
    const result = await db.transaction(async (trx) => {
      return inventoryService.transferStock({
        fromWarehouseId, toWarehouseId, items,
        transferNumber, notes,
        userId: req.user?.userId || 0,
      }, trx);
    });
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/inventory/transfers — list traspasos
router.get('/transfers', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.fromWarehouseId) filter.fromWarehouseId = parseInt(req.query.fromWarehouseId, 10);
    if (req.query.toWarehouseId) filter.toWarehouseId = parseInt(req.query.toWarehouseId, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const transfers = await inventoryService.listTransfers(filter, limit);
    res.json({ data: transfers, count: transfers.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/transfers/:id — get traspaso by ID
router.get('/transfers/:id', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const result = await inventoryService.getTransfer(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =====================================================================
// BLOQUE D — Merma (waste)
// =====================================================================

// POST /api/inventory/waste — dedicated waste endpoint
router.post('/waste', requirePermission('inventory.adjust'), auditLog('inventory.waste', 'StockMovement'), async (req, res, next) => {
  try {
    const { ingredientId, warehouseId, unitId, quantity, reason, notes } = req.body || {};
    const result = await db.transaction(async (trx) => {
      return inventoryService.recordWaste({
        ingredientId, warehouseId, unitId, quantity, reason, notes,
        userId: req.user?.userId || 0,
      }, trx);
    });
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// =====================================================================
// BLOQUE D — Inventario físico (physical count)
// =====================================================================

// POST /api/inventory/physical-count — create session
router.post('/physical-count', requirePermission('inventory.adjust'), auditLog('inventory.physicalCount.create', 'PhysicalCountSession'), async (req, res, next) => {
  try {
    const { warehouseId, name } = req.body || {};
    const result = await db.transaction(async (trx) => {
      return inventoryService.createPhysicalCountSession({
        warehouseId, name, userId: req.user?.userId || 0,
      }, trx);
    });
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/inventory/physical-count — list sessions
router.get('/physical-count', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.warehouseId) filter.warehouseId = parseInt(req.query.warehouseId, 10);
    if (req.query.status) filter.status = req.query.status;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const sessions = await inventoryService.listPhysicalCountSessions(filter, limit);
    res.json({ data: sessions, count: sessions.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/physical-count/:id — get session with items
router.get('/physical-count/:id', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const result = await inventoryService.getPhysicalCountSession(id);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// PATCH /api/inventory/physical-count/:id/items/:ingredientId — set counted qty
router.patch('/physical-count/:id/items/:ingredientId', requirePermission('inventory.adjust'), auditLog('inventory.physicalCount.setItem', 'PhysicalCountItem'), async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const ingredientId = parseInt(req.params.ingredientId, 10);
    const { countedQuantity, notes } = req.body || {};
    if (typeof countedQuantity !== 'number') {
      throw new ValidationError('countedQuantity must be a number');
    }
    const result = await db.transaction(async (trx) => {
      return inventoryService.setCountedQuantity(sessionId, ingredientId, countedQuantity, notes, trx);
    });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/inventory/physical-count/:id/finalize — finalize + apply adjustments
router.post('/physical-count/:id/finalize', requirePermission('inventory.adjust'), auditLog('inventory.physicalCount.finalize', 'PhysicalCountSession'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db.transaction(async (trx) => {
      return inventoryService.finalizePhysicalCountSession(id, req.user?.userId || 0, trx);
    });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =====================================================================
// BLOQUE D — Kardex (inventory movement ledger with running balance)
// =====================================================================

// GET /api/inventory/kardex?ingredientId=&warehouseId=&from=&to=
router.get('/kardex', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const ingredientId = req.query.ingredientId ? parseInt(req.query.ingredientId, 10) : null;
    if (!ingredientId) throw new ValidationError('ingredientId query param is required');
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId, 10) : null;
    const from = req.query.from || null;
    const to = req.query.to || null;
    const result = await inventoryService.getKardex({ ingredientId, warehouseId, from, to });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =====================================================================
// BLOQUE 5 — Warehouses CRUD
// =====================================================================

// GET /api/inventory/warehouses — list all warehouses
router.get('/warehouses', requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const warehouses = await db('Warehouses')
      .leftJoin('WarehouseTypes', 'Warehouses.WarehouseTypeId', 'WarehouseTypes.Id')
      .select('Warehouses.*', 'WarehouseTypes.Name as WarehouseTypeName')
      .orderBy('Warehouses.SortOrder');
    res.json({ data: warehouses, count: warehouses.length });
  } catch (err) { next(err); }
});

// POST /api/inventory/warehouses — create warehouse
router.post('/warehouses', requirePermission('manage.inventory'), auditLog('inventory.warehouse.create', 'Warehouse'), async (req, res, next) => {
  try {
    const { name, code, warehouseTypeId, sortOrder } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    const [id] = await db('Warehouses').insert({
      Name: name,
      WarehouseTypeId: warehouseTypeId || 1,
      SortOrder: sortOrder || 0,
    });
    const warehouse = await db('Warehouses').where({ Id: id }).first();
    res.status(201).json({ data: warehouse });
  } catch (err) { next(err); }
});

// PATCH /api/inventory/warehouses/:id — update warehouse
router.patch('/warehouses/:id', requirePermission('manage.inventory'), auditLog('inventory.warehouse.update', 'Warehouse'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { name, warehouseTypeId, sortOrder } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.Name = name;
    if (warehouseTypeId !== undefined) updates.WarehouseTypeId = warehouseTypeId;
    if (sortOrder !== undefined) updates.SortOrder = sortOrder;
    if (Object.keys(updates).length === 0) throw new ValidationError('No valid fields to update');
    await db('Warehouses').where({ Id: id }).update(updates);
    const warehouse = await db('Warehouses').where({ Id: id }).first();
    if (!warehouse) throw new NotFoundError(`Warehouse ${id} not found`);
    res.json({ data: warehouse });
  } catch (err) { next(err); }
});

// DELETE /api/inventory/warehouses/:id — delete warehouse (only if no stock)
router.delete('/warehouses/:id', requirePermission('manage.inventory'), auditLog('inventory.warehouse.delete', 'Warehouse'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    // Check if any stock balance references this warehouse
    const stockCount = await db('StockBalances').where({ WarehouseId: id }).count('* as c').first();
    if (stockCount && stockCount.c > 0) {
      throw new ValidationError('Cannot delete warehouse with existing stock. Move or zero out stock first.');
    }
    await db('Warehouses').where({ Id: id }).del();
    res.json({ data: { deleted: true, id } });
  } catch (err) { next(err); }
});

module.exports = router;
