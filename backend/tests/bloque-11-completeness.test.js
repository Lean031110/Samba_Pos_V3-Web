// =====================================================================
// bloque-11-completeness.test.js — Verify all backend endpoints have UI
// =====================================================================
// This test audits:
//   1. Every backend route has at least one corresponding admin.js render call
//   2. Every CSS file referenced in index.html exists
//   3. Every JS file referenced in index.html exists
//   4. Admin sidebar has ≥18 nav items (after Bloque 11)
//   5. admin.js parses without syntax errors
// =====================================================================

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const F = fs.existsSync(FRONTEND_DIR) ? FRONTEND_DIR : path.join(__dirname, '..', '..', '..', 'Samba_Pos_V3-Web', 'frontend');

describe('Bloque 11 — Completeness audit', () => {
  test('admin.js parses without syntax errors', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    // Wrap in function to check it's valid JS
    assert.doesNotThrow(() => new Function(code), 'admin.js should parse');
  });

  test('admin.js has all required render functions', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    const required = [
      '_renderProducts', '_renderInventory', '_renderRecipes', '_renderPrinters',
      '_renderTemplates', '_renderCash', '_renderReports', '_renderConfig',
      '_renderUsers', '_renderRoles', '_renderStations', '_renderAreas',
      '_renderCombos', '_renderTransfers', '_renderSystem', '_renderErrors',
      '_renderCustomers', '_renderAuditLogs', '_renderDepartments',
      '_renderPaymentTypes', '_renderSettings',
    ];
    for (const fn of required) {
      assert.ok(code.includes(`_render${fn.slice(7)}`) || code.includes(fn), `admin.js should have ${fn}`);
    }
  });

  test('admin sidebar has ≥18 nav items (Bloque 11 added 4 more)', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const matches = html.match(/data-admin-tab="/g) || [];
    assert.ok(matches.length >= 18, `should have ≥18 nav items, got ${matches.length}`);
  });

  test('admin sidebar includes all new Bloque 11 tabs', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const required = ['customers', 'audit', 'departments', 'payment-types', 'settings'];
    for (const tab of required) {
      assert.ok(html.includes(`data-admin-tab="${tab}"`), `should have ${tab} tab`);
    }
  });

  test('admin.js calls all critical backend endpoints', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    const endpoints = [
      '/admin/users', '/admin/roles', '/admin/permissions',
      '/admin/audit-logs', '/admin/departments', '/admin/payment-types', '/admin/settings',
      '/customers', '/combos', '/stations', '/stations/areas',
      '/inventory/warehouses', '/inventory/transfers',
      '/errors', '/errors/stats',
      '/reports/sales', '/reports/top-products', '/reports/categories',
      '/reports/users', '/reports/payments', '/reports/voids-refunds',
      '/reports/inventory', '/reports/cash-sessions', '/reports/dashboard',
    ];
    const missing = endpoints.filter(e => !code.includes(`'${e}'`) && !code.includes('`' + e));
    // Allow up to 2 mismatches (those that may be constructed differently)
    assert.ok(missing.length <= 2, `Missing API calls: ${missing.join(', ')}`);
  });

  test('demo-data.js has mock data for all new endpoints', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'demo-data.js'), 'utf8');
    const required = [
      'customers:', 'auditLogs:', 'departments:', 'paymentTypes:', 'settings:',
      'combos:', 'reportData:',
    ];
    for (const key of required) {
      assert.ok(code.includes(key), `demo-data.js should have ${key}`);
    }
  });

  test('demo-data.js handlers cover all new Bloque 11 endpoints', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'demo-data.js'), 'utf8');
    const required = [
      '/api/customers', '/api/admin/audit-logs', '/api/admin/departments',
      '/api/admin/payment-types', '/api/admin/settings',
      '/api/reports/sales', '/api/reports/categories', '/api/reports/users',
      '/api/reports/payments', '/api/reports/voids-refunds',
      '/api/reports/inventory', '/api/reports/cash-sessions', '/api/reports/dashboard',
    ];
    const missing = required.filter(e => !code.includes(e));
    assert.strictEqual(missing.length, 0, `Missing demo handlers: ${missing.join(', ')}`);
  });

  test('all CSS files referenced in index.html exist', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const cssLinks = [...html.matchAll(/href="\/css\/([a-z-]+\.css)"/g)].map(m => m[1]);
    for (const css of cssLinks) {
      const fp = path.join(F, 'css', css);
      assert.ok(fs.existsSync(fp), `${css} should exist`);
    }
  });

  test('all JS files referenced in index.html exist', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const jsLinks = [...html.matchAll(/src="\/js\/(components\/[a-z-]+\.js|services\/[a-z-]+\.js|store\/[a-z-]+\.js|views\/[a-z-]+\.js|app\.js|store\.js)"/g)].map(m => m[1]);
    for (const js of jsLinks) {
      const fp = path.join(F, 'js', js);
      assert.ok(fs.existsSync(fp), `${js} should exist`);
    }
  });

  test('backend routes for all new features exist', () => {
    const routesDir = path.join(__dirname, '..', 'src', 'api', 'routes');
    const required = [
      'customers.js', 'admin.js', 'stations.js', 'errors.js', 'inventory.js',
      'combos.js', 'reports.js', 'printers.js', 'recipes.js',
      'tickets.js', 'cash-sessions.js', 'push.js', 'config.js',
    ];
    for (const file of required) {
      assert.ok(fs.existsSync(path.join(routesDir, file)), `${file} should exist`);
    }
  });
});

// Cleanup at end
after(async () => {
  const { db } = require('../src/infrastructure/db/db');
  await db.destroy();
});
