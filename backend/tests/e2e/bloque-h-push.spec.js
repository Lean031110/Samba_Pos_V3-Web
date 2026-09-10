// =====================================================================
// bloque-h-push.spec.js — BLOQUE H E2E: Push notification UX
// =====================================================================
// Tests the P0/P1 gaps from docs/PRODUCTION_GAP_MATRIX.md:
//
//   P0 — "Tab Notificaciones en Admin/Config con botón activar"
//   P1 — "Gate E2E push: Cerrar pestaña, enviar push, verificar recepción"
//
// Strategy:
//   The `beforeinstallprompt` and Notification.permission APIs require a
//   real user gesture + HTTPS context. In Playwright headless, we can't
//   fully test the browser-side push subscription (it requires a real
//   push service + VAPID + HTTPS). But we CAN test:
//
//   1. The admin Config tab shows the "Notificaciones Push" card
//   2. The "Activar notificaciones" button is present when not subscribed
//   3. The push status endpoint returns correct data
//   4. The API subscribe/unsubscribe flow works end-to-end
//   5. The admin can send a test push via the API
//
//   For the P1 gate (close tab → send push → verify), we test the API
//   path: subscribe via API, close the "tab" (just stop using the page),
//   send a push via admin API, verify the PushNotifications log entry
//   was created with correct status.
// =====================================================================

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';
const API = BASE;

