// =====================================================================
// pages-smoke.spec.js — GitHub Pages demo build smoke test (PR #9)
// =====================================================================
// Validates the DEMO artifact served under the real Pages sub-path
// (/Samba_Pos_V3-Web/) WITHOUT any production backend:
//
//   1. Static shell loads (index, app.js, css, vendor, manifest, sw).
//   2. APP_BASE_PATH: every sub-resource resolves under the sub-path.
//   3. No uncaught page errors / no 404s on app resources.
//   4. Demo login → areas selector → POS → KDS → Admin.
//   5. DEMO badge visible (demo build ≠ production build).
// =====================================================================

const { test, expect } = require('@playwright/test');

const BASE = '/Samba_Pos_V3-Web/';

test.describe('Pages demo — artifact integrity', () => {
  test('static shell loads with zero JS errors and sub-path assets', async ({ page }) => {
    const pageErrors = [];
    const failedRequests = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('response', (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await page.goto('./', { waitUntil: 'load' });

    // Login card visible → the JS shell booted correctly under the sub-path.
    await expect(page.locator('#login-username')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.login-card__title')).toHaveText('LBApos');

    // No uncaught errors, no failed sub-resource loads.
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(
      failedRequests,
      `failed requests: ${failedRequests.join(' | ')}`
    ).toEqual([]);

    // APP_BASE_PATH resolved from the document URL.
    const base = await page.evaluate(() => window.LBA_BASE);
    expect(base).toBe(BASE);
  });

  test('demo config overlay is active and badge is visible', async ({ page }) => {
    await page.goto('./', { waitUntil: 'load' });

    // Explicit demo configuration (config.demo.js overlay — never production).
    const isDemo = await page.evaluate(() =>
      !!(window.LBA_CONFIG && window.LBA_CONFIG.DEMO_MODE === true));
    expect(isDemo).toBe(true);

    // DEMO badge in the topbar — production builds keep it hidden.
    await expect(page.locator('#topbar-demo-badge')).toBeVisible();
  });

  test('manifest + service worker + icons resolve under the sub-path', async ({ page }) => {
    const checks = [
      ['manifest.webmanifest', 'application/manifest+json'],
      ['sw.js', 'text/javascript'],
      ['icons/icon-192.png', 'image/png'],
      ['icons/favicon.png', 'image/png'],
      ['assets/logo-login.png', 'image/png'],
      ['css/odoo19.css', 'text/css'],
      ['js/app.js', 'text/javascript'],
      ['vendor/css/fontawesome.min.css', 'text/css'],
    ];
    for (const [file, contentType] of checks) {
      const res = await page.request.get(BASE + file);
      expect(res.status(), `${BASE + file} must be 200`).toBe(200);
      expect(res.headers()['content-type']).toContain(contentType.split(';')[0]);
    }
  });
});

test.describe('Pages demo — functional smoke (mock API, no backend)', () => {
  test('login demo → areas → POS → KDS → Admin', async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    // ---- Login (Administrador / 1234 — demo mock) ----
    await page.goto('./', { waitUntil: 'load' });
    await page.locator('#login-username').fill('Administrador');
    await page.locator('#login-pin').fill('1234');
    await page.locator('.btn-odoo', { hasText: 'Iniciar sesión' }).click();

    // Role-based routing: admin lands on the dashboard first.
    await expect(page.locator('#view-dashboard')).toBeVisible({ timeout: 10_000 });

    // ---- Areas selector (via "Todas las áreas") ----
    await page.locator('#topbar-user-btn').click();
    await page.locator('#user-menu .user-menu__item', { hasText: 'Todas las áreas' }).click();
    const areasGrid = page.locator('#areas-grid');
    await expect(areasGrid).toBeVisible({ timeout: 10_000 });
    // Greeting shows the logged-in demo user.
    await expect(page.locator('#areas-hello')).toContainText('Administrador');
    // Admin sees every area card.
    const cards = areasGrid.locator('.area-card, [data-area]');
    expect(await cards.count()).toBeGreaterThanOrEqual(5);

    // ---- POS ----
    await areasGrid.locator('button', { hasText: 'Punto de Venta' }).first().click();
    await expect(page.locator('#view-pos')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#pos-categories button').first()).toBeVisible();
    // Product grid populated by the mock API.
    await expect(page.locator('#pos-products-grid')).not.toBeEmpty();

    // Back to areas via the user menu ("Todas las áreas").
    await page.locator('#topbar-user-btn').click();
    await page.locator('#user-menu .user-menu__item', { hasText: 'Todas las áreas' }).click();
    await expect(areasGrid).toBeVisible({ timeout: 10_000 });

    // ---- KDS ----
    await areasGrid.locator('button', { hasText: 'Cocina' }).first().click();
    await expect(page.locator('#view-kitchen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#kds-screen')).not.toBeEmpty();
    // KDS is full-screen (the topbar is hidden by design — kitchen devices
    // don't leave this screen), so we return through the app's own
    // navigation controller, exactly like the KDS exit flow does.
    await page.evaluate(() => window.App.goHome());
    await expect(areasGrid).toBeVisible({ timeout: 10_000 });

    // ---- Admin ----
    await page.locator('#topbar-user-btn').click();
    await page.locator('#user-menu .user-menu__item', { hasText: 'Todas las áreas' }).click();
    await expect(areasGrid).toBeVisible({ timeout: 10_000 });
    await areasGrid.locator('button', { hasText: 'Administración' }).first().click();
    await expect(page.locator('#view-dashboard')).toBeVisible({ timeout: 10_000 });

    // The whole flow ran without uncaught JS errors.
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
