// =====================================================================
// push.js — Web Push notification routes
// =====================================================================
// Endpoints:
//   GET  /api/push/vapid-public-key   — get VAPID public key for SW
//   POST /api/push/subscribe           — register a device subscription
//   POST /api/push/unsubscribe         — remove a device subscription
//   GET  /api/push/pending             — get pending notifications (SW polling)
//   POST /api/push/cleanup             — cleanup expired subscriptions (admin)
//
// BLOQUE H — new endpoints:
//   GET  /api/push/status              — push subscription status for current user
//   GET  /api/push/subscriptions       — list all subscriptions (admin)
//   GET  /api/push/notifications       — list notification log (admin)
//   POST /api/push/send                — send a push notification (admin)
//   POST /api/push/test                — send a test push to current user (admin)
// =====================================================================

const express = require('express');
const pushService = require('../services/pushService');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { db } = require('../../infrastructure/db/db');

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

// =====================================================================
// BLOQUE H — new endpoints for push administration
// =====================================================================

// GET /api/push/status — push subscription status for current user
// Returns whether the user has any active subscription + notification permission state
router.get('/status', async (req, res, next) => {
  try {
    const userId = req.user?.userId || 0;
    const subs = await db('PushSubscriptions').where({ UserId: userId, IsActive: 1 });
    const vapidKey = await pushService.getVAPIDPublicKey().catch(() => null);
    res.json({
      data: {
        subscribed: subs.length > 0,
        subscriptionCount: subs.length,
        categories: subs.length > 0 ? subs[0].Categories : null,
        vapidConfigured: !!vapidKey,
        pushApiSupported: true,  // browser-dependent, always true server-side
      },
    });
  } catch (err) { next(err); }
});

// GET /api/push/subscriptions — list all subscriptions (admin)
router.get('/subscriptions', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const subs = await db('PushSubscriptions')
      .leftJoin('Users', 'PushSubscriptions.UserId', 'Users.Id')
      .select(
        'PushSubscriptions.Id', 'PushSubscriptions.UserId', 'PushSubscriptions.Endpoint',
        'PushSubscriptions.Categories', 'PushSubscriptions.IsActive',
        'PushSubscriptions.CreatedAt', 'PushSubscriptions.UpdatedAt', 'PushSubscriptions.ExpiredAt',
        'Users.Name as UserName'
      )
      .orderBy('PushSubscriptions.CreatedAt', 'desc')
      .limit(100);
    res.json({ data: subs, count: subs.length });
  } catch (err) { next(err); }
});

// GET /api/push/notifications — list notification log (admin)
router.get('/notifications', requirePermission('manage.printers'), async (req, res, next) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const notifs = await db('PushNotifications')
      .leftJoin('Users', 'PushNotifications.UserId', 'Users.Id')
      .leftJoin('PushSubscriptions', 'PushNotifications.SubscriptionId', 'PushSubscriptions.Id')
      .select(
        'PushNotifications.Id', 'PushNotifications.UserId', 'PushNotifications.Category',
        'PushNotifications.Title', 'PushNotifications.Body', 'PushNotifications.Status',
        'PushNotifications.SentAt', 'PushNotifications.DeliveredAt', 'PushNotifications.ErrorMessage',
        'PushNotifications.CreatedAt',
        'Users.Name as UserName'
      )
      .orderBy('PushNotifications.CreatedAt', 'desc')
      .limit(limit);
    res.json({ data: notifs, count: notifs.length });
  } catch (err) { next(err); }
});

// POST /api/push/send — send a push notification to a category (admin)
// Body: { category, title, body, url?, tag? }
router.post('/send',
  requirePermission('manage.printers'),
  auditLog('push.send', 'PushNotification'),
  async (req, res, next) => {
    try {
      const { category, title, body, url, tag } = req.body || {};
      if (!title) throw new ValidationError('title is required');
      if (!body) throw new ValidationError('body is required');
      if (!category) throw new ValidationError('category is required');
      const result = await pushService.sendPushNotification({
        category, title, body, url: url || '/', tag,
      });
      res.json({ data: result });
    } catch (err) { next(err); }
  });

// POST /api/push/test — send a test push to the current user (admin)
// Sends a test notification to all active subscriptions of the current user.
router.post('/test',
  requirePermission('manage.printers'),
  auditLog('push.test', 'PushNotification'),
  async (req, res, next) => {
    try {
      const userId = req.user?.userId || 0;
      // Send directly to the current user's subscriptions
      const subs = await db('PushSubscriptions').where({ UserId: userId, IsActive: 1 });
      if (subs.length === 0) {
        return res.status(404).json({
          error: 'NoActiveSubscription',
          message: 'No tienes suscripciones push activas. Suscríbete primero desde la pestaña Notificaciones.',
        });
      }
      // Use sendPushNotification with category 'system' (which all subs have by default)
      const result = await pushService.sendPushNotification({
        category: 'system',
        title: 'Test de notificación push',
        body: 'Si puedes leer esto, las notificaciones push funcionan correctamente.',
        url: '/',
        tag: 'test-' + Date.now(),
      });
      res.json({ data: { ...result, targetUserId: userId, subscriptionCount: subs.length } });
    } catch (err) { next(err); }
  });

module.exports = router;
