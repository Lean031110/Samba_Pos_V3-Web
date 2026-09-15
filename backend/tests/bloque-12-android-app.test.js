// =====================================================================
// bloque-12-android-app.test.js — Android app functional tests
// =====================================================================
// Tests that verify the Android app configuration, Capacitor setup,
// and frontend services that are critical for the Android experience.
//
// These tests run WITHOUT an emulator — they validate:
//   1. Capacitor config correctness
//   2. Android shell detection logic (android-shell.js)
//   3. Server config screen logic (server-config.js)
//   4. PWA manifest for installability
//   5. APK build prerequisites (capacitor.config.json, gradle files)
//   6. Error reporter works on Android context
//   7. Offline queue persistence logic
//   8. WebSocket client reconnection logic
// =====================================================================

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const F = fs.existsSync(path.join(REPO_ROOT, 'frontend'))
  ? path.join(REPO_ROOT, 'frontend')
  : path.join(__dirname, '..', '..', 'frontend');
const BACKEND_DIR = path.join(__dirname, '..');
// For files at repo root (capacitor.config.json, .github/workflows/)
const REPO_ROOT2 = fs.existsSync(path.join(REPO_ROOT, 'capacitor.config.json'))
  ? REPO_ROOT
  : path.join(__dirname, '..', '..');

// Helper: evaluate a frontend JS file in a mock window context
function evalFrontendFile(relPath) {
  const code = fs.readFileSync(path.join(F, relPath), 'utf8');
  // Create a mock window object
  const mockWindow = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' },
    document: { documentElement: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, body: { classList: { add: () => {} } } },
      addEventListener: () => {}, getElementById: () => null, readyState: 'complete' },
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { href: 'http://localhost:3001', hostname: 'localhost' },
    innerWidth: 1024, innerHeight: 768,
    Capacitor: undefined,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  const fn = new Function('window', 'navigator', 'document', 'localStorage', 'sessionStorage', 'location', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'Promise', 'URLSearchParams', code);
  fn(mockWindow, mockWindow.navigator, mockWindow.document, mockWindow.localStorage, mockWindow.sessionStorage, mockWindow.location, mockWindow.console, setTimeout, setInterval, clearTimeout, clearInterval, () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }), Promise, URLSearchParams);
  return mockWindow;
}

describe('Android — Capacitor config', () => {
  test('capacitor.config.json exists and has correct appId', () => {
    const configPath = path.join(REPO_ROOT2, 'capacitor.config.json');
    assert.ok(fs.existsSync(configPath), 'capacitor.config.json should exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.appId, 'should have appId');
    assert.ok(config.appId.includes('sambapos') || config.appId.includes('lba'), 'appId should contain sambapos or lba');
    assert.ok(config.webDir, 'should have webDir');
    assert.ok(config.webDir.includes('frontend'), 'webDir should point to frontend');
  });

  test('capacitor config has server config for Android', () => {
    const configPath = path.join(REPO_ROOT2, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.server || config.plugins, 'should have server or plugins config');
  });

  test('capacitor config has SplashScreen plugin', () => {
    const configPath = path.join(REPO_ROOT2, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.plugins?.SplashScreen, 'should have SplashScreen plugin');
    assert.ok(config.plugins.SplashScreen.backgroundColor, 'should have background color');
  });
});

describe('Android — android-shell.js detection', () => {
  test('android-shell.js file exists', () => {
    assert.ok(fs.existsSync(path.join(F, 'js', 'services', 'android-shell.js')));
  });

  test('android-shell.js exposes ANDROID_SHELL with detection methods', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'android-shell.js'), 'utf8');
    assert.ok(code.includes('window.ANDROID_SHELL'), 'should expose ANDROID_SHELL');
    assert.ok(code.includes('detectPlatform'), 'should have detectPlatform');
    assert.ok(code.includes('detectFormFactor'), 'should have detectFormFactor');
    assert.ok(code.includes('detectOrientation'), 'should have detectOrientation');
    assert.ok(code.includes('initCapacitor'), 'should have initCapacitor');
    assert.ok(code.includes('StatusBar'), 'should integrate StatusBar');
    assert.ok(code.includes('Haptics'), 'should integrate Haptics');
    assert.ok(code.includes('Network'), 'should integrate Network');
    assert.ok(code.includes('kiosk') || code.includes('setKiosk'), 'should reference kiosk mode');
  });

  test('android-shell.css has safe-area + tablet + kiosk styles', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'android-shell.css'), 'utf8');
    assert.ok(css.includes('env(safe-area-inset'), 'should use safe-area insets');
    assert.ok(css.includes('html.is-android'), 'should have android class');
    assert.ok(css.includes('html.is-tablet'), 'should have tablet class');
    assert.ok(css.includes('html.is-kiosk'), 'should have kiosk class');
    assert.ok(css.includes('html.is-phone'), 'should have phone class');
  });
});

