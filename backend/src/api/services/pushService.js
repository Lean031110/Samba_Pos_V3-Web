// =====================================================================
// pushService.js — Web Push notification service (REAL implementation)
// =====================================================================
// FASE 9 — Web Push notifications via the 'web-push' npm package.
//
// This is a REAL Web Push implementation, not a polling fallback.
// Uses the web-push library which handles:
//   - VAPID JWT signing (RFC 8292)
//   - AES128GCM payload encryption (RFC 8291)
//   - HTTP POST to the push endpoint
//   - 404/410 response handling (expired subscriptions)
//
// VAPID keys are generated on first run and stored in PushSettings table.
// They can also be set via env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
//
// Polling fallback (/api/push/pending) is kept for browsers without
// Push API support (e.g., iOS Safari < 16.4), but push notifications
// are sent for REAL via the web-push library.
// =====================================================================

const webpush = require('web-push');
const { db } = require('../../infrastructure/db/db');

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@sambapos-lba.local';
let vapidConfigured = false;

/**
 * Configure web-push with VAPID keys.
 * Called once on server startup.
 */
async function configureVAPID() {
  if (vapidConfigured) return;

  let keys = null;

  // 1. Try env vars
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
    console.log('[push] Using VAPID keys from environment');
  } else {
    // 2. Try DB
    const row = await db('PushSettings').where({ Key: 'vapid_keys' }).first();
    if (row && row.Value) {
      keys = JSON.parse(row.Value);
      console.log('[push] Using VAPID keys from database');
    } else {
      // 3. Generate new keys and store in DB
      keys = webpush.generateVAPIDKeys();
      await db('PushSettings').insert({
        Key: 'vapid_keys',
        Value: JSON.stringify(keys),
      }).onConflict('Key').merge();
      console.log('[push] Generated new VAPID keys and stored in database');
    }
  }

  webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
  vapidConfigured = true;
}

/**
 * Get VAPID public key (for the browser to subscribe).
 */
