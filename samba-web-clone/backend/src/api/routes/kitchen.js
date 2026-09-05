// =====================================================================
// kitchen.js — Kitchen Display System routes
// =====================================================================
// Endpoints:
//   GET    /api/kitchen/stations           — list all stations
//   GET    /api/kitchen/orders             — active kitchen orders
//   GET    /api/kitchen/orders/:stationId  — orders for a station
//   POST   /api/kitchen/orders/:id/state   — update order state (with version)
//   POST   /api/kitchen/orders/:id/bump    — mark as READY
//   POST   /api/kitchen/orders/:id/serve   — mark as SERVED
//   POST   /api/kitchen/orders/:id/void    — void an order
//   POST   /api/kitchen/orders/:id/recall  — recall a served order
//   GET    /api/kitchen/stats/:stationId   — station statistics
// =====================================================================

const express = require('express');
const { KitchenService } = require('../services/KitchenService');
const { ValidationError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();
const kitchenService = new KitchenService();

// GET /api/kitchen/stations
router.get('/stations', async (req, res, next) => {
  try {
    const stations = await kitchenService.getStations();
    res.json({ data: stations, count: stations.length });
  } catch (err) { next(err); }
});

// GET /api/kitchen/orders
router.get('/orders', async (req, res, next) => {
  try {
    const stationId = req.query.stationId ? parseInt(req.query.stationId, 10) : null;
    const orders = await kitchenService.getActiveOrders(stationId);
    res.json({ data: orders, count: orders.length });
  } catch (err) { next(err); }
});

// GET /api/kitchen/stats/:stationId
router.get('/stats/:stationId', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.stationId, 10);
    if (isNaN(stationId)) throw new ValidationError('stationId must be a number');
    const stats = await kitchenService.getStationStats(stationId);
    res.json({ data: stats });
  } catch (err) { next(err); }
});

// POST /api/kitchen/orders/:id/state — update state (with optimistic locking)
router.post('/orders/:id/state', auditLog('kitchen.updateState', 'KitchenOrder'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { state, expectedVersion } = req.body || {};
    const result = await kitchenService.updateOrderState(
      id, state, req.user?.userId || 0,
      expectedVersion !== undefined ? expectedVersion : null
    );
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/kitchen/orders/:id/bump
router.post('/orders/:id/bump', auditLog('kitchen.bump', 'KitchenOrder'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { expectedVersion } = req.body || {};
    const result = await kitchenService.bumpOrder(
      id, req.user?.userId || 0,
      expectedVersion !== undefined ? expectedVersion : null
    );
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/kitchen/orders/:id/serve
router.post('/orders/:id/serve', auditLog('kitchen.serve', 'KitchenOrder'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { expectedVersion } = req.body || {};
    const result = await kitchenService.serveOrder(
      id, req.user?.userId || 0,
      expectedVersion !== undefined ? expectedVersion : null
    );
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/kitchen/orders/:id/void — void from kitchen (propagates to POS)
router.post('/orders/:id/void', auditLog('kitchen.void', 'KitchenOrder'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { expectedVersion } = req.body || {};
    // voidOrderFromKitchen: marks KDS as VOIDED + propagates to POS order
    const result = await kitchenService.voidOrderFromKitchen(
      id, req.user?.userId || 0,
      expectedVersion !== undefined ? expectedVersion : null
    );
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/kitchen/orders/:id/recall
router.post('/orders/:id/recall', auditLog('kitchen.recall', 'KitchenOrder'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { expectedVersion } = req.body || {};
    const result = await kitchenService.recallOrder(
      id, req.user?.userId || 0,
      expectedVersion !== undefined ? expectedVersion : null
    );
    res.json({ data: result });
  } catch (err) { next(err); }
});

module.exports = router;