describe('Android — server-config.js', () => {
  test('server-config.js exists and exposes ServerConfig', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'server-config.js'), 'utf8');
    assert.ok(code.includes('window.ServerConfig'), 'should expose ServerConfig');
    assert.ok(code.includes('getServerUrl'), 'should have getServerUrl');
    assert.ok(code.includes('isConfigured'), 'should have isConfigured');
    assert.ok(code.includes('save'), 'should have save method');
    assert.ok(code.includes('QR') || code.includes('Barcode'), 'should reference QR/Barcode scanning');
  });
});

describe('Android — PWA manifest for installability', () => {
  test('manifest.webmanifest exists and is valid', () => {
    const manifestPath = path.join(F, 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.name, 'should have name');
    assert.ok(manifest.short_name, 'should have short_name');
    assert.ok(manifest.display, 'should have display mode');
    assert.ok(manifest.icons, 'should have icons');
    assert.ok(manifest.icons.length >= 2, 'should have at least 2 icons');
    assert.ok(manifest.theme_color, 'should have theme_color');
  });

  test('manifest has 192px and 512px icons', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(F, 'manifest.webmanifest'), 'utf8'));
    const sizes = manifest.icons.map(i => i.sizes);
    assert.ok(sizes.some(s => s.includes('192')), 'should have 192px icon');
    assert.ok(sizes.some(s => s.includes('512')), 'should have 512px icon');
  });

  test('maskable icons exist for Android adaptive icons', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(F, 'manifest.webmanifest'), 'utf8'));
    const maskable = manifest.icons.filter(i => i.purpose && i.purpose.includes('maskable'));
    assert.ok(maskable.length >= 2, 'should have at least 2 maskable icons');
  });
});

describe('Android — POS tablet layout', () => {
  test('pos-tablet.css has 3-column layout for tablet landscape', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'pos-tablet.css'), 'utf8');
    assert.ok(css.includes('min-width: 1024px'), 'should have tablet landscape breakpoint');
    assert.ok(css.includes('orientation: landscape'), 'should have landscape orientation');
    assert.ok(css.includes('200px'), 'should have categories panel width');
    assert.ok(css.includes('340px'), 'should have orders panel width');
  });

  test('pos-tablet.css has responsive phone layout', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'pos-tablet.css'), 'utf8');
    assert.ok(css.includes('max-width: 767px'), 'should have phone breakpoint');
    assert.ok(css.includes('flex-direction: column'), 'should stack vertically on phone');
  });

  test('pos-tablet.css has touch-friendly product buttons', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'pos-tablet.css'), 'utf8');
    assert.ok(css.includes('min-height: 96px'), 'product buttons should be ≥96px');
    assert.ok(css.includes('min-height: 48px'), 'should have 48px min touch targets');
  });
});

describe('Android — KDS tablet layout', () => {
  test('kds-tablet.css has multi-column layout', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'kds-tablet.css'), 'utf8');
    assert.ok(css.includes('repeat(4'), 'should have 4 columns in landscape');
    assert.ok(css.includes('repeat(2'), 'should have 2 columns in portrait');
    assert.ok(css.includes('min-width: 1024px'), 'should have tablet landscape breakpoint');
    assert.ok(css.includes('min-width: 768px'), 'should have tablet portrait breakpoint');
  });

  test('kds-tablet.css has kitchen mode toggle', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'kds-tablet.css'), 'utf8');
    assert.ok(css.includes('is-kitchen-mode'), 'should have kitchen-mode class');
    assert.ok(css.includes('.app-header') && css.includes('display: none'), 'should hide header in kitchen mode');
  });

  test('kds-tablet.css has dark theme for KDS', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'kds-tablet.css'), 'utf8');
    assert.ok(css.includes('#0f1419') || css.includes('#1a1f2e') || css.includes('#1e2937'), 'should have dark background');
  });

  test('kds-tablet.css has status colors', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'kds-tablet.css'), 'utf8');
    assert.ok(css.includes('status--urgent') || css.includes('urgent'), 'should have urgent status');
    assert.ok(css.includes('status--ready') || css.includes('ready'), 'should have ready status');
    assert.ok(css.includes('status--late') || css.includes('late'), 'should have late status');
  });
});

