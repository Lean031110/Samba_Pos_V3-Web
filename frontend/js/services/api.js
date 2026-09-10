// =====================================================================
// api.js — REST API client (fetch wrapper)
// =====================================================================
// All HTTP calls go through this module. Returns parsed JSON or throws
// an Error with the HTTP status code and body.
//
// FASE 11 integration:
//   - Write operations (POST/PUT/PATCH/DELETE) that should survive
//     offline are routed through OfflineQueue.enqueue() when the
//     browser is offline.
//   - Read operations (GET) always go directly to the server — if
//     offline, they fail immediately (no stale cache from outbox).
//   - Errors that are NOT retryable (400, 401, 403, 404, 409, 422)
//     are thrown immediately — they should NOT be enqueued.
//   - Errors that ARE retryable (network error, timeout, 502, 503, 504)
//     are enqueued for later sync when offline.
// =====================================================================

// API_BASE resolution is LAZY (function, not a const evaluated at parse time).
// FIX (BLOQUE N baseline §6): evaluating ServerConfig.isConfigured() at module
// parse time crashed with "Cannot read properties of null (reading 'configured')"
// because ServerConfig._config is null until ServerConfig.init() runs (later,
// inside App.init). This made api.js throw on EVERY page load → window.Api was
// undefined → the whole frontend was dead (including the GitHub Pages demo).
function resolveApiBase() {
  try {
    if (window.ServerConfig && ServerConfig.isConfigured()) {
      return ServerConfig.getServerUrl() + '/api';
    }
  } catch (e) { /* ServerConfig not initialized yet — fall back to same-origin */ }
  return '/api';
}

/**
 * Get the JWT token from localStorage (set by login view).
 */
function getToken() {
  return localStorage.getItem('samba_jwt') || '';
}

/**
 * Set/clear the JWT token.
 */
function setToken(token) {
  if (token) localStorage.setItem('samba_jwt', token);
  else localStorage.removeItem('samba_jwt');
}

/**
 * HTTP status codes that are NOT retryable.
 * These indicate a permanent error with the request itself
 * (bad data, auth failure, not found, conflict) — retrying
 * would produce the same result.
 */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 409, 422]);

/**
 * Check if an error is retryable (transient).
 * @param {number} status — HTTP status code (0 = network error)
 * @returns {boolean}
 */
function isRetryable(status) {
  if (status === 0) return true;  // network error
  if (status >= 500) return true;  // 5xx server errors
  return !NON_RETRYABLE_STATUS.has(status);
}

/**
 * Operations that should be enqueued when offline.
 * Only write operations that modify business data.
 * GET requests are never enqueued.
 */
const OFFLINEABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Paths that should NOT be enqueued (auth, push, read-only).
 */
const NON_OFFLINEABLE_PATHS = [
  '/auth/login',
  '/auth/me',
  '/push/',
  '/reports/',
];

function isOfflineable(method, path) {
  if (!OFFLINEABLE_METHODS.has(method)) return false;
  for (const p of NON_OFFLINEABLE_PATHS) {
    if (path.startsWith(p)) return false;
  }
  return true;
}

class ApiError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body = null, skipAuth = false) {
  const API_BASE = resolveApiBase();

  // DEMO_MODE — use mock API instead of real backend (for GitHub Pages)
  if (window.DEMO_MODE && window.DEMO_API) {
    const mockResponse = window.DEMO_API.handle(method, path, body);
    return mockResponse;
  }

  // Check if we should use the offline queue
  const useOfflineQueue = !skipAuth
    && isOfflineable(method, path)
    && window.OfflineQueue
    && OfflineQueue._db
    && !navigator.onLine;  // Only when actually offline

  if (useOfflineQueue) {
    // Try to enqueue in the offline outbox
    const idempotencyKey = (body && body.idempotencyKey) || undefined;
    const result = await OfflineQueue.enqueue(method, API_BASE + path, body, {
      idempotencyKey,
    });
    if (!result.synced) {
      // Operation was queued — return a synthetic response
      // so the caller knows it was accepted (will sync later)
      throw new ApiError(202, 'Operación encolada — se sincronizará cuando vuelva la conexión', {
        offline: true,
        uuid: result.uuid,
      });
    }
    // If synced (online was available), return the data
    if (result.data) return result.data;
  }

