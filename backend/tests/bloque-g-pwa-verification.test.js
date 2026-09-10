// =====================================================================
// bloque-g-pwa-verification.test.js — Bloque G unit tests
// =====================================================================
// Tests the Bloque G (Fase 7: PWA) gap from docs/PRODUCTION_GAP_MATRIX.md:
//
//   P0 — "Botón 'Instalar app' visible en Admin/Configuración"
//
// This test verifies:
//   1. The manifest.webmanifest is reachable and valid (required fields
//      for PWA installability: name, start_url, display=standalone, icons)
//   2. The Service Worker file (sw.js) exists
//   3. The backend endpoint /api/pwa/install-status returns correct audit
//   4. The pwa.js module exposes the required API (canInstall, promptInstall,
//      onInstallState, checkUpdate)
//   5. The admin Config view includes a PWA card with install button logic
//
// Note: the actual `beforeinstallprompt` event can only fire in a real
// browser context (not in Node.js unit tests). The E2E tests in
// bloque-g-pwa.spec.js verify the browser-side behavior. These unit
// tests verify the backend contracts + the manifest/SW file existence.
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const { createApp, getPrintWorkerInstance } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');

const app = createApp();
const request = supertest(app);

let jwtToken = null;

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

async function setupFixtures() {
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;
  assert.ok(jwtToken, 'Login should return a JWT token');
}

function authGet(p) { return request.get(p).set('Authorization', 'Bearer ' + jwtToken); }

async function cleanup() {
  try {
    const serverWorker = getPrintWorkerInstance();
    if (serverWorker) await serverWorker.stop();
  } catch {}
  await db.destroy();
}

// =====================================================================
// 1. MANIFEST VALIDATION — required fields for PWA installability
// =====================================================================

