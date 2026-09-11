// =====================================================================
// errors.js — Client-side error reporting endpoint
// =====================================================================
// Bloque 7 — Endpoints:
//   POST   /api/errors            — receive batched client errors
//   GET    /api/errors            — list recent errors (admin only)
//   GET    /api/errors/stats      — aggregated stats (admin only)
//   DELETE /api/errors            — clear all (admin only)
//
// POST body:
//   { events: [{ id, timestamp, type, message, stack, url, line, col,
//                userId, view, session, shell: { platform, formFactor, orientation },
//                userAgent, href }] }
// =====================================================================

const express = require('express');
const { ValidationError } = require('../middleware/errorHandler');
const { requirePermission } = require('../middleware/rbac');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();

// POST /api/errors — public endpoint (no auth, since errors may happen pre-login)
router.post('/', async (req, res, next) => {
  try {
    const { events } = req.body || {};
    if (!Array.isArray(events)) {
      throw new ValidationError('events must be an array');
    }
    if (events.length === 0) {
      return res.json({ data: { received: 0 } });
    }
    if (events.length > 100) {
      throw new ValidationError('Max 100 events per request');
    }

    // Build rows for batch insert
    const now = new Date();
    const rows = events.map(e => ({
      EventId: String(e.id || '').slice(0, 60) || ('evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
      EventTimestamp: e.timestamp ? new Date(e.timestamp) : now,
      ServerTimestamp: now,
      Type: String(e.type || 'unknown').slice(0, 40),
      Message: String(e.message || '').slice(0, 65535),
      Stack: e.stack ? String(e.stack).slice(0, 65535) : null,
      Url: e.url ? String(e.url).slice(0, 1024) : null,
      Line: parseInt(e.line, 10) || null,
      Col: parseInt(e.col, 10) || null,
      UserId: parseInt(e.userId, 10) || null,
      View: e.view ? String(e.view).slice(0, 50) : null,
      Session: e.session ? String(e.session).slice(0, 60) : null,
      Platform: e.shell ? String(e.shell.platform || 'web').slice(0, 20) : 'web',
      FormFactor: e.shell ? String(e.shell.formFactor || 'desktop').slice(0, 20) : null,
      Orientation: e.shell ? String(e.shell.orientation || 'unknown').slice(0, 20) : null,
      UserAgent: e.userAgent ? String(e.userAgent).slice(0, 1024) : null,
      Href: e.href ? String(e.href).slice(0, 1024) : null,
    }));

    // Insert in batches of 50 (SQLite param limit safety)
    for (let i = 0; i < rows.length; i += 50) {
      await db('ClientErrors').insert(rows.slice(i, i + 50));
    }

    res.json({ data: { received: rows.length } });
  } catch (err) { next(err); }
});

// GET /api/errors — list recent errors (admin)
router.get('/', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    const type = req.query.type;
    const q = db('ClientErrors').orderBy('ServerTimestamp', 'desc').limit(limit).offset(offset);
    if (type) q.where({ Type: type });
    const errors = await q;
    const total = await db('ClientErrors').count('* as c').first();
    res.json({ data: errors, count: errors.length, total: total.c });
  } catch (err) { next(err); }
});

// GET /api/errors/stats — aggregated stats (admin)
router.get('/stats', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    // Count by type
    const byType = await db('ClientErrors')
      .where('ServerTimestamp', '>=', since)
      .select('Type')
      .count('* as count')
      .groupBy('Type');
    // Count by platform
    const byPlatform = await db('ClientErrors')
      .where('ServerTimestamp', '>=', since)
      .select('Platform')
      .count('* as count')
      .groupBy('Platform');
    // Total in last 24h
    const total24h = await db('ClientErrors')
      .where('ServerTimestamp', '>=', since)
      .count('* as c')
      .first();
    // Total all-time
    const totalAll = await db('ClientErrors').count('* as c').first();
    res.json({
      data: {
        last24h: total24h.c,
        total: totalAll.c,
        byType: byType.reduce((acc, r) => ({ ...acc, [r.Type]: r.count }), {}),
        byPlatform: byPlatform.reduce((acc, r) => ({ ...acc, [r.Platform]: r.count }), {}),
      },
    });
  } catch (err) { next(err); }
});

// DELETE /api/errors — clear all (admin)
router.delete('/', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const deleted = await db('ClientErrors').del();
    res.json({ data: { deleted } });
  } catch (err) { next(err); }
});

module.exports = router;
