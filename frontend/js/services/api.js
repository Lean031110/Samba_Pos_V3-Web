// =====================================================================
// api.js — REST API client (fetch wrapper)
// =====================================================================
// All HTTP calls go through this module. Returns parsed JSON or throws
// an Error with the HTTP status code and body.
// =====================================================================

const API_BASE = '/api';   // same-origin (Express serves /frontend as static)

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

async function request(method, path, body = null, skipAuth = false) {
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
    throw new ApiError(0, 'Network error', err.message);
  }

  // Auto-logout on 401
  if (res.status === 401 && !skipAuth) {
    setToken(null);
    if (window.App) window.App.navigate('login');
    throw new ApiError(401, 'Session expired. Please login again.', null);
  }

  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = json?.message || res.statusText || 'Unknown error';
    const error = new ApiError(res.status, message, json);
    error.body = json;
    throw error;
  }
  return json;
}

class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'ApiError';
  }
}

const Api = {
  // === Auth ===
  login: (username, pin) => request('POST', '/auth/login', { username, pin }, true),
  me:    ()            => request('GET',  '/auth/me', null, false),
  setToken,
  getToken,

  // === Tickets ===
  getTickets:        ()  => request('GET',    '/tickets'),
  getTicket:         (id)=> request('GET',    `/tickets/${id}`),
  createTicket:      (b) => request('POST',   '/tickets', b),
  addOrder:          (id, b) => request('POST', `/tickets/${id}/orders`, b),
  addCalculation:    (id, b) => request('POST', `/tickets/${id}/calculations`, b),
  addPayment:        (id, b) => request('POST', `/tickets/${id}/payments`, b),
  closeTicket:       (id) => request('POST',   `/tickets/${id}/close`),
  printTicket:       (id) => request('GET',    `/tickets/${id}/print`),

  // === Products ===
  getProducts:       ()  => request('GET',    '/products'),
  getProduct:        (id)=> request('GET',    `/products/${id}`),
  getProductsByGroup:(code)=>request('GET',   `/products/group/${code}`),

  // === Tables ===
  getTables:         ()  => request('GET',    '/tables'),
  getTable:          (id)=> request('GET',    `/tables/${id}`),
  updateTableState:  (id, b) => request('PATCH', `/tables/${id}/state`, b),

  // === Sprint 5 — Extended ===
  setNote:     (id, note)        => request('POST', `/tickets/${id}/note`,  { note }),
  giftOrders:  (id, orderIds)    => request('POST', `/tickets/${id}/gift`,  { orderIds }),
  voidTicket:  (id)              => request('POST', `/tickets/${id}/void`),
  setTags:     (id, tags)        => request('POST', `/tickets/${id}/tags`,  { tags }),
  splitTicket: (id, orderIds)    => request('POST', `/tickets/${id}/split`, { orderIds }),
  refundTicket:(id, amount, reason) => request('POST', `/tickets/${id}/refund`, { amount, reason }),
  mergeTickets:(sourceTicketIds) => request('POST', `/tickets/merge`, { sourceTicketIds }),
  printTicketSend: (id, body)    => request('POST', `/tickets/${id}/print/send`, body),

  // === Configuration (DB-driven, no hardcoded IDs) ===
  getCalculationTypes: ()        => request('GET',  '/calculation-types'),
  getPaymentTypes:     ()        => request('GET',  '/payment-types'),
  getDepartments:      ()        => request('GET',  '/departments'),
  getTicketTypes:      ()        => request('GET',  '/ticket-types'),
  getTaxTemplates:     ()        => request('GET',  '/tax-templates'),

  // === Kitchen (KDS) ===
  getKitchenStations:  ()        => request('GET',  '/kitchen/stations'),
  getKitchenOrders:    (stationId) => request('GET', `/kitchen/orders${stationId ? '?stationId=' + stationId : ''}`),
  kitchenBump:         (id)      => request('POST', `/kitchen/orders/${id}/bump`),
  kitchenServe:        (id)      => request('POST', `/kitchen/orders/${id}/serve`),
  kitchenVoid:         (id)      => request('POST', `/kitchen/orders/${id}/void`),
  kitchenRecall:       (id)      => request('POST', `/kitchen/orders/${id}/recall`),
  kitchenUpdateState:  (id, state) => request('POST', `/kitchen/orders/${id}/state`, { state }),

  // === Internal ===
  request,  // exposed for one-off calls
};

window.Api = Api;
window.ApiError = ApiError;
