// =====================================================================
// reports.js — Report routes
// =====================================================================
// FASE 14 — Reportes.
//
// Endpoints:
//   GET /api/reports/sales?startDate=&endDate=       — sales summary
//   GET /api/reports/top-products?startDate=&endDate= — top products
//   GET /api/reports/categories?startDate=&endDate=   — sales by category
//   GET /api/reports/users?startDate=&endDate=        — sales by user
//   GET /api/reports/payments?startDate=&endDate=     — payment breakdown
//   GET /api/reports/voids-refunds?startDate=&endDate= — void/refund summary
//   GET /api/reports/inventory?startDate=&endDate=    — inventory movements
//   GET /api/reports/cash-sessions?startDate=&endDate= — cash sessions
//   GET /api/reports/dashboard?startDate=&endDate=     — comprehensive report
// =====================================================================

const express = require('express');
const { ReportService } = require('../services/reportService');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const reportService = new ReportService();

// Helper: extract date range from query params
function getDateRange(req) {
  const today = new Date().toISOString().split('T')[0];
  const startDate = req.query.startDate || today;
  const endDate = req.query.endDate || today;
  return { startDate, endDate };
}

// All report endpoints require pos.login (minimum)
router.use(requirePermission('pos.login'));

// GET /api/reports/sales
router.get('/sales', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getSalesSummary(startDate, endDate);
    res.json({ data });
  } catch (err) { next(err); }
});

// GET /api/reports/top-products
router.get('/top-products', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const data = await reportService.getTopProducts(startDate, endDate, limit);
    res.json({ data, count: data.length });
  } catch (err) { next(err); }
});

// GET /api/reports/categories
router.get('/categories', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getSalesByCategory(startDate, endDate);
    res.json({ data, count: data.length });
  } catch (err) { next(err); }
});

// GET /api/reports/users
router.get('/users', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getSalesByUser(startDate, endDate);
    res.json({ data, count: data.length });
  } catch (err) { next(err); }
});

// GET /api/reports/payments
router.get('/payments', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getPaymentSummary(startDate, endDate);
    res.json({ data, count: data.length });
  } catch (err) { next(err); }
});

// GET /api/reports/voids-refunds
router.get('/voids-refunds', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getVoidRefundSummary(startDate, endDate);
    res.json({ data });
  } catch (err) { next(err); }
});

// GET /api/reports/inventory
router.get('/inventory', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getInventoryMovementSummary(startDate, endDate);
    res.json({ data, count: data.length });
  } catch (err) { next(err); }
});

// GET /api/reports/cash-sessions
router.get('/cash-sessions', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getCashSessionSummary(startDate, endDate);
    res.json({ data, count: data.length });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard — comprehensive report
router.get('/dashboard', async (req, res, next) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await reportService.getDashboardReport(startDate, endDate);
    res.json({ data });
  } catch (err) { next(err); }
});

module.exports = router;