async function getVAPIDPublicKey() {
  await configureVAPID();
  const row = await db('PushSettings').where({ Key: 'vapid_keys' }).first();
  if (row) {
    return JSON.parse(row.Value).publicKey;
  }
  // Fallback to env
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Subscribe a device to push notifications.
 */
async function subscribeDevice(params) {
  const { userId, endpoint, p256dh, auth, categories = 'system' } = params;
  if (!userId || !endpoint || !p256dh || !auth) {
    throw new Error('userId, endpoint, p256dh, auth are required');
  }

  const existing = await db('PushSubscriptions')
    .where({ UserId: userId, Endpoint: endpoint })
    .first();

  if (existing) {
    await db('PushSubscriptions').where({ Id: existing.Id }).update({
      P256dhKey: p256dh,
      AuthSecret: auth,
      Categories: categories,
      IsActive: 1,
      ExpiredAt: null,
      UpdatedAt: new Date().toISOString(),
    });
    return { subscriptionId: existing.Id, updated: true };
  }

  const [id] = await db('PushSubscriptions').insert({
    UserId: userId,
    Endpoint: endpoint,
    P256dhKey: p256dh,
    AuthSecret: auth,
    Categories: categories,
    IsActive: 1,
  });
  return { subscriptionId: id, updated: false };
}

/**
 * Unsubscribe a device.
 */
async function unsubscribeDevice(userId, endpoint) {
  // Mark as inactive rather than deleting (for audit)
  const updated = await db('PushSubscriptions')
    .where({ UserId: userId, Endpoint: endpoint })
    .update({ IsActive: 0, UpdatedAt: new Date().toISOString() });
  return { unsubscribed: updated > 0 };
}

/**
 * Send a push notification to all active subscribers matching the category.
 * Uses the web-push library to send REAL push messages via the Push API.
 *
 * @param {Object} params
 * @param {string} params.category — 'kitchen', 'printer', 'inventory', 'system', 'all'
 * @param {string} params.title
 * @param {string} params.body
 * @param {string} [params.icon] — icon URL
 * @param {string} [params.url] — URL to open on click
 * @param {string} [params.tag] — notification tag (for collapse/replace)
 * @returns {Promise<{sent: number, failed: number, expired: number}>}
 */
async function sendPushNotification(params) {
  await configureVAPID();
  const { category = 'system', title, body, icon = '/icons/icon-192.png', url = '/', tag } = params;

  // Find active subscriptions matching the category
  const subs = await db('PushSubscriptions')
    .where({ IsActive: 1 })
    .andWhere(function () {
      this.where('Categories', 'like', `%${category}%`)
          .orWhere('Categories', 'like', '%all%');
    });

  if (subs.length === 0) return { sent: 0, failed: 0, expired: 0 };

  const payload = JSON.stringify({
    title,
    body,
    icon,
    badge: '/icons/favicon.png',
    tag: tag || category,
    data: { url, category, timestamp: Date.now() },
    requireInteraction: category === 'kitchen' || category === 'printer',
  });

  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (const sub of subs) {
    const pushSubscription = {
      endpoint: sub.Endpoint,
      keys: {
        p256dh: sub.P256dhKey,
        auth: sub.AuthSecret,
      },
    };

    // Log the notification attempt
    const [notifId] = await db('PushNotifications').insert({
      UserId: sub.UserId,
      SubscriptionId: sub.Id,
      Category: category,
      Title: title,
      Body: body,
      Icon: icon,
      Url: url,
      Tag: tag || category,
      Status: 'PENDING',
      Attempts: 1,
    });

    try {
      const result = await webpush.sendNotification(pushSubscription, payload, {
        TTL: 86400, // 24h — message lives at push service if device offline
      });

      // Success (201 Created from push service)
      await db('PushNotifications').where({ Id: notifId }).update({
        Status: 'SENT',
        SentAt: new Date().toISOString(),
      });
      sent++;
    } catch (err) {
      const statusCode = err.statusCode;

      if (statusCode === 404 || statusCode === 410) {
        // Endpoint expired or no longer valid — mark subscription as expired
        await db('PushSubscriptions').where({ Id: sub.Id }).update({
          IsActive: 0,
          ExpiredAt: new Date().toISOString(),
        });
        await db('PushNotifications').where({ Id: notifId }).update({
          Status: 'EXPIRED',
          ErrorMessage: `Endpoint returned ${statusCode}`,
        });
        expired++;
      } else {
        // Other error (429 rate limit, 500 server error, etc.)
        await db('PushNotifications').where({ Id: notifId }).update({
          Status: 'FAILED',
          ErrorMessage: `HTTP ${statusCode}: ${err.body || err.message}`.slice(0, 500),
        });
        failed++;
      }
    }
  }

  return { sent, failed, expired };
}

/**
 * Get pending push notifications for a user (polling fallback).
 * Used by browsers without Push API support.
 */
async function getPendingNotifications(userId, category = null) {
  let query = db('PushNotifications')
    .where({ UserId: userId, Status: 'SENT' })
    .whereNull('DeliveredAt')
    .orderBy('CreatedAt', 'desc')
    .limit(20);

  if (category) {
    query = query.andWhere({ Category: category });
  }

  const notifications = await query;

  // Mark as delivered (polling fallback delivery confirmation)
  if (notifications.length > 0) {
    const ids = notifications.map(n => n.Id);
    await db('PushNotifications')
      .whereIn('Id', ids)
      .update({ Status: 'DELIVERED', DeliveredAt: new Date().toISOString() });
  }

  return notifications;
}

/**
 * Clean up old notifications and expired subscriptions.
 */
async function cleanupExpired() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  const oldNotifs = await db('PushNotifications')
    .where('CreatedAt', '<', cutoff.toISOString())
    .whereNot('Status', 'PENDING')
    .del();

  const expiredSubs = await db('PushSubscriptions')
    .where('IsActive', 0)
    .whereNotNull('ExpiredAt')
    .where('ExpiredAt', '<', cutoff.toISOString())
    .del();

  return { cleanedNotifications: oldNotifs, cleanedSubscriptions: expiredSubs };
}

module.exports = {
  configureVAPID,
  getVAPIDPublicKey,
  subscribeDevice,
  unsubscribeDevice,
  sendPushNotification,
  getPendingNotifications,
  cleanupExpired,
};
