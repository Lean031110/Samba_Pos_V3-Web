// =====================================================================
// products.js — Express routes for /api/products
// =====================================================================
// Endpoints:
//   GET  /api/products              — list all menu items
//   GET  /api/products/:id          — get menu item by ID
//   GET  /api/products/group/:code  — filter by GroupCode
// =====================================================================

const express = require('express');
const { ProductRepository } = require('../../infrastructure/repositories/ProductRepository');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
const productRepo = new ProductRepository();

// GET /api/products — list all
router.get('/', async (req, res, next) => {
  try {
    const items = await productRepo.getMenuItems();
    res.json({ data: items, count: items.length });
  } catch (err) { next(err); }
});

// GET /api/products/group/:code — filter by GroupCode
router.get('/group/:code', async (req, res, next) => {
  try {
    const code = req.params.code;
    if (!code) throw new ValidationError('group code is required');
    const items = await productRepo.getMenuItemsByGroupCode(code);
    res.json({ data: items, count: items.length });
  } catch (err) { next(err); }
});

// GET /api/products/:id — get by ID
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const item = await productRepo.getMenuItemById(id);
    if (!item) throw new NotFoundError(`MenuItem ${id} not found`);
    res.json({ data: item });
  } catch (err) { next(err); }
});

module.exports = router;
