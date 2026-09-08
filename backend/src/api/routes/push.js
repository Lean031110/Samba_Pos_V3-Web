// =====================================================================
// push.js — Web Push notification routes
// =====================================================================
// Endpoints:
//   GET  /api/push/vapid-public-key   — get VAPID public key for SW
//   POST /api/push/subscribe           — register a device subscription
//   POST /api/push/unsubscribe         — remove a device subscription
//   GET  /api/push/pending             — get pending notifications (SW polling)
//   POST /api/push/cleanup             — cleanup expired subscriptions (admin)
// =====================================================================

const express = require('express');
const pushService = require('../services/pushService');
const { ValidationError } = require('../middleware/errorHandler');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// GET /api/push/vapid-public-key — returns the VAPID public key for the browser
router.get('/vapid-public-key', async (req, res, next) => {
  try {
    const publicKey = await pushService.getVAPIDPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: 'VAPID not configured' });
    }
    res.json({ data: { publicKey } });
  } catch (err) { next(err); }
});

// POST /api/push/subscribe — register a push subscription
router.post('/subscribe', async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint) throw new ValidationError('endpoint is required');
    if (!keys || !keys.p256dh || !keys.auth) {
      throw new ValidationError('keys.p256dh and keys.auth are required');
    }
    const userId = req.user?.userId || 0;
    const categories = req.body.categories || 'system';
    const result = await pushService.subscribeDevice({
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      categories,
    });
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/push/unsubscribe — remove a push subscription
router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) throw new ValidationError('endpoint is required');
    const userId = req.user?.userId || 0;
    const result = await pushService.unsubscribeDevice(userId, endpoint);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/push/pending — get pending notifications for SW polling fallback
router.get('/pending', async (req, res, next) => {
  try {
    const userId = req.user?.userId || 0;
    const category = req.query.category || null;
    const notifications = await pushService.getPendingNotifications(userId, category);
    res.json({ data: notifications, count: notifications.length });
  } catch (err) { next(err); }
});

// POST /api/push/cleanup — cleanup expired subscriptions (admin only)
router.post('/cleanup', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const result = await pushService.cleanupExpired();
    res.json({ data: result });
  } catch (err) { next(err); }
});

module.exports = router;