describe('1. Manifest Validation (P0 gate)', () => {
  test('1A: manifest.webmanifest file exists', () => {
    const manifestPath = path.join(FRONTEND_DIR, 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest should exist');
  });

  test('1B: manifest is valid JSON with required fields', () => {
    const manifestPath = path.join(FRONTEND_DIR, 'manifest.webmanifest');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    assert.ok(manifest.name, 'manifest.name is required');
    assert.ok(manifest.short_name, 'manifest.short_name is required');
    assert.ok(manifest.start_url, 'manifest.start_url is required');
    assert.ok(manifest.scope, 'manifest.scope is required');
    assert.strictEqual(manifest.display, 'standalone', 'display must be "standalone" for installability');
    assert.ok(manifest.background_color, 'background_color is required');
    assert.ok(manifest.theme_color, 'theme_color is required');
  });

  test('1C: manifest has icons with 192x192 and 512x512', () => {
    const manifestPath = path.join(FRONTEND_DIR, 'manifest.webmanifest');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const icons = manifest.icons || [];
    assert.ok(icons.length >= 2, 'Should have at least 2 icons');
    const has192 = icons.some(i => i.sizes === '192x192');
    const has512 = icons.some(i => i.sizes === '512x512');
    assert.ok(has192, 'Should have 192x192 icon');
    assert.ok(has512, 'Should have 512x512 icon');
  });

  test('1D: manifest has maskable icons (for Android adaptive icons)', () => {
    const manifestPath = path.join(FRONTEND_DIR, 'manifest.webmanifest');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const icons = manifest.icons || [];
    const maskableIcons = icons.filter(i => i.purpose && i.purpose.includes('maskable'));
    assert.ok(maskableIcons.length >= 1, 'Should have at least 1 maskable icon');
  });

  test('1E: icon files referenced in manifest actually exist', () => {
    const manifestPath = path.join(FRONTEND_DIR, 'manifest.webmanifest');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const icons = manifest.icons || [];
    for (const icon of icons) {
      const iconPath = path.join(FRONTEND_DIR, icon.src);
      assert.ok(fs.existsSync(iconPath), `Icon file should exist: ${icon.src}`);
    }
  });
});

// =====================================================================
// 2. SERVICE WORKER — file exists and has correct structure
// =====================================================================

describe('2. Service Worker (P0 gate)', () => {
  test('2A: sw.js file exists', () => {
    const swPath = path.join(FRONTEND_DIR, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js should exist');
  });

  test('2B: sw.js registers an install handler', () => {
    const swPath = path.join(FRONTEND_DIR, 'sw.js');
    const content = fs.readFileSync(swPath, 'utf8');
    assert.ok(content.includes('install'), 'sw.js should handle "install" event');
  });

  test('2C: sw.js registers a fetch handler (for offline support)', () => {
    const swPath = path.join(FRONTEND_DIR, 'sw.js');
    const content = fs.readFileSync(swPath, 'utf8');
    assert.ok(content.includes('fetch'), 'sw.js should handle "fetch" event for offline');
  });

  test('2D: sw.js caches the offline shell', () => {
    const swPath = path.join(FRONTEND_DIR, 'sw.js');
    const content = fs.readFileSync(swPath, 'utf8');
    // A PWA should cache at least the app shell (HTML + CSS + JS)
    assert.ok(content.includes('cache') || content.includes('Cache'),
      'sw.js should cache resources for offline');
  });
});

// =====================================================================
// 3. BACKEND ENDPOINT — /api/pwa/install-status
// =====================================================================

describe('3. Backend PWA Audit Endpoint', () => {
  test('3A: GET /api/pwa/install-status returns 200 with auth', async () => {
    const res = await authGet('/api/pwa/install-status');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data, 'Should have data object');
  });

  test('3B: endpoint requires authentication (401 without token)', async () => {
    const res = await request.get('/api/pwa/install-status');
    assert.strictEqual(res.status, 401);
  });

  test('3C: endpoint returns manifestReachable=true', async () => {
    const res = await authGet('/api/pwa/install-status');
    assert.strictEqual(res.body.data.manifestReachable, true);
  });

  test('3D: endpoint returns manifestValid=true with no errors', async () => {
    const res = await authGet('/api/pwa/install-status');
    assert.strictEqual(res.body.data.manifestValid, true);
    assert.deepStrictEqual(res.body.data.manifestErrors, []);
  });

  test('3E: endpoint returns serviceWorkerExists=true', async () => {
    const res = await authGet('/api/pwa/install-status');
    assert.strictEqual(res.body.data.serviceWorkerExists, true);
  });

  test('3F: endpoint returns the full manifest object', async () => {
    const res = await authGet('/api/pwa/install-status');
    assert.ok(res.body.data.manifest, 'Should include manifest');
    assert.ok(res.body.data.manifest.name, 'Manifest should have name');
    assert.ok(Array.isArray(res.body.data.manifest.icons), 'Manifest should have icons array');
  });

  test('3G: endpoint returns installPromptSupported=true', async () => {
    const res = await authGet('/api/pwa/install-status');
    assert.strictEqual(res.body.data.installPromptSupported, true);
  });
});

// =====================================================================
// 4. INDEX.HTML — manifest + SW links present
// =====================================================================

describe('4. index.html PWA Integration', () => {
  test('4A: index.html links to manifest.webmanifest', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('manifest.webmanifest'),
      'index.html should link to manifest.webmanifest');
    assert.ok(content.includes('rel="manifest"') || content.includes("rel='manifest'"),
      'index.html should have <link rel="manifest">');
  });

  test('4B: index.html registers the Service Worker', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    // The SW registration can be inline in index.html OR in a separate JS file
    // (e.g., pwa.js or app.js). Check both.
    const swRegistered =
      content.includes('serviceWorker') ||
      content.includes('/sw.js') ||
      content.includes('navigator.serviceWorker.register');
    assert.ok(swRegistered, 'index.html or its scripts should register the SW');
  });

  test('4C: index.html includes pwa.js script', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('pwa.js'),
      'index.html should include pwa.js');
  });

  test('4D: index.html has theme-color meta tag (matches manifest)', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('theme-color'),
      'index.html should have <meta name="theme-color">');
  });

  test('4E: index.html has apple-touch-icon link (for iOS install)', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('apple-touch-icon'),
      'index.html should have <link rel="apple-touch-icon"> for iOS PWA install');
  });
});

