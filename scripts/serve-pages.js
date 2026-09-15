#!/usr/bin/env node
// =====================================================================
// serve-pages.js — local preview server for the GitHub Pages demo build
// =====================================================================
// Serves a directory under a sub-path so the Pages artifact can be tested
// locally EXACTLY as GitHub Pages will serve it:
//
//   node scripts/serve-pages.js <dir> <basePath> <port>
//
//   node scripts/serve-pages.js _site /Samba_Pos_V3-Web/ 8080
//   → http://localhost:8080/Samba_Pos_V3-Web/
//
// Used by .github/workflows/pages.yml (Playwright smoke test) and by
// scripts/pages-preview.sh for manual verification.
// Zero dependencies — plain http module.
// =====================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(process.argv[2] || '_site');
const basePath = ('/' + String(process.argv[3] || '/').replace(/^\/+|\/+$/g, '') + '/')
  .replace(/^\/\/$/, '/');
const port = parseInt(process.argv[4] || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  // Only serve under the configured base path.
  if (basePath !== '/' && !urlPath.startsWith(basePath)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`Not under base path ${basePath}`);
    return;
  }

  const rel = basePath === '/' ? urlPath : urlPath.slice(basePath.length);
  let filePath = path.normalize(path.join(rootDir, rel));

  // Path traversal guard.
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Directory → index.html.
  if (rel.endsWith('/') || rel === '') {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`Not found: ${rel}`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`[serve-pages] serving ${rootDir} at http://localhost:${port}${basePath}`);
});
