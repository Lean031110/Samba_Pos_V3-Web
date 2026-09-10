/* =====================================================================
 * sw.js — SambaPos_LBA Service Worker
 * =====================================================================
 * Strategy:
 *   - Precache the "offline shell" (CSS, vendor JS, manifest) on install.
 *   - Cache-first for static assets (CSS, vendor JS, fonts, icons).
 *   - Network-first for navigations (HTML), falling back to cached shell
 *     when the network is unavailable (offline mode).
 *   - Stale-while-revalidate for images under /icons/.
 *   - NEVER cache /api/* or /health, /ready, /version (always network).
 * ===================================================================== */

const SW_VERSION = 'sambapos-lba-v0.4.0';
const OFFLINE_SHELL_CACHE = `${SW_VERSION}-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

// ---------------------------------------------------------------------
// APP_BASE_PATH (PR #9 hardening)
// The SW script URL is {base}/sw.js, so its own directory IS the base
// path ('/' in production, '/Samba_Pos_V3-Web/' on GitHub Pages).
// Every precache / offline URL is resolved from it, so the same
// artifact works at the root AND under any sub-path with zero
// deploy-time patching.
// NOTE: new URL() requires an ABSOLUTE base — self.location.href, not a
// pathname — or the SW fails to evaluate ("Invalid base URL").
// ---------------------------------------------------------------------
const SCOPE_URL = new URL('.', self.location.href);      // 'http://host/…/'
const BASE_PATH = SCOPE_URL.pathname;                    // '/…/'
const BASE = (p) => new URL(String(p).replace(/^\/+/, ''), SCOPE_URL).pathname;

const OFFLINE_URL = BASE('offline.html');

const PRECACHE_URLS = [
  BASE('.'),
  BASE('index.html'),
  BASE('offline.html'),
  BASE('manifest.webmanifest'),
  BASE('css/reset.css'),
  BASE('css/variables.css'),
  BASE('css/layout.css'),
  BASE('css/components.css'),
  BASE('js/app.js'),
  BASE('js/config.js'),
  BASE('js/services/api.js'),
  BASE('js/store/store.js'),
  BASE('js/store/websocket-client.js'),
  BASE('vendor/css/fontawesome.min.css'),
  BASE('vendor/js/socket.io.min.js'),
];

// Routes that must NEVER be cached (always go to network).
// Anchored to the live BASE_PATH, not to '/'.
const NEVER_CACHE = [
  new RegExp(`^${BASE('api')}`),
  new RegExp(`^${BASE('health')}$`),
  new RegExp(`^${BASE('ready')}$`),
  new RegExp(`^${BASE('version')}$`),
  new RegExp(`^${BASE('socket.io/')}`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] precache error:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(SW_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET. Other methods (POST/PUT/DELETE) always go to network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Cross-origin requests bypass the SW.
  if (url.origin !== self.location.origin) return;

  // Never cache API / health / ready / version / socket.io
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  // Navigations (HTML pages) — network-first, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Static assets (CSS, JS, fonts) — cache-first.
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Images — stale-while-revalidate.
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default — try network, fall back to cache.
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

async function networkFirstNavigation(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match(BASE('index.html'));
    if (shell) return shell;
    return caches.match(OFFLINE_URL);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Offline and not cached.
    return new Response('', { status: 504, statusText: 'Sin conexion' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok && fresh.type === 'basic') {
        cache.put(request, fresh.clone());
      }
      return fresh;
    })
    .catch(() => cached);
  return cached || network;
}

function isStaticAsset(request) {
  return (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'manifest'
  );
}

// Listen for messages from the page (e.g., to trigger an update).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