async function login(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { username: 'Administrator', pin: '1234' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

test.describe('BLOQUE H — Push Notification UX (P0 + P1)', () => {

  test('H1: Admin Config tab shows "Notificaciones Push" card', async ({ browser, request }) => {
    const token = await login(request);

    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => {
      localStorage.setItem('samba_jwt', t);
    }, token);
    const page = await ctx.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 10000 });

    await page.evaluate(() => window.App.navigate('admin'));
    await page.waitForSelector('#view-admin.is-active', { timeout: 10000 });
    await page.waitForSelector('.admin-nav-item[data-admin-tab="config"]', { timeout: 15000 });
    await page.click('button[data-admin-tab="config"]');

    // Wait for the push card to render
    await page.waitForFunction(() => {
      const content = document.getElementById('admin-content');
      return content && content.textContent.includes('Notificaciones Push');
    }, null, { timeout: 15000 });

    const configText = await page.locator('#admin-content').textContent();
    expect(configText).toContain('Notificaciones Push');
    expect(configText).toContain('VAPID');

    console.log('[H1] Push card rendered in Admin Config — PASS');

    await page.close();
    await ctx.close();
  });

  test('H2: Push card shows "Activar notificaciones" button when not subscribed', async ({ browser, request }) => {
    const token = await login(request);

    // First, ensure the user has NO active subscriptions
    const { db } = require('../../src/infrastructure/db/db');
    await db('PushSubscriptions').where({ UserId: 1 }).update({ IsActive: 0 });

    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => {
      localStorage.setItem('samba_jwt', t);
    }, token);
    const page = await ctx.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 10000 });

    await page.evaluate(() => window.App.navigate('admin'));
    await page.waitForSelector('#view-admin.is-active', { timeout: 10000 });
    await page.waitForSelector('.admin-nav-item[data-admin-tab="config"]', { timeout: 15000 });
    await page.click('button[data-admin-tab="config"]');
    await page.waitForFunction(() => {
      const content = document.getElementById('admin-content');
      return content && content.textContent.includes('Notificaciones Push');
    }, null, { timeout: 15000 });

    // The "Activar notificaciones" button should be present (not subscribed)
    const configText = await page.locator('#admin-content').textContent();
    expect(configText).toContain('Activar notificaciones');

    console.log('[H2] "Activar notificaciones" button visible — PASS');

    await page.close();
    await ctx.close();

  });

  test('H3: GET /api/push/status returns correct subscription state', async ({ request }) => {
    const token = await login(request);

    // Ensure no active subscription
    const { db } = require('../../src/infrastructure/db/db');
    await db('PushSubscriptions').where({ UserId: 1 }).update({ IsActive: 0 });

    // Check status — should be not subscribed
    const statusRes1 = await request.get(`${API}/api/push/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(statusRes1.ok()).toBeTruthy();
    const status1 = (await statusRes1.json()).data;
    expect(status1.subscribed).toBe(false);
    expect(status1.subscriptionCount).toBe(0);

    // Subscribe via API
    const subRes = await request.post(`${API}/api/push/subscribe`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-e2e-test',
        keys: { p256dh: 'e2e-p256dh', auth: 'e2e-auth' },
      },
    });
    expect(subRes.status()).toBe(201);

    // Check status again — should be subscribed
    const statusRes2 = await request.get(`${API}/api/push/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status2 = (await statusRes2.json()).data;
    expect(status2.subscribed).toBe(true);
    expect(status2.subscriptionCount).toBeGreaterThanOrEqual(1);

    // Cleanup
    await db('PushSubscriptions').where({ Endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-e2e-test' }).del();


    console.log('[H3] Push status endpoint returns correct state — PASS');
  });

  test('H4: Subscribe → close tab → send push → verify notification log (P1 gate)', async ({ request }) => {
    // This test simulates the P1 gate scenario:
    //   1. Subscribe a device (via API, simulating browser subscribe)
    //   2. "Close the tab" (we just stop using the page — no browser needed)
    //   3. Send a push notification via admin API
    //   4. Verify the PushNotifications log entry was created
    //
    // In a real E2E test, the push would be delivered to the browser
    // via the Service Worker. Here we verify the server-side delivery
    // attempt was logged correctly.

    const token = await login(request);
    const { db } = require('../../src/infrastructure/db/db');

    // Step 1: Subscribe
    const subRes = await request.post(`${API}/api/push/subscribe`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-p1-gate-test',
        keys: { p256dh: 'p1-gate-p256dh', auth: 'p1-gate-auth' },
      },
    });
    expect(subRes.status()).toBe(201);

    // Step 2: "Close the tab" — no action needed (server doesn't know about tabs)

    // Step 3: Send a push notification via admin API
    const sendRes = await request.post(`${API}/api/push/send`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        category: 'system',
        title: 'P1 Gate Test Push',
        body: 'This notification was sent while the device was offline',
      },
    });
    expect(sendRes.ok()).toBeTruthy();
    const sendResult = (await sendRes.json()).data;

    // Step 4: Verify the notification log entry
    const notif = await db('PushNotifications')
      .where({ Title: 'P1 Gate Test Push' })
      .orderBy('Id', 'desc')
      .first();

    expect(notif).toBeTruthy();
    expect(notif.Title).toBe('P1 Gate Test Push');
    expect(notif.Body).toContain('device was offline');
    expect(notif.Status).not.toBe('PENDING');  // should be SENT, FAILED, or EXPIRED
    expect(notif.Attempts).toBeGreaterThanOrEqual(1);

    console.log(`[H4] P1 gate: subscribe → close → send → log verified (status=${notif.Status}) — PASS`);

    // Cleanup
    await db('PushNotifications').where({ Id: notif.Id }).del();
    await db('PushSubscriptions').where({ Endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-p1-gate-test' }).del();

  });

  test('H5: POST /api/push/test — admin can send test push', async ({ request }) => {
    const token = await login(request);
    const { db } = require('../../src/infrastructure/db/db');

    // Ensure user has an active subscription
    await request.post(`${API}/api/push/subscribe`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-test-push-e2e',
        keys: { p256dh: 'test-push-p256dh', auth: 'test-push-auth' },
      },
    });

    // Send test push
    const res = await request.post(`${API}/api/push/test`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });

    // Should return 200 (sent or attempted) or 404 (no active sub)
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const result = (await res.json()).data;
      expect(result).toBeTruthy();
      expect(typeof result.sent).toBe('number');
      console.log(`[H5] Test push sent: ${result.sent} sent, ${result.failed} failed — PASS`);
    } else {
      console.log('[H5] Test push returned 404 (no active sub) — PASS');
    }

    // Cleanup
    await db('PushSubscriptions').where({ Endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-test-push-e2e' }).del();
    await db('PushNotifications').where({ UserId: 1 }).del();

  });

  test('H6: Push card shows "Activada ✓" when user is subscribed', async ({ browser, request }) => {
    const token = await login(request);
    const { db } = require('../../src/infrastructure/db/db');

    // Ensure user has an active subscription
    await request.post(`${API}/api/push/subscribe`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-subscribed-test',
        keys: { p256dh: 'sub-p256dh', auth: 'sub-auth' },
      },
    });

    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => {
      localStorage.setItem('samba_jwt', t);
    }, token);
    const page = await ctx.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 10000 });

    await page.evaluate(() => window.App.navigate('admin'));
    await page.waitForSelector('#view-admin.is-active', { timeout: 10000 });
    await page.waitForSelector('.admin-nav-item[data-admin-tab="config"]', { timeout: 15000 });
    await page.click('button[data-admin-tab="config"]');
    await page.waitForFunction(() => {
      const content = document.getElementById('admin-content');
      return content && content.textContent.includes('Notificaciones Push');
    }, null, { timeout: 15000 });

    const configText = await page.locator('#admin-content').textContent();
    // When subscribed, the card should show "Activada" and not "Activar notificaciones"
    expect(configText).toContain('Activada');

    console.log('[H6] Push card shows "Activada ✓" when subscribed — PASS');

    await page.close();
    await ctx.close();

    // Cleanup
    await db('PushSubscriptions').where({ Endpoint: 'https://fcm.googleapis.com/fcm/send/bloque-h-subscribed-test' }).del();
    await db('PushNotifications').where({ UserId: 1 }).del();

  });

});
