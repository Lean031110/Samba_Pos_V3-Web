// =====================================================================
// bloque-8-9-verification.test.js — Tablet layout + a11y verifications
// =====================================================================
// Bloque 8 + 9 — Verifies:
//   1. tablet-layout.css file exists and has tablet-specific rules
//   2. android-shell.css file exists with safe-area support
//   3. android-shell.js exposes window.ANDROID_SHELL with detection
//   4. error-reporter.js exposes window.ErrorReporter
//   5. Index.html loads all new scripts/stylesheets in order
//   6. Admin sidebar has 14+ nav items (including Errores)
// =====================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const ACTUAL_FRONTEND_DIR = fs.existsSync(FRONTEND_DIR)
  ? FRONTEND_DIR
  : path.join(__dirname, '..', '..', '..', 'Samba_Pos_V3-Web', 'frontend');
const F = ACTUAL_FRONTEND_DIR;

describe('Bloque 8 — Tablet layout', () => {
  test('tablet-layout.css exists', () => {
    const file = path.join(F, 'css', 'tablet-layout.css');
    assert.ok(fs.existsSync(file), 'tablet-layout.css should exist');
    const content = fs.readFileSync(file, 'utf8');
    // Should have tablet viewport rules
    assert.ok(content.includes('@media (min-width: 768px)'), 'should have 768px breakpoint');
    assert.ok(content.includes('.kds-card'), 'should style KDS cards');
    assert.ok(content.includes('.pos-products__grid'), 'should style POS product grid');
    assert.ok(content.includes('.pos-cmdbar'), 'should style POS command bar');
  });

  test('POS product grid has tablet-specific grid-template', () => {
    const content = fs.readFileSync(path.join(F, 'css', 'tablet-layout.css'), 'utf8');
    assert.ok(content.includes('grid-template-columns: repeat(auto-fill'), 'should use auto-fill grid');
    assert.ok(content.includes('minmax(150px'), 'should have 150px min for tablet');
  });

  test('KDS layout has column-based flexbox layout', () => {
    const content = fs.readFileSync(path.join(F, 'css', 'tablet-layout.css'), 'utf8');
    assert.ok(content.includes('.kds-column'), 'should have .kds-column');
    assert.ok(content.includes('flex: 0 0 320px'), 'should set column width 320px');
    assert.ok(content.includes('.kds-card__bump-btn'), 'should have bump button styling');
  });
});

describe('Bloque 6 — Android shell', () => {
  test('android-shell.css exists with safe-area support', () => {
    const file = path.join(F, 'css', 'android-shell.css');
    assert.ok(fs.existsSync(file));
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('env(safe-area-inset-top'), 'should use safe-area env()');
    assert.ok(content.includes('html.is-android'), 'should have android html class');
    assert.ok(content.includes('html.is-tablet'), 'should have tablet html class');
    assert.ok(content.includes('html.is-kiosk'), 'should have kiosk html class');
  });

  test('android-shell.js exposes ANDROID_SHELL', () => {
    const file = path.join(F, 'js', 'services', 'android-shell.js');
    assert.ok(fs.existsSync(file));
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('window.ANDROID_SHELL'), 'should expose ANDROID_SHELL');
    assert.ok(content.includes('detectPlatform'), 'should have detectPlatform');
    assert.ok(content.includes('detectFormFactor'), 'should have detectFormFactor');
    assert.ok(content.includes('detectOrientation'), 'should have detectOrientation');
    assert.ok(content.includes('initCapacitor'), 'should have initCapacitor');
  });
});

describe('Bloque 7 — Error reporter', () => {
  test('error-reporter.js exposes ErrorReporter', () => {
    const file = path.join(F, 'js', 'services', 'error-reporter.js');
    assert.ok(fs.existsSync(file));
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('window.ErrorReporter'), 'should expose ErrorReporter');
    assert.ok(content.includes('window.onerror'), 'should install window.onerror handler');
    assert.ok(content.includes('unhandledrejection'), 'should handle Promise rejections');
    assert.ok(content.includes('console.error'), 'should override console.error');
    assert.ok(content.includes('localStorage'), 'should use localStorage for queue');
    assert.ok(content.includes('flush'), 'should have flush method');
    assert.ok(content.includes('reportError'), 'should expose reportError()');
  });
});

describe('index.html — registers all new assets in order', () => {
  test('all CSS files loaded in correct order', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const order = [
      'reset.css',
      'design-system.css',
      'variables.css',
      'layout.css',
      'components.css',
      'mobile.css',
      'android-shell.css',
      'tablet-layout.css',
    ];
    let lastIndex = -1;
    for (const css of order) {
      const idx = html.indexOf(`/css/${css}`);
      assert.ok(idx > -1, `should reference ${css}`);
      assert.ok(idx > lastIndex, `${css} should come after previous CSS files`);
      lastIndex = idx;
    }
  });

  test('all JS files loaded in correct order', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const order = [
      'flex-button.js',
      'android-shell.js',
      'server-config.js',
      'demo-data.js',
      'api.js',
      'pwa.js',
      'push.js',
      'error-reporter.js',
      'store.js',
      'offlineQueue.js',
      'websocket-client.js',
      'login.js',
      'dashboard.js',
      'pos.js',
      'payment.js',
      'kitchen.js',
      'admin.js',
      'app.js',
    ];
    let lastIndex = -1;
    for (const js of order) {
      const idx = html.indexOf(js);
      assert.ok(idx > -1, `should reference ${js}`);
      assert.ok(idx > lastIndex, `${js} should come after previous JS files (got idx ${idx}, prev ${lastIndex})`);
      lastIndex = idx;
    }
  });

  test('admin sidebar has Errores nav item', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    assert.ok(html.includes('data-admin-tab="errors"'), 'should have errors tab in admin sidebar');
    assert.ok(html.includes('<span>Errores</span>'), 'should have visible Errores label');
  });

  test('admin sidebar has ≥14 nav items (Bloque 3 + Bloque 7)', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    const matches = html.match(/data-admin-tab="/g) || [];
    assert.ok(matches.length >= 14, `should have ≥14 nav items, got ${matches.length}`);
  });
});
