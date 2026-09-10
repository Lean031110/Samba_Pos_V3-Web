// =====================================================================
// bloque-f-printer.spec.js — BLOQUE F E2E: Printer Gateway
// =====================================================================
// Tests the Bloque F (Fase 6: Printer Gateway) gaps via browser E2E:
//
//   P2 — Template editor UI
//     Verifies the admin UI "Plantillas" tab loads, shows templates,
//     and the create/edit modal works.
//
// The P0 gate (hardware simulation) is covered by unit tests in
// bloque-f-printer-verification.test.js which test the full TCP
// pipeline (PrintQueue → PrintWorker → TcpTransport → MockTcpServer).
// E2E browser tests don't add value for the TCP layer.
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

test.describe('BLOQUE F — Printer Gateway (template editor UI)', () => {

  test('F1: Admin "Plantillas" tab loads and shows templates', async ({ browser, request }) => {
    const token = await login(request);

    // Open the admin view and navigate to the "Plantillas" tab
    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => {
      localStorage.setItem('samba_jwt', t);
    }, token);
    const page = await ctx.newPage();

    // Login via UI (same pattern as screenshots.spec.js — most reliable)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 10000 });

    // Navigate to admin view
    await page.evaluate(() => window.App.navigate('admin'));
    await page.waitForSelector('#view-admin.is-active', { timeout: 10000 });

    // Wait for the admin sidebar to render (the products tab loads first by default)
    await page.waitForSelector('.admin-nav-item[data-admin-tab="templates"]', { timeout: 15000 });

    // Click the "Plantillas" tab in the admin sidebar
    await page.click('button[data-admin-tab="templates"]');

    // Wait for templates table or empty message
    await page.waitForFunction(() => {
      const content = document.getElementById('admin-content');
      if (!content) return false;
      return content.querySelector('.admin-table tbody tr, .admin-empty') !== null;
    }, null, { timeout: 10000 });

    // Debug: capture the admin content HTML
    const adminContent = await page.locator('#admin-content').innerHTML();
    console.log(`[F1] Admin content (first 300 chars):`, adminContent.substring(0, 300));

    // Verify templates table is rendered
    const tableRows = await page.locator('.admin-table tbody tr').count();
    console.log(`[F1] Templates table rows: ${tableRows}`);
    // Should have at least the seeded templates (Receipt, Kitchen Order, Test Print)
    expect(tableRows).toBeGreaterThanOrEqual(1);

    await page.close();
    await ctx.close();
  });

  test('F2: Create template modal opens and validates name', async ({ browser, request }) => {
    const token = await login(request);

    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => {
      localStorage.setItem('samba_jwt', t);
    }, token);
    const page = await ctx.newPage();

    // Login via UI (same pattern as screenshots.spec.js — most reliable)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-login.is-active', { timeout: 10000 });
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 10000 });

    await page.evaluate(() => window.App.navigate('admin'));
    await page.waitForSelector('#view-admin.is-active', { timeout: 10000 });
    await page.waitForSelector('.admin-nav-item[data-admin-tab="templates"]', { timeout: 15000 });
    await page.click('button[data-admin-tab="templates"]');
    await page.waitForFunction(() => {
      const content = document.getElementById('admin-content');
      if (!content) return false;
      return content.querySelector('.admin-table tbody tr, .admin-empty') !== null;
    }, null, { timeout: 15000 });

    // Click "Nueva plantilla" button
    await page.click('button:has-text("Nueva plantilla")');

    // Wait for modal to open
    await page.waitForSelector('#modal-overlay.is-open, #modal-overlay.modal-overlay--open', { timeout: 5000 });

    // Verify the modal has the template form fields
    await page.waitForSelector('#tpl-name', { timeout: 5000 });
    await page.waitForSelector('#tpl-type');
    await page.waitForSelector('#tpl-body');

    // Try to save without a name — should show error
    await page.click('button:has-text("Guardar")');
    // The error should appear (toast or inline)
    // Wait a moment for the error toast
    await page.waitForTimeout(500);
    // Modal should still be open (save failed)
    const modalStillOpen = await page.locator('#modal-overlay.is-open, #modal-overlay.modal-overlay--open').count();
    expect(modalStillOpen).toBeGreaterThan(0);

    console.log('[F2] Create template modal works, name validation OK');

    await page.close();
    await ctx.close();
  });

  test('F3: Template preview endpoint returns ESC/POS bytes', async ({ request }) => {
    // API-level test: verify the preview endpoint returns hex bytes
    const token = await login(request);

    // Get the first template
    const listRes = await request.get(`${API}/api/print/templates/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBeTruthy();
    const templates = (await listRes.json()).data;
    expect(templates.length).toBeGreaterThan(0);

    const firstTemplate = templates[0];

    // Preview it
    const previewRes = await request.post(`${API}/api/print/templates/${firstTemplate.Id}/preview`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(previewRes.ok()).toBeTruthy();
    const preview = (await previewRes.json()).data;
    expect(preview.bytesHex).toBeTruthy();
    expect(preview.bytesLength).toBeGreaterThan(0);
    expect(preview.templateType).toBeTruthy();
    expect(preview.sampleData).toBeTruthy();

    // Verify the hex contains ESC (1b) — the init command
    expect(preview.bytesHex.substring(0, 2).toLowerCase()).toBe('1b');

    console.log(`[F3] Template preview OK: ${preview.bytesLength} bytes, type=${preview.templateType}`);
  });

});
