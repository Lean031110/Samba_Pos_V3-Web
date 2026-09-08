// =====================================================================
// cash-sessions.js — Routes for WorkPeriod + CashSession (FASE 3)
// =====================================================================
// Endpoints:
//   WorkPeriod:
//     POST /api/work-periods/open
//     POST /api/work-periods/close
//     POST /api/work-periods/:id/reopen       (admin only)
//     GET  /api/work-periods/current
//     GET  /api/work-periods                   (list all)
//
//   CashSession:
//     POST /api/cash-sessions/open
//     POST /api/cash-sessions/:id/close
//     POST /api/cash-sessions/:id/payout
//     POST /api/cash-sessions/:id/transfer
//     GET  /api/cash-sessions/current          (current user's terminal)
//     GET  /api/cash-sessions                  (list)
//     GET  /api/cash-sessions/:id/events       (ledger)
// =====================================================================

const express = require('express');
const { z } = require('zod');
const cashSessionService = require('../services/CashSessionService');
const { requirePermission } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLog');
const { ValidationError, parseOrThrow: _ } = require('../middleware/schemas');

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? ` (at ${first.path.join('.')})` : '';
    throw new ValidationError(`${first.message}${path}`);
  }
  return result.data;
}

const router = express.Router();

// --- Schemas ---
const openWorkPeriodSchema = z.object({
  openingAmount: z.number().nonnegative().optional().default(0),
  description: z.string().max(500).optional(),
}).strict();

const closeWorkPeriodSchema = z.object({
  expectedAmount: z.number().nonnegative(),
  actualAmount: z.number().nonnegative(),
  description: z.string().max(500).optional(),
}).strict();

const reopenWorkPeriodSchema = z.object({
  reason: z.string().min(1).max(500),
}).strict();

const openCashSessionSchema = z.object({
  terminalId: z.number().int().nonnegative().optional().default(0),
  openingAmount: z.number().nonnegative().optional().default(0),
  workPeriodId: z.number().int().positive().optional(),
}).strict();

const closeCashSessionSchema = z.object({
  countedAmount: z.number().nonnegative(),
  note: z.string().max(500).optional(),
}).strict();

const payoutSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).strict();

const transferSchema = z.object({
  amount: z.number().refine(v => v !== 0, 'must be non-zero'),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).strict();

// =====================================================================
// WorkPeriod routes
// =====================================================================

router.post('/work-periods/open',
  requirePermission('pos.open_ticket'), // any logged-in POS user; in FASE 4 we'll add manage.workperiods
  auditLog('workperiod.open', 'WorkPeriod'),
  async (req, res, next) => {
    try {
      const parsed = parseOrThrow(openWorkPeriodSchema, req.body || {});
      const wp = await cashSessionService.openWorkPeriod({
        userId: req.user.userId,
        ...parsed,
      });
      res.status(201).json({ data: wp.toRow() });
    } catch (err) { next(err); }
  });

router.post('/work-periods/close',
  requirePermission('pos.close_ticket'),
  auditLog('workperiod.close', 'WorkPeriod'),
  async (req, res, next) => {
    try {
      const parsed = parseOrThrow(closeWorkPeriodSchema, req.body || {});
      const wp = await cashSessionService.closeWorkPeriod({
        userId: req.user.userId,
        ...parsed,
      });
      res.json({ data: wp.toRow() });
    } catch (err) { next(err); }
  });

router.post('/work-periods/:id/reopen',
  requirePermission('admin.all'),
  auditLog('workperiod.reopen', 'WorkPeriod'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
      const { reason } = parseOrThrow(reopenWorkPeriodSchema, req.body || {});
      const wp = await cashSessionService.reopenWorkPeriod({
        workPeriodId: id,
        userId: req.user.userId,
        reason,
      });
      res.json({ data: wp.toRow() });
    } catch (err) { next(err); }
  });

router.get('/work-periods/current',
  requirePermission('cash.manage'),
  async (req, res, next) => {
    try {
      const wp = await cashSessionService.getCurrentWorkPeriod();
      res.json({ data: wp ? wp.toRow() : null });
    } catch (err) { next(err); }
  });

router.get('/work-periods',
  requirePermission('reports.view'),
  async (req, res, next) => {
    try {
      const list = await require('../../infrastructure/db/db').db('WorkPeriods')
        .orderBy('StartDate', 'desc')
        .limit(50);
      res.json({ data: list, count: list.length });
    } catch (err) { next(err); }
  });

// =====================================================================
// CashSession routes
// =====================================================================

router.post('/cash-sessions/open',
  requirePermission('cash.manage'),
  auditLog('cashsession.open', 'CashSession'),
  async (req, res, next) => {
    try {
      const parsed = parseOrThrow(openCashSessionSchema, req.body || {});
      const cs = await cashSessionService.openCashSession({
        userId: req.user.userId,
        ...parsed,
      });
      res.status(201).json({ data: cs.toRow() });
    } catch (err) { next(err); }
  });

router.post('/cash-sessions/:id/close',
  requirePermission('pos.close_ticket'),
  auditLog('cashsession.close', 'CashSession'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
      const parsed = parseOrThrow(closeCashSessionSchema, req.body || {});
      const cs = await cashSessionService.closeCashSession({
        sessionId: id,
        userId: req.user.userId,
        ...parsed,
      });
      res.json({ data: cs.toRow() });
    } catch (err) { next(err); }
  });

router.post('/cash-sessions/:id/payout',
  requirePermission('pos.payment'),
  auditLog('cashsession.payout', 'CashSession'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
      const parsed = parseOrThrow(payoutSchema, req.body || {});
      const result = await cashSessionService.payout({
        sessionId: id,
        userId: req.user.userId,
        ...parsed,
      });
      res.json({ data: result, duplicate: result.duplicate });
    } catch (err) { next(err); }
  });

router.post('/cash-sessions/:id/transfer',
  requirePermission('pos.payment'),
  auditLog('cashsession.transfer', 'CashSession'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
      const parsed = parseOrThrow(transferSchema, req.body || {});
      const result = await cashSessionService.transfer({
        sessionId: id,
        userId: req.user.userId,
        ...parsed,
      });
      res.json({ data: result, duplicate: result.duplicate });
    } catch (err) { next(err); }
  });

router.get('/cash-sessions/current',
  requirePermission('cash.manage'),
  async (req, res, next) => {
    try {
      const terminalId = parseInt(req.query.terminalId, 10) || 0;
      const cs = await cashSessionService.getCurrentCashSession(terminalId);
      res.json({ data: cs ? cs.toRow() : null });
    } catch (err) { next(err); }
  });

router.get('/cash-sessions',
  requirePermission('reports.view'),
  async (req, res, next) => {
    try {
      const list = await require('../../infrastructure/db/db').db('CashSessions')
        .orderBy('OpenedAt', 'desc')
        .limit(50);
      res.json({ data: list, count: list.length });
    } catch (err) { next(err); }
  });

router.get('/cash-sessions/:id/events',
  requirePermission('reports.view'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
      const events = await cashSessionService.getCashSessionEvents(id);
      res.json({ data: events, count: events.length });
    } catch (err) { next(err); }
  });

module.exports = router;