  // Normal online request
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(skipAuth ? {} : { 'Authorization': 'Bearer ' + getToken() }),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(API_BASE + path, opts);
  } catch (err) {
    // Network error — check if we should enqueue
    if (isOfflineable(method, path) && window.OfflineQueue && OfflineQueue._db) {
      const idempotencyKey = (body && body.idempotencyKey) || undefined;
      await OfflineQueue.enqueue(method, API_BASE + path, body, { idempotencyKey });
      throw new ApiError(202, 'Operación encolada — se sincronizará cuando vuelva la conexión', {
        offline: true,
      });
    }
    throw new ApiError(0, 'Error de red', err.message);
  }

  // Auto-logout on 401
  if (res.status === 401 && !skipAuth) {
    setToken(null);
    if (window.App) window.App.navigate('login');
    throw new ApiError(401, 'Sesión expirada. Iniciá sesión nuevamente.', null);
  }

  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = json?.message || res.statusText || 'Error desconocido';
    const error = new ApiError(res.status, message, json);
    error.body = json;
    throw error;
  }
  return json;
}

// === Convenience methods ===
const Api = {
  setToken,
  getToken,
  request,
  ApiError,
  isRetryable,
  // Auth
  async login(username, pin) {
    const res = await request('POST', '/auth/login', { username, pin }, true);
    if (res.token) setToken(res.token);
    return res;
  },
  // Products
  async getProducts() { return request('GET', '/products'); },
  async createProduct(data) { return request('POST', '/products', data); },
  // Tables
  async getTables() { return request('GET', '/tables'); },
  // Tickets
  async getOpenTickets() { return request('GET', '/tickets'); },
  async getTicket(id) { return request('GET', `/tickets/${id}`); },
  async createTicket(data) { return request('POST', '/tickets', data); },
  async addOrder(ticketId, data) { return request('POST', `/tickets/${ticketId}/orders`, data); },
  async addPayment(ticketId, data) { return request('POST', `/tickets/${ticketId}/payments`, data); },
  async closeTicket(ticketId, data) { return request('POST', `/tickets/${ticketId}/close`, data); },
  async voidTicket(ticketId, data) { return request('POST', `/tickets/${ticketId}/void`, data); },
  async refundTicket(ticketId, data) { return request('POST', `/tickets/${ticketId}/refund`, data); },
  // Kitchen
  async getKitchenStations() { return request('GET', '/kitchen/stations'); },
  async getKitchenOrders(stationId) {
    const q = stationId ? `?stationId=${stationId}` : '';
    return request('GET', `/kitchen/orders${q}`);
  },
  // Open tickets alias (PosView uses getTickets)
  async getTickets() { return request('GET', '/tickets'); },
  // Ticket operations used by the POS command bar (BLOQUE N baseline §7 —
  // these REST routes already existed in the backend; only the client
  // convenience wrappers were missing)
  async giftOrders(ticketId, orderIds) {
    return request('POST', `/tickets/${ticketId}/gift`, { orderIds });
  },
  async setNote(ticketId, note) {
    return request('POST', `/tickets/${ticketId}/note`, { note });
  },
  async setTags(ticketId, tags) {
    return request('POST', `/tickets/${ticketId}/tags`, { tags });
  },
  async getCalculationTypes() { return request('GET', '/config/calculation-types'); },
  async addCalculation(ticketId, data) {
    return request('POST', `/tickets/${ticketId}/calculations`, data);
  },
  async printTicket(ticketId) { return request('GET', `/tickets/${ticketId}/print`); },
  async printTicketSend(ticketId, data) {
    return request('POST', `/print/tickets/${ticketId}/send`, data);
  },
  async getPaymentTypes() { return request('GET', '/admin/payment-types'); },
  // Cash sessions (Caja)
  async getCurrentCashSession() { return request('GET', '/cash-sessions/current'); },
  async getCashSessions() { return request('GET', '/cash-sessions'); },
  async openCashSession(data) { return request('POST', '/cash-sessions/open', data); },
  async closeCashSession(id, data) { return request('POST', `/cash-sessions/${id}/close`, data); },
  async getCurrentWorkPeriod() { return request('GET', '/cash-sessions/work-periods/current'); },
  async openWorkPeriod(data) { return request('POST', '/cash-sessions/work-periods/open', data); },
  // Inventory
  async getIngredients() { return request('GET', '/inventory/ingredients'); },
  async getStockBalances(warehouseId) { return request('GET', `/inventory/stock/${warehouseId}`); },
  // Reports
  async getReport(type, params = {}) {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/reports/${type}?${query}`);
  },
};

window.Api = Api;
