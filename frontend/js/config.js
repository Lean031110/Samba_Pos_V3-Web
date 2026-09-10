// =====================================================================
// config.js — LBApos runtime configuration (SINGLE SOURCE OF TRUTH)
// =====================================================================
// Loaded FIRST in index.html (before every other script).
//
// Responsibilities:
//   1. APP_BASE_PATH — base path under which the app is served.
//        ''            → auto-detect from the document URL (default)
//        '/'           → production at domain root
//        '/SubPath/'   → e.g. GitHub Pages project pages
//      It controls: asset URLs, manifest, service worker scope,
//      navigation and icon/notification paths.
//
//   2. DEMO_MODE — explicit, opt-in demo configuration.
//      - false (default) → the app NEVER touches the Mock API.
//        A production build (backend LAN / Android APK) cannot
//        accidentally run on mock data: the mock only activates when
//        this flag is EXPLICITLY true.
//      - true → mock API + demo data (GitHub Pages demo).
//      The demo overlay is applied at deploy time by copying
//      `config.demo.js` over this file (see .github/workflows/pages.yml).
//      Nothing is patched with sed.
//
// Build matrix:
//   Backend LAN (production) : config.js as committed here (DEMO_MODE=false)
//   Android APK (Capacitor)  : config.js as committed here (DEMO_MODE=false)
//   GitHub Pages demo        : config.demo.js copied over js/config.js
//   Local browser            : config.js as committed here
// =====================================================================

window.LBA_CONFIG = {
  // '' = auto-detect (recommended: works at root AND under a sub-path).
  // Override ONLY when auto-detection is not enough.
  APP_BASE_PATH: '',

  // ⚠️ Production default. NEVER set this to true in a release build.
  // Demo builds are produced exclusively by the Pages workflow overlay.
  DEMO_MODE: false,

  // App identity (used by the shell and the Android welcome screen).
  APP_NAME: 'LBApos',
  APP_VERSION: '0.4.0',
};

// ---------------------------------------------------------------------
// Base path resolution — happens once, at load time.
// ---------------------------------------------------------------------
(function resolveBasePath() {
  var cfg = window.LBA_CONFIG || {};
  var base = '';

  if (cfg.APP_BASE_PATH && typeof cfg.APP_BASE_PATH === 'string') {
    // Explicit override — normalize to '/path/' form.
    base = cfg.APP_BASE_PATH;
    if (base.charAt(0) !== '/') base = '/' + base;
    if (base.charAt(base.length - 1) !== '/') base = base + '/';
  } else {
    // Auto-detect from the document URL. The SPA is a single document
    // served at {base}/index.html (or {base}/), so the directory part of
    // the current URL IS the base path. Works at '/', under any project
    // sub-path (GitHub Pages), inside Capacitor (https://localhost/) and
    // in every browser without extra configuration.
    var p = window.location.pathname;
    p = p.replace(/index\.html?$/i, '');
    if (p.charAt(0) !== '/') p = '/' + p;
    if (p !== '/' && p.charAt(p.length - 1) !== '/') p = p + '/';
    base = p;
  }

  // Exported for every module that builds asset / SW / icon URLs.
  window.LBA_BASE = base;
})();

// ---------------------------------------------------------------------
// DEMO_MODE derivation (legacy alias, kept so existing modules keep
// working — but ONLY this file may define it).
// ---------------------------------------------------------------------
window.DEMO_MODE = !!(window.LBA_CONFIG && window.LBA_CONFIG.DEMO_MODE === true);

if (window.DEMO_MODE) {
  // Loud and unmistakable: any developer / QA opening the console of a
  // demo build immediately sees this banner.
  console.warn(
    '%c[LBApos] MODO DEMO ACTIVO — datos ficticios (Mock API). ' +
    'Esta build NO está conectada a ningún backend real.',
    'background:#b45309;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold'
  );
}
