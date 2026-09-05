// =====================================================================
// api.js — REST API client (fetch wrapper)
// =====================================================================
// All HTTP calls go through this module. Returns parsed JSON or throws
// an Error with the HTTP status code and body.
// =====================================================================

const API_BASE = '/api';   // same-origin (Express serves /frontend as static)

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(API_BASE + path, opts);
  } catch (err) {
    throw new ApiError(0, 'Network error', err.message);
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
};

window.Api = Api;
window.ApiError = ApiError;