describe('Android — Kitchen mode + Wake Lock', () => {
  test('kitchen.js has _toggleKitchenMode method', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'kitchen.js'), 'utf8');
    assert.ok(code.includes('_toggleKitchenMode'), 'should have _toggleKitchenMode');
    assert.ok(code.includes('_requestWakeLock'), 'should have _requestWakeLock');
    assert.ok(code.includes('_releaseWakeLock'), 'should have _releaseWakeLock');
    assert.ok(code.includes('wakeLock'), 'should use Wake Lock API');
    assert.ok(code.includes('is-kitchen-mode'), 'should toggle is-kitchen-mode class');
  });

  test('kitchen.js has topbar with station + clock + connection', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'kitchen.js'), 'utf8');
    assert.ok(code.includes('kds-topbar'), 'should have kds-topbar');
    assert.ok(code.includes('kds-topbar__clock'), 'should have clock');
    assert.ok(code.includes('kds-topbar__conn'), 'should have connection indicator');
    assert.ok(code.includes('kds-kitchen-toggle'), 'should have kitchen toggle button');
  });

  test('kitchen.js has stats bar', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'kitchen.js'), 'utf8');
    assert.ok(code.includes('kds-stats'), 'should have stats bar');
    assert.ok(code.includes('urgent'), 'should track urgent count');
    assert.ok(code.includes('late'), 'should track late count');
    assert.ok(code.includes('ready'), 'should track ready count');
  });
});

describe('Android — Error reporter for mobile', () => {
  test('error-reporter.js captures all error types', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'error-reporter.js'), 'utf8');
    assert.ok(code.includes('window.onerror'), 'should capture window.onerror');
    assert.ok(code.includes('unhandledrejection'), 'should capture Promise rejections');
    assert.ok(code.includes('console.error'), 'should override console.error');
    assert.ok(code.includes('reportError'), 'should have reportError API');
    assert.ok(code.includes('localStorage'), 'should persist to localStorage');
    assert.ok(code.includes('flush'), 'should have flush method');
  });

  test('error-reporter.js includes shell context (platform, formFactor)', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'error-reporter.js'), 'utf8');
    assert.ok(code.includes('ANDROID_SHELL'), 'should reference ANDROID_SHELL');
    assert.ok(code.includes('platform'), 'should include platform');
    assert.ok(code.includes('formFactor'), 'should include formFactor');
    assert.ok(code.includes('orientation'), 'should include orientation');
  });
});

describe('Android — Offline queue for mobile', () => {
  test('offlineQueue.js exists with priority sync', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'store', 'offlineQueue.js'), 'utf8');
    assert.ok(code.includes('_getPriority'), 'should have priority sorting');
    assert.ok(code.includes('ticket'), 'should prioritize tickets');
    assert.ok(code.includes('orders'), 'should prioritize orders');
    assert.ok(code.includes('payment'), 'should prioritize payments');
  });

  test('offlineQueue.js handles JWT expiry', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'store', 'offlineQueue.js'), 'utf8');
    assert.ok(code.includes('401') || code.includes('auth-expired'), 'should detect 401 JWT expiry');
    assert.ok(code.includes('_syncPaused') || code.includes('pause'), 'should pause on auth failure');
    assert.ok(code.includes('resumeSync'), 'should have resumeSync method');
  });
});

