// =====================================================================
// idempotency-verification.test.js — FASE 3.3 idempotency tests
// =====================================================================
// Verifies that critical ticket operations (payment, close, void, refund)
// are idempotent: a second request with the same IdempotencyKey returns
// the original response verbatim without executing the side effect again.
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const BACKEND_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..');
const PORT = 3093;

function startServer(env) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(BACKEND_DIR, 'src', 'api', 'server.js');
    const proc = spawn('node', [serverPath], {
      cwd: BACKEND_DIR,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => {
      reject(new Error('Server did not start in 15s'));
      proc.kill('SIGKILL');
    }, 15000);
    proc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening on port')) {
        clearTimeout(timeout);
        resolve({ proc, baseUrl: `http://localhost:${env.PORT}` });
      }
    });
    proc.on('error', reject);
  });
}

function killServer(proc) {
  if (!proc) return Promise.resolve();
  return new Promise((resolve) => {
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 3000);
  });
}

function resetDb() {
  const dbPath = path.join(REPO_ROOT, 'data', 'samba.db');
  try { execSync(`rm -f ${dbPath} ${dbPath}-wal ${dbPath}-shm`, { stdio: 'pipe' }); } catch {}
  const migrateScript = path.join(BACKEND_DIR, 'scripts', 'run-migrations.js');
  execSync(`node ${migrateScript}`, {
    cwd: BACKEND_DIR,
    env: { ...process.env, JWT_SECRET: 'test-secret-32-chars-min!!', ADMIN_PIN: '1234', NODE_ENV: 'test' },
    stdio: 'pipe',
  });
}

/**
 * Insert a menu item so that addOrder has something to reference.
 * The seed doesn't create MenuItems; tests must insert their own.
 */
function insertTestMenuItem() {
  const knex = require('knex');
  const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
  const db = knex(config.development);
  return (async () => {
    const [miId] = await db('MenuItems').insert({
      Name: 'Test Burger', GroupCode: 'Food', Barcode: 'TB01', Tag: null,
    });
    const [portionId] = await db('MenuItemPortions').insert({
      Name: 'Normal', MenuItemId: miId, Multiplier: 1,
    });
    await db('MenuItemPrices').insert({
      MenuItemPortionId: portionId, PriceTag: null, Price: 5.00,
    });
    await db.destroy();
    return miId;
  })();
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Administrator', pin: '1234' }),
  });
  const body = await res.json();
  return body.token;
}

async function authJson(baseUrl, token, method, pathStr, body) {
  const res = await fetch(`${baseUrl}${pathStr}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Helper: create ticket + add a single order
async function createTicketWithOrder(baseUrl, token, menuItemId, qty = 2) {
  const t = await authJson(baseUrl, token, 'POST', '/api/tickets',
    { departmentId: 1, ticketTypeId: 1 });
  assert.strictEqual(t.status, 201);
  const ticketId = t.body.data.Id;
  // addOrder expects { menuItemId, quantity } (singular, not an array)
  const o = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/orders`,
    { menuItemId, quantity: qty, price: 5 });
  assert.strictEqual(o.status, 200, `addOrder failed: ${JSON.stringify(o.body)}`);
  return ticketId;
}

