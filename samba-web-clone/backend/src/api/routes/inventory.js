// =====================================================================
// inventory.js — Inventory management routes
// =====================================================================
// Endpoints:
//   GET  /api/inventory/ingredients           — list all ingredients
//   GET  /api/inventory/ingredients/:id       — get ingredient by ID
//   POST /api/inventory/ingredients           — create ingredient
//   GET  /api/inventory/units                 — list all units
//   GET  /api/inventory/recipes/:portionId    — get recipe for a portion
//   POST /api/inventory/recipes/:portionId    — save recipe
//   GET  /api/inventory/stock/:warehouseId    — stock balances for warehouse
//   GET  /api/inventory/stock/:warehouseId/low — low stock alerts
//   GET  /api/inventory/movements             — movement history (ledger)
//   POST /api/inventory/movements             — record manual movement (adjustment, waste, purchase)
// =====================================================================

const express = require('express');
const { InventoryService, MOVEMENT_TYPES } = require('../services/InventoryService');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();
const inventoryService = new InventoryService();

// GET /api/inventory/ingredients
router.get('/ingredients', async (req, res, next) => {
  try {
    const ingredients = await db('Ingredients')
      .join('IngredientUnits', 'Ingredients.BaseUnitId', 'IngredientUnits.Id')
      .select('Ingredients.*', 'IngredientUnits.Code as BaseUnitCode', 'IngredientUnits.Name as BaseUnitName')
      .orderBy('Ingredients.Name');
    res.json({ data: ingredients, count: ingredients.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/ingredients/:id
router.get('/ingredients/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const ingredient = await db('Ingredients').where({ Id: id }).first();
    if (!ingredient) throw new NotFoundError(`Ingredient ${id} not found`);
    res.json({ data: ingredient });
  } catch (err) { next(err); }
});

// POST /api/inventory/ingredients
router.post('/ingredients', auditLog('inventory.createIngredient', 'Ingredient'), async (req, res, next) => {
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

// GET /api/inventory/units
router.get('/units', async (req, res, next) => {
  try {
    const units = await db('IngredientUnits').orderBy('SortOrder');
    res.json({ data: units, count: units.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/recipes/:portionId
router.get('/recipes/:portionId', async (req, res, next) => {
  try {
    const portionId = parseInt(req.params.portionId, 10);
    if (isNaN(portionId)) throw new ValidationError('portionId must be a number');
    const { recipe, items } = await inventoryService.getRecipe(portionId);
    res.json({ data: { recipe, items } });
  } catch (err) { next(err); }
});

// POST /api/inventory/recipes/:portionId
router.post('/recipes/:portionId', auditLog('inventory.saveRecipe', 'Recipe'), async (req, res, next) => {
  try {
    const portionId = parseInt(req.params.portionId, 10);
    if (isNaN(portionId)) throw new ValidationError('portionId must be a number');
    const { items, fixedCost } = req.body || {};
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    const result = await inventoryService.saveRecipe(portionId, items, fixedCost || 0);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/inventory/stock/:warehouseId
router.get('/stock/:warehouseId', async (req, res, next) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId, 10);
    if (isNaN(warehouseId)) throw new ValidationError('warehouseId must be a number');
    const balances = await inventoryService.getStockBalances(warehouseId);
    res.json({ data: balances, count: balances.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/stock/:warehouseId/low
router.get('/stock/:warehouseId/low', async (req, res, next) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId, 10);
    if (isNaN(warehouseId)) throw new ValidationError('warehouseId must be a number');
    const alerts = await inventoryService.getLowStockAlerts(warehouseId);
    res.json({ data: alerts, count: alerts.length });
  } catch (err) { next(err); }
});

// GET /api/inventory/movements
router.get('/movements', async (req, res, next) => {
  try {
    const ingredientId = req.query.ingredientId ? parseInt(req.query.ingredientId, 10) : null;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const movements = await inventoryService.getMovementHistory(ingredientId, warehouseId, limit);
    res.json({ data: movements, count: movements.length });
  } catch (err) { next(err); }
});

// POST /api/inventory/movements — manual movement (adjustment, waste, purchase)
router.post('/movements', auditLog('inventory.movement', 'StockMovement'), async (req, res, next) => {
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

module.exports = router;
