// =====================================================================
// ui-redesign-screenshots.spec.js — BLOQUE N: suite visual (spec §30)
// =====================================================================
// Captura 13 pantallas del rediseño:
//   01-welcome · 02-login · 03-area-selector · 04-admin-dashboard
//   05-pos · 06-pos-tablet · 07-payment · 08-kds · 09-kds-tablet
//   10-cash · 11-reports · 12-inventory · 13-mobile
//
// Se guardan en docs/screenshots/redesign/ y CI las publica como
// artifacts. Suite de documentación — no bloquea CI.
// =====================================================================

const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE = 'http://localhost:3001';
const API = BASE;
const SHOTS = path.join(__dirname, '..', '..', '..', 'docs', 'screenshots', 'redesign');

async function loginAPI(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { username: 'Administrator', pin: '1234' },
  });
  return (await res.json()).token;
}

async function ensureMenuItem(request, token, name, groupCode, price) {
  const listRes = await request.get(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await listRes.json();
  const existing = (body.data || []).find(p => p.Name === name);
  if (existing) return existing;
  const res = await request.post(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, price, groupCode },
  });
  return (await res.json()).data;
}

async function loginViaUI(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-login.is-active', { timeout: 8000 });
  await page.fill('#login-username', 'Administrator');
  await page.fill('#login-pin', '1234');
  await page.evaluate(() => window.App.login());
  await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
}

test.describe('BLOQUE N — Screenshots del rediseño', () => {
  test('captura las 13 pantallas del rediseño', async ({ page, request }) => {
    // Datos de apoyo: productos para POS/KDS/payment con contenido real
    const token = await loginAPI(request);
    await ensureMenuItem(request, token, 'Hamburguesa Rey', 'Hamburguesas', 8.50);
    await ensureMenuItem(request, token, 'Pizza Margarita', 'Pizza', 9.00);
    await ensureMenuItem(request, token, 'Coca Cola', 'Bebidas', 2.00);

    // ---- 02-login (desktop) ----
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#view-login.is-active', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, '02-login.png') });

    // ---- 01-welcome (pantalla de bienvenida/config del APK) ----
    await page.evaluate(() => window.ServerConfig && window.ServerConfig.show());
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '01-welcome.png') });
    await page.evaluate(() => window.ServerConfig && window.ServerConfig.hide());

    // ---- Login + 03-area-selector ----
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
    await page.waitForTimeout(1200);

    await page.evaluate(() => window.App.navigate('areas'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, '03-area-selector.png') });

    // ---- 04-admin-dashboard ----
    await page.evaluate(() => window.App.navigate('dashboard'));
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(SHOTS, '04-admin-dashboard.png') });

    // ---- 05-pos (desktop, con pedido) ----
    // Crear ticket + orden vía API para que el POS muestre contenido
    const ticket = (await (await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    })).json()).data;
    const burger = await ensureMenuItem(request, token, 'Hamburguesa Rey', 'Hamburguesas', 8.5);
    await request.post(`${API}/api/tickets/${ticket.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: burger.Id, quantity: 2, note: 'Sin cebolla' },
    });
    const full = (await (await request.get(`${API}/api/tickets/${ticket.Id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()).data;
    await page.evaluate((t) => window.store.setState({ currentTicket: t }, 'shot'), full);

    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, '05-pos.png') });

    // ---- 06-pos-tablet (1024x768) ----
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '06-pos-tablet.png') });
    await page.setViewportSize({ width: 1280, height: 800 });

    // ---- 07-payment ----
    await page.evaluate(() => {
      window.App.navigate('payment');
      window.App.views.payment.load(window.store.state.currentTicket);
    });
    await page.waitForTimeout(1000);
    // Simular entregado exacto para mostrar cambio
    await page.locator('.np-key--exact').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, '07-payment.png') });

    // ---- 08-kds (desktop) ----
    // Crear más órdenes para llenar el KDS
    const t2 = (await (await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    })).json()).data;
    const pizza = await ensureMenuItem(request, token, 'Pizza Margarita', 'Pizza', 9.0);
    const drink = await ensureMenuItem(request, token, 'Coca Cola', 'Bebidas', 2.0);
    await request.post(`${API}/api/tickets/${t2.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: pizza.Id, quantity: 1, note: 'Extra queso' },
    });
    await request.post(`${API}/api/tickets/${t2.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: drink.Id, quantity: 3 },
    });

    await page.evaluate(() => window.App.navigate('kitchen'));
    await page.waitForSelector('#view-kitchen.is-active');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(SHOTS, '08-kds.png') });

    // ---- 09-kds-tablet (800x1280 vertical) ----
    await page.setViewportSize({ width: 800, height: 1280 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, '09-kds-tablet.png') });
    await page.setViewportSize({ width: 1280, height: 800 });

    // ---- 10-cash ----
    await page.evaluate(() => window.App.navigate('cash'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, '10-cash.png') });

    // ---- 11-reports ----
    await page.evaluate(() => window.App.navigate('reports'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, '11-reports.png') });

    // ---- 12-inventory ----
    await page.evaluate(() => window.App.navigate('inventory'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, '12-inventory.png') });

    // ---- 13-mobile (390x844) — área selector ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.App.navigate('areas'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, '13-mobile.png') });

    // Verificar que existen las 13 capturas
    const expected = [
      '01-welcome', '02-login', '03-area-selector', '04-admin-dashboard',
      '05-pos', '06-pos-tablet', '07-payment', '08-kds', '09-kds-tablet',
      '10-cash', '11-reports', '12-inventory', '13-mobile',
    ];
    for (const name of expected) {
      const fs = require('fs');
      expect(fs.existsSync(path.join(SHOTS, name + '.png'))).toBeTruthy();
    }
  });
});