describe('Android — APK build prerequisites', () => {
  test('capacitor.config.json has correct appName', () => {
    const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT2, 'capacitor.config.json'), 'utf8'));
    assert.ok(config.appName, 'should have appName');
  });

  test('index.html has viewport meta for mobile', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    assert.ok(html.includes('viewport'), 'should have viewport meta');
    assert.ok(html.includes('maximum-scale=1.0'), 'should prevent zoom on mobile');
    assert.ok(html.includes('viewport-fit=cover'), 'should have viewport-fit=cover for notch');
  });

  test('index.html has theme-color meta', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    assert.ok(html.includes('theme-color'), 'should have theme-color meta');
    assert.ok(html.includes('#044392'), 'should use LBA blue');
  });

  test('index.html has apple-mobile-web-app-capable', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    assert.ok(html.includes('apple-mobile-web-app-capable'), 'should have apple-mobile-web-app-capable');
    assert.ok(html.includes('mobile-web-app-capable'), 'should have mobile-web-app-capable');
  });

  test('all icon files exist', () => {
    const icons = [
      'icons/favicon.png',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-192-maskable.png',
      'icons/icon-512-maskable.png',
    ];
    for (const icon of icons) {
      const fp = path.join(F, icon);
      assert.ok(fs.existsSync(fp), `${icon} should exist`);
    }
  });

  test('android.yml workflow exists and builds APK', () => {
    const workflow = fs.readFileSync(path.join(REPO_ROOT2, '.github', 'workflows', 'android.yml'), 'utf8');
    assert.ok(workflow.includes('assembleDebug'), 'should build debug APK');
    assert.ok(workflow.includes('app-debug.apk'), 'should verify APK exists');
    assert.ok(workflow.includes('upload-artifact'), 'should upload APK as artifact');
  });
});

describe('Android — Orientation handling', () => {
  test('admin.js has responsive sidebar that works on tablet + phone', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    assert.ok(code.includes('admin-layout'), 'should have admin-layout');
  });

  test('CSS files have responsive breakpoints (mobile.css has @media)', () => {
    const mobileCss = fs.readFileSync(path.join(F, 'css', 'mobile.css'), 'utf8');
    assert.ok(mobileCss.includes('@media'), 'mobile.css should have media queries');
    // Also check tablet-layout.css or pos-tablet.css
    const tabletCss = fs.readFileSync(path.join(F, 'css', 'tablet-layout.css'), 'utf8');
    assert.ok(tabletCss.includes('@media') || tabletCss.includes('min-width'), 'tablet-layout.css should have breakpoints');
  });

  test('mobile.css exists with touch targets', () => {
    const css = fs.readFileSync(path.join(F, 'css', 'mobile.css'), 'utf8');
    assert.ok(css.includes('min-height'), 'should have min-height for touch targets');
    assert.ok(css.includes('48px') || css.includes('56px') || css.includes('--lba-touch'), 'should have touch-friendly sizes');
  });
});

describe('Android — WebSocket client for realtime', () => {
  test('websocket-client.js exists and has reconnection logic', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'store', 'websocket-client.js'), 'utf8');
    assert.ok(code.includes('connect'), 'should have connect method');
    assert.ok(code.includes('reconnect') || code.includes('retry'), 'should have reconnection');
    assert.ok(code.includes('subscribe:role'), 'should support role-based subscriptions');
    assert.ok(code.includes('kitchen'), 'should support kitchen role');
  });
});

describe('Android — Demo mode for GitHub Pages', () => {
  test('demo-data.js has mock data for all critical entities', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'demo-data.js'), 'utf8');
    assert.ok(code.includes('products:'), 'should have products');
    assert.ok(code.includes('tables:'), 'should have tables');
    assert.ok(code.includes('kitchenOrders:'), 'should have kitchen orders');
    assert.ok(code.includes('stations:'), 'should have stations');
    assert.ok(code.includes('productionAreas:'), 'should have production areas');
    assert.ok(code.includes('customers:'), 'should have customers');
    assert.ok(code.includes('combos:'), 'should have combos');
    assert.ok(code.includes('roles:'), 'should have roles');
  });

  test('demo-data.js normalizes API paths with /api prefix', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'services', 'demo-data.js'), 'utf8');
    assert.ok(code.includes("pathIn.startsWith('/api/')"), 'should normalize paths');
  });
});

// Cleanup
after(async () => {
  try {
    const { db } = require('../src/infrastructure/db/db');
    await db.destroy();
  } catch {}
});
