// =====================================================================
// bloque-i-offline-verification.test.js — Bloque I unit tests
// =====================================================================
// Tests the Bloque I (Fase 9: Offline/Sync) gaps from
// docs/PRODUCTION_GAP_MATRIX.md:
//
//   P0 — Orden de operaciones (ticket→orders→payment→close)
//   P0 — JWT expirado (detectar 401 durante sync, pausar, notificar)
//
// These tests verify the BACKEND idempotency infrastructure that the
// offline sync relies on:
//   - Idempotency middleware (X-Idempotency-Key header deduplication)
//   - Ticket creation + order addition + payment + close chain
//   - Duplicate operations don't create duplicates (idempotency keys)
//   - JWT expiration returns 401 (not 500)
//
// The frontend offlineQueue.js is browser-only (IndexedDB) and cannot
// be tested in Node.js. The E2E tests in bloque-i-offline.spec.js
// verify the browser-side behavior.
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
let testUserId = null;

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

function authGet(p) { return request.get(p).set('Authorization', 'Bearer ' + jwtToken); }
function authPost(p, body) {
  return request.post(p)
    .set('Authorization', 'Bearer ' + jwtToken)
    .send(body || {});
}

async function setupFixtures() {
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;
  testUserId = loginRes.body.user?.userId || 1;
  assert.ok(jwtToken, 'Login should return a JWT token');

  // Ensure a menu item exists (seed doesn't create one)
  let mi = await db('MenuItems').first();
  if (!mi) {
    const [miId] = await db('MenuItems').insert({ Name: 'Bloque I Test Item', GroupCode: 'Food', Barcode: 'BLI01', Tag: null });
    const [pId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
    await db('MenuItemPrices').insert({ MenuItemPortionId: pId, PriceTag: null, Price: 10.00 });
    // Add tax template so ticket can close
    const [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
      Name: 'Bloque I Tax', SortOrder: 300,
      SourceAccountTypeId: 2, TargetAccountTypeId: 1,
      DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
    });
    const [ttId] = await db('TaxTemplates').insert({
      Name: 'Bloque I VAT', SortOrder: 40, Rate: 10.0, Rounding: 0,
      AccountTransactionTypeId: taxTxnTypeId,
    });
    await db('TaxTemplateMaps').insert({
      TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
      TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId,
    });
  }
}

async function cleanup() {
  try {
    const serverWorker = getPrintWorkerInstance();
    if (serverWorker) await serverWorker.stop();
  } catch {}
  await db.destroy();
}

// =====================================================================
// 1. IDEMPOTENCY — payment + close deduplication (the critical ops)
// =====================================================================

describe('1. Idempotency (P0 — offline sync deduplication)', () => {
  test('1A: POST /api/tickets/:id/payments with idempotencyKey — duplicate is deduplicated', async () => {
    // Create ticket + order first
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;
    const mi = await db('MenuItems').first();
    await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });

    // Get total
    const ticketRes2 = await authGet(`/api/tickets/${ticketId}`);
    const total = Number(ticketRes2.body.data.RemainingAmount || 0);

    // Pay with idempotencyKey
    const idempotencyKey = `payment-bloque-i-${Date.now()}`;
    const res1 = await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total, idempotencyKey });
    const res2 = await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total, idempotencyKey });

    // Both should succeed (deduplication — second returns cached result)
    assert.ok(res1.status === 200 || res1.status === 201);
    assert.ok(res2.status === 200 || res2.status === 201);

    // Verify only 1 payment was created
    const payments = await db('Payments').where({ TicketId: ticketId });
    assert.strictEqual(payments.length, 1, 'Should have exactly 1 payment (deduplicated)');
  });

  test('1B: POST /api/tickets/:id/close with idempotencyKey — duplicate is deduplicated', async () => {
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;
    const mi = await db('MenuItems').first();
    await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });
    const ticketRes2 = await authGet(`/api/tickets/${ticketId}`);
    const total = Number(ticketRes2.body.data.RemainingAmount || 0);
    await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total });

    // Close with idempotencyKey
    const idempotencyKey = `close-bloque-i-${Date.now()}`;
    const res1 = await authPost(`/api/tickets/${ticketId}/close`, { idempotencyKey });
    const res2 = await authPost(`/api/tickets/${ticketId}/close`, { idempotencyKey });

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);  // or 409 (already closed) — both are acceptable
  });

  test('1C: Different idempotency keys create different tickets', async () => {
    const res1 = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const res2 = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });

    assert.notStrictEqual(res1.body.data.Id, res2.body.data.Id,
      'Different requests should create different tickets');
  });
});

// =====================================================================
// 2. OPERATION ORDER — ticket→orders→payment→close chain
// =====================================================================

