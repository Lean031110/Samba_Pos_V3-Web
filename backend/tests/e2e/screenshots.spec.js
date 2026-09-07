// =====================================================================
// screenshots.spec.js — Reproducible documentary screenshot suite
// =====================================================================
// Generates fresh, real screenshots of the running SambaPos_LBA app
// using Playwright + the existing seed data (Administrator / demo PIN).
//
// Design constraints:
//   * Viewport: 1280×800 (tablet landscape, set in playwright.config.js)
//   * Demo data: uses seeded Administrator + on-the-fly API-created data
//   * No real secrets: PIN field left empty in the login screenshot;
//     tokens are kept in localStorage and never rendered on screen.
//   * Normalised file names: NN-descripcion.png
//   * Output: docs/screenshots/
//   * Each test is independent (creates its own demo data via API/DB)
//   * Pattern: 1 test = 1 screenshot, timeout = 30s (Playwright default)
//
// Run:
//   npx playwright test tests/e2e/screenshots.spec.js --reporter=list
// =====================================================================

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const { db } = require('../../src/infrastructure/db/db');
const { TableRepository } = require('../../src/infrastructure/repositories/TableRepository');

const BASE = 'http://localhost:3001';
const SHOTS = path.join(__dirname, '..', '..', '..', 'docs', 'screenshots');

// Ensure the output directory exists.
fs.mkdirSync(SHOTS, { recursive: true });

// Demo credentials (seed). PIN is the seeded demo PIN, never a production secret.
const DEMO_USER = 'Administrator';
const DEMO_PIN = '1234';

// Deterministic demo products (created on-the-fly per test so the suite is
// independent of run order — the seed does NOT create any MenuItems).
const DEMO_PRODUCTS = [
  { name: 'Hamburger',       price: 8.50,  groupCode: 'Food' },
  { name: 'Cheeseburger',    price: 9.50,  groupCode: 'Food' },
  { name: 'Margherita Pizza', price: 11.00, groupCode: 'Food' },
  { name: 'Caesar Salad',    price: 6.50,  groupCode: 'Sides' },
  { name: 'French Fries',    price: 3.50,  groupCode: 'Sides' },
  { name: 'Coca-Cola',       price: 2.00,  groupCode: 'Drinks' },
  { name: 'Coffee',          price: 1.80,  groupCode: 'Drinks' },
  { name: 'Espresso',        price: 2.20,  groupCode: 'Drinks' },
];

const DEMO_TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

// =====================================================================
// Helpers
// =====================================================================

/**
 * Login via the UI (real user interaction). After this returns, the page
 * is on the dashboard view and the WebSocket indicator should be green.
 */
async function loginViaUI(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
  await page.fill('#login-username', DEMO_USER);
  await page.fill('#login-pin', DEMO_PIN);
  // Trigger the login handler directly (the inline onclick is reliable,
  // but App.login() is the source of truth and avoids timing issues with
  // the flex-button Web Component).
  await page.evaluate(() => window.App.login());
  await page.waitForSelector('#view-dashboard.is-active', { timeout: 10000 });
  // Wait briefly for the WebSocket indicator to flip to "Connected".
  await page.waitForSelector('#conn-indicator.is-connected', { timeout: 10000 })
    .catch(() => { /* best effort — proceed regardless */ });
  // Dismiss leftover toasts so they don't appear in subsequent screenshots.
  await page.evaluate(() => {
    const c = document.getElementById('toast-container');
    if (c) c.innerHTML = '';
    const fs = document.getElementById('footer-status');
    if (fs) fs.textContent = 'Ready';
  });
}

/** Obtain a JWT token via the API (for setup calls). */
async function getJwtToken(request) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { username: DEMO_USER, pin: DEMO_PIN },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