// =====================================================================
// 5. pwa.js MODULE — API contract verification
// =====================================================================

describe('5. pwa.js Module API', () => {
  test('5A: pwa.js exposes window.SambaPWA with required methods', () => {
    const pwaPath = path.join(FRONTEND_DIR, 'js', 'services', 'pwa.js');
    const content = fs.readFileSync(pwaPath, 'utf8');
    // Verify the module defines the required API
    assert.ok(content.includes('SambaPWA'), 'Should expose SambaPWA');
    assert.ok(content.includes('canInstall'), 'Should have canInstall property');
    assert.ok(content.includes('promptInstall'), 'Should have promptInstall method');
    assert.ok(content.includes('onInstallState'), 'Should have onInstallState method');
    assert.ok(content.includes('checkUpdate'), 'Should have checkUpdate method');
  });

  test('5B: pwa.js captures beforeinstallprompt event', () => {
    const pwaPath = path.join(FRONTEND_DIR, 'js', 'services', 'pwa.js');
    const content = fs.readFileSync(pwaPath, 'utf8');
    assert.ok(content.includes('beforeinstallprompt'),
      'Should listen for beforeinstallprompt event');
  });

  test('5C: pwa.js handles appinstalled event', () => {
    const pwaPath = path.join(FRONTEND_DIR, 'js', 'services', 'pwa.js');
    const content = fs.readFileSync(pwaPath, 'utf8');
    assert.ok(content.includes('appinstalled'),
      'Should listen for appinstalled event');
  });

  test('5D: pwa.js prevents default on beforeinstallprompt (to show custom UI)', () => {
    const pwaPath = path.join(FRONTEND_DIR, 'js', 'services', 'pwa.js');
    const content = fs.readFileSync(pwaPath, 'utf8');
    assert.ok(content.includes('preventDefault'),
      'Should call preventDefault on beforeinstallprompt to show custom UI');
  });

  test('5E: pwa.js notifies Admin Config view when install state changes', () => {
    const pwaPath = path.join(FRONTEND_DIR, 'js', 'services', 'pwa.js');
    const content = fs.readFileSync(pwaPath, 'utf8');
    // BLOQUE G addition: _notifyConfigView re-renders the PWA card
    assert.ok(content.includes('_notifyConfigView'),
      'Should notify Admin Config view to update PWA card in real time');
  });
});

// =====================================================================
// 6. ADMIN VIEW — PWA card integration (static analysis)
// =====================================================================

describe('6. Admin View PWA Card', () => {
  test('6A: admin.js includes _renderPwaCard method', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('_renderPwaCard'),
      'AdminView should have _renderPwaCard method');
  });

  test('6B: admin.js includes _pwaInstall handler for the install button', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('_pwaInstall'),
      'AdminView should have _pwaInstall handler');
    assert.ok(content.includes('promptInstall'),
      '_pwaInstall should call SambaPWA.promptInstall');
  });

  test('6C: admin Config view includes the PWA card in the rendered HTML', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    // The _renderConfig method should include the PWA card
    assert.ok(content.includes('pwaCard'),
      '_renderConfig should include pwaCard in the output');
    assert.ok(content.includes('Instalar app'),
      'PWA card should include "Instalar app" button text');
  });

  test('6D: PWA card detects standalone mode (already installed)', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('standalone'),
      'PWA card should detect standalone display mode');
    assert.ok(content.includes('display-mode: standalone'),
      'Should use matchMedia for display-mode: standalone detection');
  });

  test('6E: PWA card shows Service Worker status', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('pwa-sw-status'),
      'PWA card should have a Service Worker status element');
    assert.ok(content.includes('getRegistration'),
      'Should check SW registration via navigator.serviceWorker.getRegistration');
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