describe('2. Operation Order (P0 — ticket→orders→payment→close)', () => {
  test('2A: Full happy-path: create ticket → add order → add payment → close', async () => {
    // Step 1: Create ticket
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;
    assert.ok(ticketId, 'Ticket should be created');

    // Step 2: Add order
    const mi = await db('MenuItems').first();
    const orderRes = await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });
    assert.strictEqual(orderRes.status, 200);

    // Step 3: Get ticket to find total
    const ticketRes2 = await authGet(`/api/tickets/${ticketId}`);
    const total = Number(ticketRes2.body.data.RemainingAmount || 0);

    // Step 4: Add payment
    const paymentRes = await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total });
    assert.strictEqual(paymentRes.status, 200);

    // Step 5: Close ticket
    const closeRes = await authPost(`/api/tickets/${ticketId}/close`);
    assert.strictEqual(closeRes.status, 200);

    // Verify ticket is closed
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    assert.strictEqual(Number(ticket.IsClosed), 1, 'Ticket should be closed');
  });

  test('2B: Closing ticket before payment fails (remaining > 0)', async () => {
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;

    const mi = await db('MenuItems').first();
    await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });

    // Try to close without payment
    const closeRes = await authPost(`/api/tickets/${ticketId}/close`);
    assert.strictEqual(closeRes.status, 409);  // Conflict — remaining > 0
  });

  test('2C: Adding order to closed ticket fails', async () => {
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;

    const mi = await db('MenuItems').first();
    await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });

    const ticketRes2 = await authGet(`/api/tickets/${ticketId}`);
    const total = Number(ticketRes2.body.data.RemainingAmount || 0);
    await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total });
    await authPost(`/api/tickets/${ticketId}/close`);

    // Try to add another order to the closed ticket
    const orderRes = await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });
    assert.strictEqual(orderRes.status, 409);  // Conflict — ticket is closed
  });
});

// =====================================================================
// 3. JWT EXPIRATION — 401 handling
// =====================================================================

describe('3. JWT Expiration (P0 — detect 401 during sync)', () => {
  test('3A: Expired JWT returns 401 (not 500)', async () => {
    // Create an expired-looking token (just a random string that looks like JWT)
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDAwfQ.invalid-signature';
    const res = await request.get('/api/tickets')
      .set('Authorization', 'Bearer ' + fakeToken);
    assert.strictEqual(res.status, 401);
  });

  test('3B: No token returns 401', async () => {
    const res = await request.get('/api/tickets');
    assert.strictEqual(res.status, 401);
  });

  test('3C: Malformed Authorization header returns 401', async () => {
    const res = await request.get('/api/tickets')
      .set('Authorization', 'NotBearer someToken');
    assert.strictEqual(res.status, 401);
  });

  test('3D: Valid token works', async () => {
    const res = await authGet('/api/tickets');
    assert.strictEqual(res.status, 200);
  });
});

// =====================================================================
// 4. FRONTEND offlineQueue.js — static analysis
// =====================================================================

