// =====================================================================
// visual-regression.spec.js — PR #9 hardening: visual baseline
// =====================================================================
// The 5 CRITICAL screens get a pixel baseline (toHaveScreenshot):
//   Login · POS · Payment · KDS · Dashboard (Admin)
//
// A future visual change can no longer break these screens SILENTLY:
// the diff fails CI and forces a conscious baseline update.
//
// Determinism strategy (why this is stable across environments):
//   1. FONT: the injected style forces 'Liberation Sans' — present and
//      identical on GH Actions runners AND local dev containers. The
//      app's real stack falls back to different sans fonts per OS,
//      which would make every text pixel differ.
//   2. MASK: live elements that change every second are masked —
//      topbar clock (15s), KDS timers (1s), dates and ticket numbers.
//   3. FRESH DB: run this project after a DB reset so every screen is
//      rendered from the same seed state (see ci.yml "visual" step).
//   4. ANIMATIONS disabled, caret hidden, maxDiffPixelRatio 1%.
//
// Update the baseline intentionally:
//   npm run test:visual:update
//   (or the "visual-baseline" workflow_dispatch — regenerates IN CI,
//    guaranteeing an environment-exact baseline, and commits it)
// =====================================================================

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';

// Cross-environment font pin (see header notes).
const VISUAL_STYLE = `
  *, *::before, *::after {
    font-family: 'Liberation Sans', 'DejaVu Sans', sans-serif !important;
  }
`;

// Elements that are legitimately non-deterministic (time/date/ids).
const MASK_SELECTORS = [
  '#header-clock',            // topbar clock — ticks every 15s
  '#pos-date',                // POS date field
  '#pos-ticket-number',       // ticket id (depends on run order)
  '#payment-ticket-number',   // payment ticket id
  '.kds-card2__timer',        // KDS elapsed timers — tick every 1s
];

// toHaveScreenshot's mask requires Locator objects (not raw selectors).
const buildShot = (page) => ({
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.01,
  threshold: 0.2,
  style: VISUAL_STYLE,
  mask: MASK_SELECTORS.map((sel) => page.locator(sel)),
  fullPage: false,
});

async function loginAPI(request, username = 'Administrator', pin = '1234') {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { username, pin },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

async function loginViaUI(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-login.is-active', { timeout: 8000 });
  await page.fill('#login-username', 'Administrator');
  await page.fill('#login-pin', '1234');
  await page.evaluate(() => window.App.login());
}

async function ensureMenuItem(request, token, name, groupCode, price = 9.5) {
  const listRes = await request.get(`${BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok()) {
    const existing = ((await listRes.json()).data || []).find((p) => p.Name === name);
    if (existing) return existing;
  }
  const res = await request.post(`${BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, price, groupCode },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data;
}

test.describe('Visual regression — baseline (PR #9)', () => {
  test('login screen', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#view-login.is-active', { timeout: 8000 });
    await expect(page.locator('.login-card__title')).toHaveText('LBApos');
    await expect(page.locator('#login-username')).toBeVisible();
    await page.waitForTimeout(400); // fonts/layout settle
    await expect(page).toHaveScreenshot('login.png', buildShot(page));
  });

  test('admin dashboard', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
    await expect(page.locator('.kpi-card').first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('dashboard.png', buildShot(page));
  });

  test('POS screen (product grid + order panel)', async ({ page, request }) => {
    const token = await loginAPI(request);
    await ensureMenuItem(request, token, 'Visual Burger', 'VisualTest', 9.5);

    await loginViaUI(page);
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active');
    await page.waitForTimeout(900);

    const cat = page.locator('.category-tab', { hasText: 'VisualTest' });
    if (await cat.count() > 0) await cat.first().click();
    await page.waitForTimeout(300);
    const card = page.locator('.product-card', { hasText: 'Visual Burger' });
    await expect(card.first()).toBeVisible({ timeout: 5000 });
    await card.first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('.orderline__name', { hasText: 'Visual Burger' })).toBeVisible();

    await expect(page).toHaveScreenshot('pos.png', buildShot(page));
  });

  test('payment screen (numpad + summary)', async ({ page, request }) => {
    const token = await loginAPI(request);
    const item = await ensureMenuItem(request, token, 'Visual Pay', 'VisualPay', 12.0);

    const ticket = (await (await request.post(`${BASE}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    })).json()).data;
    await request.post(`${BASE}/api/tickets/${ticket.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: item.Id, quantity: 1 },
    });

    await loginViaUI(page);
    const full = (await (await request.get(`${BASE}/api/tickets/${ticket.Id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()).data;
    await page.evaluate((t) => {
      window.store.setState({ currentTicket: t }, 'ticket-loaded');
      window.App.navigate('payment');
      window.App.views.payment.load(window.store.state.currentTicket);
    }, full);
    await page.waitForSelector('#view-payment.is-active');
    await page.waitForTimeout(700);
    await expect(page.locator('#payment-remaining')).toBeVisible();

    await expect(page).toHaveScreenshot('payment.png', buildShot(page));
  });

  test('KDS screen (station bar + order cards)', async ({ page, request }) => {
    const token = await loginAPI(request);
    const item = await ensureMenuItem(request, token, 'Visual Kitchen', 'VisualKitchen', 6.0);

    const ticket = (await (await request.post(`${BASE}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    })).json()).data;
    await request.post(`${BASE}/api/tickets/${ticket.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: item.Id, quantity: 2 },
    });

    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('kitchen'));
    await page.waitForSelector('#view-kitchen.is-active');
    await page.waitForTimeout(1200); // KDS fetch + first render
    await expect(page.locator('.kds-card2').first()).toBeVisible({ timeout: 8000 });

    await expect(page).toHaveScreenshot('kds.png', buildShot(page));
  });
});