/** Create the DEMO_PRODUCTS list (idempotent — uses a unique suffix per test). */
async function createDemoProducts(request, token, suffix) {
  const items = [];
  for (const p of DEMO_PRODUCTS) {
    const res = await request.post(`${BASE}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `${p.name} ${suffix}`, price: p.price, groupCode: p.groupCode },
    });
    if (res.ok()) {
      items.push((await res.json()).data);
    }
  }
  return items;
}

/** Ensure DEMO_TABLES exist in the DB (idempotent). Uses the TableRepository. */
async function ensureDemoTables() {
  const repo = new TableRepository();
  for (const name of DEMO_TABLES) {
    const existing = await db('Entities')
      .join('EntityTypes', 'Entities.EntityTypeId', 'EntityTypes.Id')
      .where({ 'Entities.Name': name, 'EntityTypes.Name': 'Tables' })
      .select('Entities.Id')
      .first();
    if (!existing) {
      try { await repo.createTable(name, 'Available'); } catch { /* already exists */ }
    }
  }
}

/** Escape HTML for safe rendering inside our overlay. */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Build a simple HTML table string from headers + rows. */
function renderTable(headers, rows) {
  const head = headers.map(h =>
    `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;color:#2d3748;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;background:#f7fafc;">${escapeHtml(h)}</th>`
  ).join('');
  const body = (rows && rows.length)
    ? rows.map(r =>
        `<tr>${r.map(c => `<td style="padding:8px 10px;border-bottom:1px solid #edf2f7;font-size:13px;color:#1a202c;">${escapeHtml(c)}</td>`).join('')}</tr>`
      ).join('')
    : `<tr><td colspan="${headers.length}" style="padding:20px;text-align:center;color:#a0aec0;font-size:13px;">No records</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Render a full-screen overlay on top of the current view, displaying
 * structured data fetched via API. Used for screenshots of "admin" data
 * that doesn't have a dedicated UI view (products, inventory, recipes,
 * printers). The overlay is removed before each subsequent call.
 */
async function renderDataOverlay(page, title, subtitle, bodyHtml) {
  await page.evaluate(({ title, subtitle, bodyHtml }) => {
    const prev = document.getElementById('shot-overlay');
    if (prev) prev.remove();
    const overlay = document.createElement('div');
    overlay.id = 'shot-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:#f5f7fa',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'color:#1a202c', 'overflow:auto',
      'padding:20px', 'box-sizing:border-box',
    ].join(';');
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);padding:24px;max-width:1200px;margin:0 auto;">
        <h1 style="margin:0 0 4px;font-size:22px;color:#044392;">${title}</h1>
        ${subtitle ? `<div style="color:#718096;font-size:12px;margin-bottom:16px;">${subtitle}</div>` : ''}
        <div>${bodyHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
  }, { title, subtitle, bodyHtml });
  // Allow the browser a tick to layout the overlay.
  await page.waitForTimeout(150);
}

/**
 * Create a ticket via fetch inside the page (uses the localStorage JWT,
 * so the request is authenticated the same way as the UI's own calls).
 * The freshly created ticket is loaded into the store's currentTicket.
 */
async function createTicketInStore(page, productId, quantities = [1]) {
  return await page.evaluate(async (args) => {
    const token = localStorage.getItem('samba_jwt');
    const createRes = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ departmentId: 1, ticketTypeId: 1 }),
    });
    const createBody = await createRes.json();
    const ticketId = createBody.data.Id;
    for (const qty of args.quantities) {
      await fetch(`/api/tickets/${ticketId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ menuItemId: args.productId, quantity: qty }),
      });
    }
    const refreshRes = await fetch(`/api/tickets/${ticketId}`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const refreshBody = await refreshRes.json();
    window.store.setState({ currentTicket: refreshBody.data }, 'shot-ticket-loaded');
    return refreshBody.data;
  }, { productId, quantities });
}

// =====================================================================
// Screenshots
// =====================================================================

