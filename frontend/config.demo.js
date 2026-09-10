// =====================================================================
// config.demo.js — DEMO overlay for the GitHub Pages build
// =====================================================================
// THIS FILE IS NOT LOADED DIRECTLY BY THE APP.
//
// The Pages workflow copies it over `js/config.js` in the deployed
// artifact (a plain file copy — no sed patching, no build step):
//
//     cp frontend/config.demo.js _site/js/config.js
//
// Because the production `js/config.js` defaults to DEMO_MODE=false and
// the mock API only activates when this flag is EXPLICITLY true, a
// production build (backend LAN or Android APK) can never accidentally
// run on mock data. Demo and production are fully separated.
// =====================================================================

window.LBA_CONFIG = {
  // Auto-detect: on GitHub Pages the app lives at /Samba_Pos_V3-Web/.
  // Resolved at runtime from the document URL — no hardcoding needed.
  APP_BASE_PATH: '',

  DEMO_MODE: true, // ← the ONLY difference vs production config.js

  APP_NAME: 'LBApos',
  APP_VERSION: '0.4.0',
};

// --- Same runtime resolution as config.js (identical code) -----------
(function resolveBasePath() {
  var cfg = window.LBA_CONFIG || {};
  var base = '';
  if (cfg.APP_BASE_PATH && typeof cfg.APP_BASE_PATH === 'string') {
    base = cfg.APP_BASE_PATH;
    if (base.charAt(0) !== '/') base = '/' + base;
    if (base.charAt(base.length - 1) !== '/') base = base + '/';
  } else {
    var p = window.location.pathname;
    p = p.replace(/index\.html?$/i, '');
    if (p.charAt(0) !== '/') p = '/' + p;
    if (p !== '/' && p.charAt(p.length - 1) !== '/') p = p + '/';
    base = p;
  }
  window.LBA_BASE = base;
})();

window.DEMO_MODE = !!(window.LBA_CONFIG && window.LBA_CONFIG.DEMO_MODE === true);

if (window.DEMO_MODE) {
  console.warn(
    '%c[LBApos] MODO DEMO ACTIVO — datos ficticios (Mock API). ' +
    'Esta build NO está conectada a ningún backend real.',
    'background:#b45309;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold'
  );
}
