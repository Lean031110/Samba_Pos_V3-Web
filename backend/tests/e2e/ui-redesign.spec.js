// =====================================================================
// ui-redesign.spec.js — BLOQUE N: E2E del rediseño Odoo 19
// =====================================================================
// Flujo completo (spec §29):
//   login → home de áreas → POS → agregar producto → ticket →
//   payment → KDS → Admin → Caja → Reportes
// + Pruebas responsive: 1280x800, 1024x768, 800x1280, 768x1024, 390x844
//
// No toca lógica de negocio: usa las mismas APIs REST que la UI.
// =====================================================================

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';
const API = BASE;

async function loginAPI(request, username = 'Administrator', pin = '1234') {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { username, pin },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

async function loginViaUI(page, username = 'Administrator', pin = '1234') {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-login.is-active', { timeout: 8000 });
  await page.fill('#login-username', username);
  await page.fill('#login-pin', pin);
  await page.evaluate(() => window.App.login());
}

async function ensureMenuItem(request, token, name, groupCode, price = 5.0) {
  const listRes = await request.get(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok()) {
    const body = await listRes.json();
    const existing = (body.data || []).find(p => p.Name === name);
    if (existing) return existing;
  }
  const res = await request.post(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, price, groupCode },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data;
}

async function noJSErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('BLOQUE N — UI Redesign (Odoo 19)', () => {

  test('N1: Login → admin entra a Dashboard (flujo por rol)', async ({ page }) => {
    const errors = await noJSErrors(page);
    await loginViaUI(page);
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
    // Dashboard KPIs presentes
    await expect(page.locator('.kpi-card').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#header-user')).toHaveText('Administrator');
    // Topbar global visible
    await expect(page.locator('.topbar')).toBeVisible();
    expect(errors.length).toBe(0);
  });

  test('N2: Botón "Todas las áreas" → selector de áreas', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });

    // Menú de usuario → "Todas las áreas"
    await page.click('#topbar-user-btn');
    await page.click('.user-menu__item:has-text("Todas las áreas")');
    await page.waitForSelector('#view-areas.is-active', { timeout: 5000 });

    // El admin ve las 7 áreas
    const areas = await page.locator('.area-card__name').allTextContents();
    for (const expected of ['Administración', 'Punto de Venta', 'Cocina', 'Caja', 'Inventario', 'Reportes', 'Configuración']) {
      expect(areas.some(a => a.includes(expected))).toBeTruthy();
    }
    // Saludo personalizado presente
    const hello = await page.locator('#areas-hello').textContent();
    expect(hello).toContain('Administrator');
  });

  test('N3: POS — agregar producto → ticket actualizado', async ({ page, request }) => {
    const errors = await noJSErrors(page);
    const token = await loginAPI(request);
    const item = await ensureMenuItem(request, token, 'Redesign Burger', 'RedesignTest', 8.5);

    await loginViaUI(page);
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });

    // Vista Mesas renderiza (estado vacío en DB fresca — el seed no crea mesas)
    await page.evaluate(() => window.App.navigate('tables'));
    await page.waitForSelector('#view-tables.is-active');
    await page.waitForTimeout(700);
    await expect(page.locator('.tables-header__floor')).toBeVisible();

    // POS directo — el primer producto crea el ticket automáticamente
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active');
    await page.waitForTimeout(900);

    // Seleccionar categoría del producto y agregarlo
    const cat = page.locator('.category-tab', { hasText: 'RedesignTest' });
    if (await cat.count() > 0) await cat.first().click();
    await page.waitForTimeout(300);
    const card = page.locator('.product-card', { hasText: 'Redesign Burger' });
    await expect(card.first()).toBeVisible({ timeout: 5000 });
    await card.first().click();
    await page.waitForTimeout(1200);

    // El order panel muestra la línea con cantidad y total
    await expect(page.locator('.orderline__name', { hasText: 'Redesign Burger' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.orderline__qty').first()).toContainText('1');
    // Total > 0 y botón PAGAR habilitado
    const total = await page.locator('#pos-grand-total').textContent();
    expect(parseFloat(total.replace('$', ''))).toBeGreaterThan(0);
    await expect(page.locator('#pos-pay-btn')).toBeEnabled();
    expect(errors.length).toBe(0);
  });

  test('N4: Payment — numpad, método y confirmación', async ({ page, request }) => {
    const errors = await noJSErrors(page);
    const token = await loginAPI(request);
    const item = await ensureMenuItem(request, token, 'Pay Burger', 'RedesignPay', 12.0);

    // Crear ticket vía API (misma lógica que la UI)
    const ticket = (await (await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    })).json()).data;
    await request.post(`${API}/api/tickets/${ticket.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: item.Id, quantity: 1 },
    });

    // Cargar ticket en la UI e ir a payment
    await loginViaUI(page);
    const full = (await (await request.get(`${API}/api/tickets/${ticket.Id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()).data;
    await page.evaluate((t) => {
      window.store.setState({ currentTicket: t }, 'ticket-loaded');
      window.App.navigate('payment');
      window.App.views.payment.load(window.store.state.currentTicket);
    }, full);
    await page.waitForSelector('#view-payment.is-active');
    await page.waitForTimeout(800);

    // TOTAL visible y > 0
    const remaining = await page.locator('#payment-remaining').textContent();
    expect(parseFloat(remaining.replace('$', ''))).toBeGreaterThan(0);

    // Numpad: tecla EXACTO (importe exacto)
    const exactKey = page.locator('.np-key--exact');
    await expect(exactKey).toBeVisible();
    await exactKey.click();
    await page.waitForTimeout(200);
    // Entregado = restante
    const tendered = await page.locator('#payment-tendered').textContent();
    expect(tendered).toBe(remaining);

    // Seleccionar método de pago (primero disponible)
    const pm = page.locator('.pm-btn').first();
    await expect(pm).toBeVisible({ timeout: 5000 });
    await pm.click();
    await page.waitForTimeout(200);

    // CONFIRMAR PAGO habilitado → confirmar
    await expect(page.locator('#payment-confirm-btn')).toBeEnabled();
    await page.locator('#payment-confirm-btn').click();
    await page.waitForTimeout(2500);

    // El ticket se cerró → vuelve a mesas
    const view = await page.evaluate(() => window.store.state.currentView);
    expect(['tables', 'payment']).toContain(view);
    if (view === 'payment') {
      // Si aún está en payment (cierre diferido), esperar cierre
      await page.waitForTimeout(3000);
      const view2 = await page.evaluate(() => window.store.state.currentView);
      expect(view2).toBe('tables');
    }
    expect(errors.length).toBe(0);
  });

  test('N5: KDS — order card + estados + acciones', async ({ page, request }) => {
    const errors = await noJSErrors(page);
    const token = await loginAPI(request);
    const item = await ensureMenuItem(request, token, 'KDS Pizza', 'RedesignKDS', 10.0);

    // Crear orden vía API → genera KitchenOrder (event bus, sin cambios)
    const ticket = (await (await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    })).json()).data;
    await request.post(`${API}/api/tickets/${ticket.Id}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: item.Id, quantity: 2, note: 'Sin cebolla' },
    });

    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('kitchen'));
    await page.waitForSelector('#view-kitchen.is-active');
    await page.waitForTimeout(1500);

    // Estructura KDS: stagebar con contadores + estaciones + cards
    await expect(page.locator('.kds-stagebar')).toBeVisible();
    await expect(page.locator('.kds-stage').first()).toBeVisible();
    await expect(page.locator('.kds-stations')).toBeVisible();

    // Card del pedido con #ticket, productos y cantidad
    const card = page.locator('.kds-card2', { hasText: 'KDS Pizza' }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.kds-item2__qty').first()).toContainText('2');
    // La nota del item proviene de order.Tag (no expuesto en POST /orders),
    // se valida su render en la demo (KitchenView muestra .kds-item2__note)

    // Acción ACEPTAR (estado NEW) sobre el card de este test
    const acceptBtn = card.locator('.kds-act--accept');
    if (await acceptBtn.count() > 0) {
      await acceptBtn.first().click();
      await page.waitForTimeout(1200);
      // El estado del card cambió
      const stateText = await card.locator('.kds-card2__state').first().textContent();
      expect(['Aceptado', 'Preparando', 'Listo', 'Entregado', 'Anulado']).toContain(stateText.trim());
    }
    expect(errors.length).toBe(0);
  });

  test('N6: Admin — sidebar y pestañas cargan', async ({ page }) => {
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('admin'));
    await page.waitForSelector('#view-admin.is-active');
    await page.waitForTimeout(1500);
    // Sidebar con módulos
    await expect(page.locator('.admin-sidebar')).toBeVisible();
    await expect(page.locator('.admin-nav-item').first()).toBeVisible();
    // Cambiar a pestaña Inventario del admin
    await page.click('.admin-nav-item[data-admin-tab="inventory"]');
    await page.waitForTimeout(800);
    await expect(page.locator('#admin-content')).not.toBeEmpty();
  });

  test('N7: Caja — vista de sesión', async ({ page }) => {
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('cash'));
    await page.waitForSelector('#view-cash.is-active');
    await page.waitForTimeout(1200);
    // Tabs de caja presentes
    for (const tab of ['Caja actual', 'Movimientos', 'Historial']) {
      await expect(page.locator('#cash-tabs .simple-tab', { hasText: tab })).toBeVisible();
    }
    // Cambiar de tab
    await page.click('#cash-tabs .simple-tab[data-tab="history"]');
    await page.waitForTimeout(600);
    await expect(page.locator('#cash-body')).not.toBeEmpty();
  });

  test('N8: Reportes e Inventario — vistas cargan', async ({ page }) => {
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('reports'));
    await page.waitForSelector('#view-reports.is-active');
    await page.waitForTimeout(1000);
    await expect(page.locator('#reports-body')).not.toBeEmpty();

    await page.evaluate(() => window.App.navigate('inventory'));
    await page.waitForSelector('#view-inventory.is-active');
    await page.waitForTimeout(1000);
    await expect(page.locator('#inventory-body')).not.toBeEmpty();
  });

  test('N9: Login demo con usuario inválido muestra error', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('#view-login.is-active');
    await page.fill('#login-username', 'UsuarioInexistente');
    await page.fill('#login-pin', '9999');
    await page.evaluate(() => window.App.login());
    await expect(page.locator('#login-error')).not.toBeEmpty({ timeout: 5000 });
  });

  // -------------------------------------------------------------------
  // Responsive (spec §29): 1280x800, 1024x768, 800x1280, 768x1024, 390x844
  // -------------------------------------------------------------------

  for (const [w, h] of [[1280, 800], [1024, 768], [800, 1280], [768, 1024], [390, 844]]) {
    test(`NR: responsive ${w}x${h} — sin overflow horizontal ni errores JS`, async ({ page }) => {
      const errors = await noJSErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await loginViaUI(page);
      await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });

      // Navegar por las vistas clave en esta resolución
      for (const v of ['areas', 'pos', 'kitchen', 'cash', 'reports']) {
        await page.evaluate((name) => window.App.navigate(name), v);
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.body.dataset.view)).toBe(v);
        // Sin overflow horizontal del documento
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(2);
      }
      // Topbar visible en todas las resoluciones
      await expect(page.locator('.topbar')).toBeVisible();
      expect(errors.length).toBe(0);
    });
  }
});