test.describe('Screenshots documentales — SambaPos_LBA', () => {

  test('01 — Login', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
    // Pre-fill the username to make the screenshot look realistic.
    // Leave the PIN field empty — no real secret in the captured image.
    await page.fill('#login-username', DEMO_USER);
    await page.screenshot({ path: path.join(SHOTS, '01-login.png'), fullPage: false });
  });

  test('02 — Dashboard', async ({ page }) => {
    // The seed does not create any Table entities — we create a small
    // set directly via the DB so the dashboard grid is populated.
    await ensureDemoTables();
    await loginViaUI(page);
    // After login we're on the dashboard already (refresh runs on entry).
    await page.waitForSelector('#dashboard-grid .table-tile', { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, '02-dashboard.png'), fullPage: false });
  });

  test('03 — POS empty (no products in ticket)', async ({ page }) => {
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    // Wait for PosView.refresh() to finish loading products (may be empty).
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SHOTS, '03-pos-empty.png'), fullPage: false });
  });

  test('04 — POS with products loaded', async ({ page, request }) => {
    const token = await getJwtToken(request);
    await createDemoProducts(request, token, '#04');
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    // Wait for the products grid to render at least one flex-button.
    await page.waitForSelector('#pos-products-grid flex-button', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '04-pos-with-products.png'), fullPage: false });
  });

  test('05 — Ticket with orders', async ({ page, request }) => {
    const token = await getJwtToken(request);
    const products = await createDemoProducts(request, token, '#05');
    const product = products[0];
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    await createTicketInStore(page, product.Id, [2, 1, 1]);
    await page.waitForSelector('#pos-orders-list .ticket-item', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '05-ticket-with-orders.png'), fullPage: false });
  });

  test('06 — POS command bar', async ({ page, request }) => {
    const token = await getJwtToken(request);
    await createDemoProducts(request, token, '#06');
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    await page.waitForSelector('#pos-products-grid flex-button', { timeout: 10000 });
    // Sanity-check the command bar is fully rendered before capturing.
    const labels = await page.locator('#pos-cmdbar flex-button').allTextContents();
    expect(labels.some(t => t.includes('Cobrar'))).toBeTruthy();
    expect(labels.some(t => t.includes('Nota'))).toBeTruthy();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, '06-command-bar.png'), fullPage: false });
  });

  test('07 — Note modal', async ({ page, request }) => {
    const token = await getJwtToken(request);
    const products = await createDemoProducts(request, token, '#07');
    const product = products[0];
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    await createTicketInStore(page, product.Id, [1]);
    await page.waitForTimeout(300);
    // Open the Note modal via the PosView command.
    await page.evaluate(() => window.App.views.pos.note());
    // The modal-overlay uses opacity transitions; waitForSelector's visibility
    // check is unreliable here. Poll for the is-open class instead.
    await page.waitForFunction(
      () => !!document.getElementById('modal-overlay')?.classList.contains('is-open'),
      { timeout: 5000 }
    );
    // Type a realistic demo note (no real customer data). Use force:true
    // because Playwright's actionability check is unreliable for elements
    // inside a position:fixed; opacity-transitioned modal — the textarea
    // is in fact interactive even when the parent's transition is mid-flight.
    await page.fill('#note-input', 'Sin cebolla, sin pepinillos. Mesa cerca de la ventana.', { force: true });
    await page.screenshot({ path: path.join(SHOTS, '07-note-modal.png'), fullPage: false });
  });

  test('08 — Payment', async ({ page, request }) => {
    const token = await getJwtToken(request);
    const products = await createDemoProducts(request, token, '#08');
    const product = products[0];
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    await createTicketInStore(page, product.Id, [2, 1, 1]);
    await page.waitForTimeout(300);
    // Trigger the payment view via the PosView.pay() command.
    await page.evaluate(() => window.App.views.pos.pay());
    await page.waitForSelector('#view-payment.is-active', { timeout: 5000 });
    // Wait for payment type buttons to be fetched from /api/payment-types.
    await page.waitForSelector('#payment-types flex-button', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '08-payment.png'), fullPage: false });
  });

  test('09 — Ticket closed / receipt', async ({ page, request }) => {
    const token = await getJwtToken(request);
    const products = await createDemoProducts(request, token, '#09');
    const product = products[0];

    // Create a fully-paid + closed ticket via API. We'll then load that
    // ticket's print preview modal in the UI — that modal serves as the
    // visual "receipt" for the closed ticket.
    const createRes = await request.post(`${BASE}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    const ticketId = (await createRes.json()).data.Id;
    await request.post(`${BASE}/api/tickets/${ticketId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: product.Id, quantity: 2 },
    });
    const ticketRes = await request.get(`${BASE}/api/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ticket = (await ticketRes.json()).data;
    const total = Number(ticket.RemainingAmount || 0);
    // Pay the exact amount in Cash (paymentTypeId=1 from seed).
    await request.post(`${BASE}/api/tickets/${ticketId}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { paymentTypeId: 1, amount: total },
    });
    // Close the ticket.
    await request.post(`${BASE}/api/tickets/${ticketId}/close`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });

    // Now log in to the UI and open the print preview modal for this
    // closed ticket (acts as the "receipt" screenshot).
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    await page.evaluate(async (id) => {
      const token = localStorage.getItem('samba_jwt');
      const res = await fetch(`/api/tickets/${id}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const body = await res.json();
      window.store.setState({ currentTicket: body.data }, 'shot-closed-loaded');
    }, ticketId);
    await page.waitForTimeout(200);
    // Trigger the print preview modal.
    await page.evaluate(() => window.App.views.pos.printBill());
    await page.waitForFunction(
      () => !!document.getElementById('modal-overlay')?.classList.contains('is-open'),
      { timeout: 5000 }
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '09-ticket-closed.png'), fullPage: false });
  });

  test('10 — Kitchen Display System (KDS)', async ({ page, request }) => {
    const token = await getJwtToken(request);
    // Create a product + ticket + order so the KDS has at least one
    // active kitchen order to display (otherwise the grid is empty).
    const products = await createDemoProducts(request, token, '#10');
    const product = products[0];
    const createRes = await request.post(`${BASE}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    const ticketId = (await createRes.json()).data.Id;
    await request.post(`${BASE}/api/tickets/${ticketId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: product.Id, quantity: 2 },
    });

    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('kitchen'));
    await page.waitForSelector('#view-kitchen.is-active', { timeout: 5000 });
    await page.waitForSelector('.kds-toolbar', { timeout: 5000 });
    // Give the KDS a moment to fetch + render the active orders.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, '10-kds.png'), fullPage: false });
  });

  test('11 — Products (via API)', async ({ page, request }) => {
    const token = await getJwtToken(request);
    await createDemoProducts(request, token, '#11');
    const res = await request.get(`${BASE}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()).data;
    expect(data.length).toBeGreaterThan(0);
    await loginViaUI(page);
    const rows = data.slice(0, 12).map(p => [
      String(p.Id),
      p.Name,
      p.GroupCode || '—',
      p.Barcode || '—',
      '$' + Number(p.Portions?.[0]?.Prices?.[0]?.Price || 0).toFixed(2),
    ]);
    await renderDataOverlay(page,
      'Products — Menu Items',
      `Total: ${data.length} items · source: GET /api/products`,
      renderTable(['ID', 'Name', 'GroupCode', 'Barcode', 'Price'], rows));
    await page.screenshot({ path: path.join(SHOTS, '11-products.png'), fullPage: false });
  });

  test('12 — Inventory / stock balances', async ({ page, request }) => {
    const token = await getJwtToken(request);
    const res = await request.get(`${BASE}/api/inventory/stock/1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()).data;
    expect(data.length).toBeGreaterThan(0);
    await loginViaUI(page);
    const rows = data.map(b => [
      b.IngredientName || b.Name || '—',
      b.IngredientCode || b.Code || '—',
      b.GroupCode || '—',
      Number(b.Quantity || 0).toFixed(2),
      b.UnitCode || b.BaseUnitCode || '—',
      '$' + Number(b.AverageCost || 0).toFixed(4),
      '$' + (Number(b.Quantity || 0) * Number(b.AverageCost || 0)).toFixed(2),
    ]);
    await renderDataOverlay(page,
      'Inventory — Stock Balances (Warehouse #1)',
      `Total: ${data.length} ingredients · source: GET /api/inventory/stock/1`,
      renderTable(['Ingredient', 'Code', 'Group', 'Quantity', 'Unit', 'Avg Cost', 'Value'], rows));
    await page.screenshot({ path: path.join(SHOTS, '12-inventory.png'), fullPage: false });
  });

  test('13 — Recipes', async ({ page, request }) => {
    const token = await getJwtToken(request);
    // Create a demo menu item + portion + recipe so the list is non-empty.
    const productRes = await request.post(`${BASE}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'Demo Burger #13', price: 8.50, groupCode: 'Food' },
    });
    const product = (await productRes.json()).data;
    const portionId = product.Portions?.[0]?.Id;

    const ingRes = await request.get(`${BASE}/api/inventory/ingredients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ingredients = (await ingRes.json()).data;
    expect(ingredients.length).toBeGreaterThanOrEqual(2);

    // Build a recipe with at least two ingredients + a small fixed cost.
    const recipeItems = [
      { ingredientId: ingredients[0].Id, quantity: 1, unitId: ingredients[0].BaseUnitId },
      { ingredientId: ingredients[1].Id, quantity: 2, unitId: ingredients[1].BaseUnitId },
    ];
    await request.post(`${BASE}/api/recipes/by-portion/${portionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { items: recipeItems, fixedCost: 0.10 },
    });

    // List recipes — the new one should appear with cost/margin.
    const listRes = await request.get(`${BASE}/api/recipes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await listRes.json()).data;
    expect(data.length).toBeGreaterThan(0);
    await loginViaUI(page);
    const rows = data.map(r => [
      r.menuItemName || '—',
      r.portionName || '—',
      '$' + Number(r.price || 0).toFixed(2),
      '$' + Number(r.cost || 0).toFixed(4),
      '$' + Number(r.margin || 0).toFixed(2),
      Number(r.marginPct || 0).toFixed(1) + '%',
      r.isActive ? 'Active' : 'Inactive',
    ]);
    await renderDataOverlay(page,
      'Recipes — Cost & Margin Summary',
      `Total: ${data.length} recipes · source: GET /api/recipes`,
      renderTable(['Menu Item', 'Portion', 'Price', 'Cost', 'Margin', 'Margin %', 'Status'], rows));
    await page.screenshot({ path: path.join(SHOTS, '13-recipes.png'), fullPage: false });
  });

  test('14 — Cost & margin calculator', async ({ page, request }) => {
    const token = await getJwtToken(request);
    // Use the calc-margin endpoint: cost + price → margin metrics.
    // This endpoint doesn't require an existing recipe.
    const res = await request.post(`${BASE}/api/recipes/calc-margin`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { cost: 2.65, price: 8.50 },
    });
    const data = (await res.json()).data;
    await loginViaUI(page);
    const bodyHtml = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
        <div style="background:#ebf8ff;border-radius:8px;padding:16px;">
          <div style="font-size:11px;color:#4a5568;text-transform:uppercase;letter-spacing:0.05em;">Unit Cost</div>
          <div style="font-size:28px;font-weight:600;color:#2b6cb0;">$${Number(data.cost).toFixed(2)}</div>
        </div>
        <div style="background:#f0fff4;border-radius:8px;padding:16px;">
          <div style="font-size:11px;color:#4a5568;text-transform:uppercase;letter-spacing:0.05em;">Sale Price</div>
          <div style="font-size:28px;font-weight:600;color:#276749;">$${Number(data.price).toFixed(2)}</div>
        </div>
        <div style="background:#fffaf0;border-radius:8px;padding:16px;">
          <div style="font-size:11px;color:#4a5568;text-transform:uppercase;letter-spacing:0.05em;">Margin</div>
          <div style="font-size:28px;font-weight:600;color:#c05621;">$${Number(data.margin).toFixed(2)}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#718096;margin-bottom:4px;">Margin % (of price)</div>
          <div style="font-size:22px;font-weight:600;color:#044392;">${Number(data.marginPct).toFixed(2)}%</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#718096;margin-bottom:4px;">Markup % (over cost)</div>
          <div style="font-size:22px;font-weight:600;color:#044392;">${Number(data.markupPct).toFixed(2)}%</div>
        </div>
      </div>
      <div style="margin-top:16px;color:#718096;font-size:12px;">
        Source: POST /api/recipes/calc-margin · { cost: 2.65, price: 8.50 }
      </div>`;
    await renderDataOverlay(page,
      'Recipe Cost & Margin',
      'Margin calculator — given a unit cost and a selling price',
      bodyHtml);
    await page.screenshot({ path: path.join(SHOTS, '14-cost-margin.png'), fullPage: false });
  });

  test('15 — Printer configuration', async ({ page, request }) => {
    const token = await getJwtToken(request);
    const [printersRes, areasRes, rulesRes] = await Promise.all([
      request.get(`${BASE}/api/printers`,           { headers: { Authorization: `Bearer ${token}` } }),
      request.get(`${BASE}/api/print/areas/list`,   { headers: { Authorization: `Bearer ${token}` } }),
      request.get(`${BASE}/api/print/routing-rules/list`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const printers = (await printersRes.json()).data;
    const areas    = (await areasRes.json()).data;
    const rules    = (await rulesRes.json()).data;

    await loginViaUI(page);

    const printerRows = printers.map(p => [
      String(p.Id), p.Name, p.ShareName,
      String(p.PrinterType), String(p.CharsPerLine), String(p.CodePage),
      p.IsActive ? 'Active' : 'Inactive',
    ]);
    const areaRows = areas.length
      ? areas.map(a => [String(a.Id), a.Name, a.DisplayName || a.Name, a.AreaType || '—', a.Color || '—'])
      : [];
    const ruleRows = rules.length
      ? rules.map(r => [
          String(r.Id), r.RuleType, r.MatchValue || '—',
          String(r.PrintAreaId || '—'), String(r.PrinterId || '—'),
          String(r.Priority || 0),
        ])
      : [];

    const bodyHtml = `
      <h2 style="margin:0 0 8px;font-size:16px;color:#2d3748;">Printers (${printers.length})</h2>
      ${renderTable(['ID', 'Name', 'Share', 'Type', 'Chars/Line', 'CodePage', 'Status'], printerRows)}
      <h2 style="margin:20px 0 8px;font-size:16px;color:#2d3748;">Print Areas (${areas.length})</h2>
      ${renderTable(['ID', 'Name', 'Display', 'Type', 'Color'], areaRows)}
      <h2 style="margin:20px 0 8px;font-size:16px;color:#2d3748;">Routing Rules (${rules.length})</h2>
      ${renderTable(['ID', 'RuleType', 'Match', 'AreaId', 'PrinterId', 'Priority'], ruleRows)}`;
    await renderDataOverlay(page,
      'Printer Configuration',
      'Printers · Print Areas · Routing Rules — fetched via /api/printers, /api/print/areas/list, /api/print/routing-rules/list',
      bodyHtml);
    await page.screenshot({ path: path.join(SHOTS, '15-printer-config.png'), fullPage: false });
  });

  test('16 — WebSocket connected indicator', async ({ page }) => {
    await loginViaUI(page);
    // loginViaUI already waits for #conn-indicator.is-connected, but
    // double-check explicitly so a failure here is reported on this test.
    await expect(page.locator('#conn-indicator')).toHaveClass(/is-connected/, { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, '16-websocket-status.png'), fullPage: false });
  });

  test('17 — Offline / reconnection indicator', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForSelector('#conn-indicator.is-connected', { timeout: 10000 });
    // The browser-side socket.io client (window.socket, set in
    // websocket-client.js) flips #conn-indicator to "Reconnecting…"
    // whenever the socket disconnects. We force a disconnect from the
    // page and disable auto-reconnect so we have a stable window to
    // capture the orange "Reconnecting…" indicator.
    const disconnected = await page.evaluate(() => {
      if (!window.socket) return false;
      try {
        // socket.io v4 client API to disable auto-reconnect.
        window.socket.io.reconnection(false);
      } catch (e) { /* older API — best effort */ }
      window.socket.disconnect();
      return true;
    });
    // If the WebSocket client object wasn't exposed (older build), skip
    // this screenshot rather than capturing a misleading "Connected" state.
    test.skip(!disconnected, 'window.socket not available — offline indicator cannot be triggered safely');
    await page.waitForSelector('#conn-indicator.is-reconnecting', { timeout: 5000 })
      .catch(() => {/* fall back to whatever state the indicator is in */});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '17-offline-reconnection.png'), fullPage: false });
  });
});
