#!/usr/bin/env node
// =====================================================================
// build-pages-demo.js — build the GitHub Pages demo artifact
// =====================================================================
// Produces _site/ from frontend/ with exactly ONE deployment-time change:
//
//     cp frontend/config.demo.js → _site/js/config.js   (DEMO_MODE=true)
//
// No sed patching, no path rewriting. The app resolves APP_BASE_PATH at
// runtime from the document URL (GitHub Pages serves it under
// /Samba_Pos_V3-Web/), and every asset reference is relative.
//
//   node scripts/build-pages-demo.js [outDir]
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'frontend');
const outDir = path.resolve(process.argv[2] || path.join(repoRoot, '_site'));

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 1. Copy the static frontend verbatim.
copyDir(srcDir, outDir);

// 2. The single demo overlay: config.demo.js replaces js/config.js.
fs.copyFileSync(
  path.join(repoRoot, 'frontend', 'config.demo.js'),
  path.join(outDir, 'js', 'config.js')
);

// 3. Bypass Jekyll processing on GitHub Pages.
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

// 4. Sanity gates — the deploy must fail if the demo build is broken.
const required = [
  'index.html',
  'js/config.js',
  'js/app.js',
  'js/services/api.js',
  'js/services/demo-data.js',
  'manifest.webmanifest',
  'sw.js',
  'offline.html',
  'css/odoo19.css',
  'vendor/css/fontawesome.min.css',
  'vendor/js/socket.io.min.js',
  'icons/icon-192.png',
  'icons/favicon.png',
  'assets/logo-login.png',
  'assets/logo-header.png',
];
const missing = required.filter((f) => !fs.existsSync(path.join(outDir, f)));
if (missing.length > 0) {
  console.error(`[build-pages-demo] FAIL — missing files in artifact: ${missing.join(', ')}`);
  process.exit(1);
}

// 5. Verify the overlay actually took effect (demo config, not production).
const cfg = fs.readFileSync(path.join(outDir, 'js', 'config.js'), 'utf8');
if (!/DEMO_MODE:\s*true/.test(cfg)) {
  console.error('[build-pages-demo] FAIL — js/config.js is not the demo overlay');
  process.exit(1);
}

// 6. Verify no absolute-path references remain (they break under sub-paths).
const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const absRefs = index.match(/(?:href|src)="\/[^"]/g) || [];
if (absRefs.length > 0) {
  console.error(`[build-pages-demo] FAIL — absolute refs in index.html: ${absRefs.join(', ')}`);
  process.exit(1);
}

console.log(`[build-pages-demo] OK — demo artifact built at ${outDir}`);
console.log('[build-pages-demo] overlay: config.demo.js → js/config.js (DEMO_MODE=true)');
