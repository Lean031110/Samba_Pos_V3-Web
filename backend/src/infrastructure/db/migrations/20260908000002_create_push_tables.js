// =====================================================================
// Migration: 20260908000002_create_push_tables.js
// =====================================================================
// Creates formal Knex migrations for Web Push tables:
//   - PushSettings: VAPID keys and general push configuration
//   - PushSubscriptions: device subscriptions (one per browser/device)
//   - PushNotifications: notification log/queue for delivery tracking
//
// These replace the dynamic table creation that was in pushService.js
// (which was fragile and could fail silently).
// =====================================================================

exports.up = async function (knex) {
  // === PushSettings ===
  // Key-value store for push-related settings (VAPID keys, etc.)
  await knex.schema.createTable('PushSettings', (t) => {
    t.string('Key', 100).primary();
    t.text('Value').notNullable();
    t.timestamp('UpdatedAt').notNullable().defaultTo(knex.fn.now());
  });

  // === PushSubscriptions ===
  // One row per device/browser that has subscribed to push notifications.
  await knex.schema.createTable('PushSubscriptions', (t) => {
    t.increments('Id').primary();
    t.integer('UserId').notNullable();
    t.text('Endpoint').notNullable();          // Push API endpoint URL
    t.text('P256dhKey').notNullable();           // ECDH public key (base64url)
    t.text('AuthSecret').notNullable();          // Auth secret (base64url)
    t.string('Categories', 200).notNullable().defaultTo('system');
    t.integer('IsActive').notNullable().defaultTo(1);
    t.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    t.timestamp('UpdatedAt').notNullable().defaultTo(knex.fn.now());
    t.timestamp('ExpiredAt').nullable();         // set when endpoint returns 410/404
    t.unique(['UserId', 'Endpoint']);
    t.index(['IsActive'], 'IX_PushSubscriptions_Active');
    t.index(['Categories'], 'IX_PushSubscriptions_Categories');
  });

  // === PushNotifications ===
  // Log of all push notifications sent (or queued for polling fallback).
  // Used for:
  //   - Delivery tracking (SENT, FAILED, DELIVERED via polling)
  //   - Polling fallback for browsers without Web Push API
  //   - Audit trail
  await knex.schema.createTable('PushNotifications', (t) => {
    t.increments('Id').primary();
    t.integer('UserId').notNullable();
    t.integer('SubscriptionId').nullable();       // FK to PushSubscriptions (null = broadcast)
    t.string('Category', 50).notNullable().defaultTo('system');
    t.string('Title', 200).notNullable();
    t.text('Body').nullable();
    t.string('Icon', 200).nullable();
    t.string('Url', 500).nullable();
    t.string('Tag', 100).nullable();
    t.string('Status', 20).notNullable().defaultTo('PENDING'); // PENDING, SENT, FAILED, DELIVERED, EXPIRED
    t.text('ErrorMessage').nullable();
    t.integer('Attempts').notNullable().defaultTo(0);
    t.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    t.timestamp('SentAt').nullable();
    t.timestamp('DeliveredAt').nullable();
    t.index(['UserId', 'Status'], 'IX_PushNotifications_UserStatus');
    t.index(['Status'], 'IX_PushNotifications_Status');
    t.index(['CreatedAt'], 'IX_PushNotifications_CreatedAt');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('PushNotifications');
  await knex.schema.dropTableIfExists('PushSubscriptions');
  await knex.schema.dropTableIfExists('PushSettings');
};