describe('FASE 3.3 — Idempotency on critical ticket operations', () => {
  let serverHandle, baseUrl, token;
  let menuItemId;

  before(async () => {
    await resetDb();
    menuItemId = await insertTestMenuItem();
    serverHandle = await startServer({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-32-chars-min!!',
      CORS_ORIGIN: '*',
      PORT,
    });
    baseUrl = `http://localhost:${PORT}`;
    token = await login(baseUrl);
  });

  after(async () => {
    if (serverHandle?.proc) await killServer(serverHandle.proc);
  });

  test('1A: Create ticket + add order + initial payment', async () => {
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    // First payment with idempotency key
    const p1 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 5, idempotencyKey: 'pay-key-001' });
    assert.strictEqual(p1.status, 200);
    assert.ok(p1.body.data, 'response should have data');
  });

  test('1B: Duplicate payment with SAME idempotency key returns SAME response (no double-charge)', async () => {
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    // First payment
    const p1 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 5, idempotencyKey: 'pay-key-002' });
    assert.strictEqual(p1.status, 200);
    const remainingAfter1 = Number(p1.body.data.RemainingAmount);

    // Second request with SAME key — should return SAME response
    const p2 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 5, idempotencyKey: 'pay-key-002' });
    assert.strictEqual(p2.status, 200);
    const remainingAfter2 = Number(p2.body.data.RemainingAmount);

    // Critical assertion: the second call did NOT deduct another $5
    assert.strictEqual(remainingAfter1, remainingAfter2,
      `Idempotency broken: remaining after first=${remainingAfter1}, after duplicate=${remainingAfter2}`);
  });

  test('1C: Different idempotency keys + different amounts = different operations', async () => {
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    // First payment with key A, amount=$5
    const p1 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 5, idempotencyKey: 'pay-key-A' });
    assert.strictEqual(p1.status, 200);
    const r1 = Number(p1.body.data.RemainingAmount);

    // Second payment with DIFFERENT key B AND different amount=$3 — should succeed.
    // (Using same amount within 30s would trigger the recentDuplicate guard,
    // which is intentional anti-double-click protection.)
    const p2 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 3, idempotencyKey: 'pay-key-B' });
    assert.strictEqual(p2.status, 200);
    const r2 = Number(p2.body.data.RemainingAmount);

    // Should have deducted $3 more
    assert.strictEqual(r1 - r2, 3,
      `Different keys + different amounts should both succeed: r1=${r1}, r2=${r2}`);
  });

  test('1D: Close ticket is idempotent', async () => {
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    // Full payment with a unique key
    await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 10, idempotencyKey: `pay-close-${ticketId}` });

    // First close
    const c1 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/close`,
      { idempotencyKey: 'close-key-001' });
    assert.strictEqual(c1.status, 200);

    // Second close with SAME key — should return cached response
    const c2 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/close`,
      { idempotencyKey: 'close-key-001' });
    assert.strictEqual(c2.status, 200);
    // Both responses should report IsClosed=1
    assert.strictEqual(c1.body.data.IsClosed, c2.body.data.IsClosed);
  });

  test('1E: Void ticket is idempotent', async () => {
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    const v1 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/void`,
      { reason: 'customer cancelled', idempotencyKey: 'void-key-001' });
    assert.strictEqual(v1.status, 200);

    const v2 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/void`,
      { reason: 'customer cancelled', idempotencyKey: 'void-key-001' });
    assert.strictEqual(v2.status, 200);
    // Both responses should be identical
    assert.deepStrictEqual(v1.body, v2.body);
  });

  test('1F: No idempotency key + different amounts = both payments processed', async () => {
    // Without a key, two payments with DIFFERENT amounts should both succeed.
    // (Same amount within 30s would trigger recentDuplicate guard — that's by design.)
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    const p1 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 5 });
    assert.strictEqual(p1.status, 200);
    const r1 = Number(p1.body.data.RemainingAmount);

    const p2 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 3 });
    assert.strictEqual(p2.status, 200);
    const r2 = Number(p2.body.data.RemainingAmount);

    assert.strictEqual(r1 - r2, 3, 'Different amounts should both be processed');
  });

  test('1G: IdempotencyKey via X-Idempotency-Key header also works', async () => {
    const ticketId = await createTicketWithOrder(baseUrl, token, menuItemId);

    // First payment with header key
    const res1 = await fetch(`${baseUrl}/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': 'header-key-001',
      },
      body: JSON.stringify({ paymentTypeId: 1, amount: 5 }),
    });
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();
    const r1 = Number(body1.data.RemainingAmount);

    // Second payment with SAME header key
    const res2 = await fetch(`${baseUrl}/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': 'header-key-001',
      },
      body: JSON.stringify({ paymentTypeId: 1, amount: 5 }),
    });
    assert.strictEqual(res2.status, 200);
    const body2 = await res2.json();
    const r2 = Number(body2.data.RemainingAmount);

    assert.strictEqual(r1, r2, 'Header-based idempotency should also prevent duplicates');
  });
});