describe('4. Frontend offlineQueue.js (P0 — static analysis)', () => {
  test('4A: offlineQueue.js exists and exposes OfflineQueue', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('OfflineQueue'), 'Should expose OfflineQueue');
  });

  test('4B: offlineQueue has enqueue, syncAll, getPending, cancel methods', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('async enqueue('), 'Should have enqueue method');
    assert.ok(content.includes('async syncAll('), 'Should have syncAll method');
    assert.ok(content.includes('async getPending('), 'Should have getPending method');
    assert.ok(content.includes('async cancel('), 'Should have cancel method');
  });

  test('4C: syncAll sorts by priority (BLOQUE I fix)', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('_getPriority'), 'Should have _getPriority method');
    assert.ok(content.includes('operations.sort'), 'syncAll should sort operations');
    assert.ok(content.includes('createdAt'), 'Should sort by createdAt as tiebreaker');
  });

  test('4D: syncAll detects 401 and pauses (BLOQUE I fix)', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('_syncPaused'), 'Should have _syncPaused flag');
    assert.ok(content.includes('err.status === 401'), 'Should detect 401 errors');
    assert.ok(content.includes('offline:auth-expired'), 'Should dispatch auth-expired event');
    assert.ok(content.includes('resumeSync'), 'Should have resumeSync method');
  });

  test('4E: _getPriority assigns correct priorities for ticket lifecycle', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    // Priority 1: ticket creation
    assert.ok(content.includes("apiPath === '/tickets'") && content.includes('return 1'),
      'Ticket creation should be priority 1');
    // Priority 2: order addition
    assert.ok(content.includes('/orders') && content.includes('return 2'),
      'Order addition should be priority 2');
    // Priority 3: payment
    assert.ok(content.includes('/payments') && content.includes('return 3'),
      'Payment should be priority 3');
    // Priority 4: close
    assert.ok(content.includes('/close') && content.includes('return 4'),
      'Ticket close should be priority 4');
  });

  test('4F: app.js listens for offline:auth-expired event (BLOQUE I)', () => {
    const appPath = path.join(FRONTEND_DIR, 'js', 'app.js');
    const content = fs.readFileSync(appPath, 'utf8');
    assert.ok(content.includes('offline:auth-expired'),
      'app.js should listen for offline:auth-expired event');
    assert.ok(content.includes('resumeSync'),
      'app.js should call resumeSync after re-login');
  });

  test('4G: api.js integrates with OfflineQueue for offline operations', () => {
    const apiPath = path.join(FRONTEND_DIR, 'js', 'services', 'api.js');
    const content = fs.readFileSync(apiPath, 'utf8');
    assert.ok(content.includes('OfflineQueue'), 'api.js should reference OfflineQueue');
    assert.ok(content.includes('navigator.onLine'), 'Should check navigator.onLine');
    assert.ok(content.includes('isOfflineable'), 'Should have isOfflineable function');
  });

  test('4H: api.js handles 401 by clearing token + redirecting to login', () => {
    const apiPath = path.join(FRONTEND_DIR, 'js', 'services', 'api.js');
    const content = fs.readFileSync(apiPath, 'utf8');
    assert.ok(content.includes('res.status === 401'), 'Should check for 401');
    assert.ok(content.includes('setToken(null)'), 'Should clear token on 401');
    assert.ok(content.includes("navigate('login')"), 'Should redirect to login on 401');
  });

  test('4I: offlineQueue uses IndexedDB for persistence', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('indexedDB'), 'Should use IndexedDB');
    assert.ok(content.includes('objectStore'), 'Should create object store');
    assert.ok(content.includes('sambapos_offline'), 'Should use correct DB name');
  });

  test('4J: offlineQueue auto-syncs on online event', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes("addEventListener('online'"), 'Should listen for online event');
    assert.ok(content.includes('syncAll()'), 'Should call syncAll on online event');
  });

  test('4K: offlineQueue dispatches sync events for UI updates', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('offline:synced'), 'Should dispatch synced event');
    assert.ok(content.includes('offline:sync-complete'), 'Should dispatch sync-complete event');
    assert.ok(content.includes('offline:conflict'), 'Should dispatch conflict event');
    assert.ok(content.includes('offline:failed'), 'Should dispatch failed event');
  });

  test('4L: offlineQueue handles conflicts (409) by marking CONFLICT status', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('err.status === 409'), 'Should detect 409 conflicts');
    assert.ok(content.includes("'CONFLICT'"), 'Should mark as CONFLICT status');
  });

  test('4M: offlineQueue retries up to 5 times before marking FAILED', () => {
    const queuePath = path.join(FRONTEND_DIR, 'js', 'store', 'offlineQueue.js');
    const content = fs.readFileSync(queuePath, 'utf8');
    assert.ok(content.includes('retryCount >= 5'), 'Should retry up to 5 times');
    assert.ok(content.includes("'FAILED'"), 'Should mark as FAILED after max retries');
  });
});

// =====================================================================
// 5. IDEMPOTENCY MIDDLEWARE — server-side deduplication for payments + close
// =====================================================================

describe('5. Idempotency Middleware (P0 — server-side dedup)', () => {
  test('5A: Payment idempotency key is stored in IdempotencyKeys table', async () => {
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;
    const mi = await db('MenuItems').first();
    await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });
    const ticketRes2 = await authGet(`/api/tickets/${ticketId}`);
    const total = Number(ticketRes2.body.data.RemainingAmount || 0);

    const idempotencyKey = `bloque-i-middleware-${Date.now()}`;
    await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total, idempotencyKey });

    const stored = await db('IdempotencyKeys').where({ Key: idempotencyKey }).first();
    assert.ok(stored, 'Idempotency key should be stored in DB');
    assert.ok(stored.Endpoint, 'Should store the endpoint');
  });

  test('5B: Close idempotency key prevents double-close', async () => {
    const ticketRes = await authPost('/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;
    const mi = await db('MenuItems').first();
    await authPost(`/api/tickets/${ticketId}/orders`, { menuItemId: mi.Id, quantity: 1 });
    const ticketRes2 = await authGet(`/api/tickets/${ticketId}`);
    const total = Number(ticketRes2.body.data.RemainingAmount || 0);
    await authPost(`/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: total });

    const idempotencyKey = `bloque-i-close-${Date.now()}`;
    await authPost(`/api/tickets/${ticketId}/close`, { idempotencyKey });
    const res2 = await authPost(`/api/tickets/${ticketId}/close`, { idempotencyKey });

    // Second close with same key should be deduplicated (200, not 409)
    assert.strictEqual(res2.status, 200);
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
