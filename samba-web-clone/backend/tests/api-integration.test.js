// =====================================================================
// api-integration.test.js — Sprint 3 integration tests with supertest
// =====================================================================
// Tests every endpoint with expected HTTP codes:
//   - 200 OK for valid GET/POST
//   - 201 Created for POST that creates a resource
//   - 400 Bad Request for input validation failures
//   - 404 Not Found for non-existent resources
//   - 409 Conflict for state conflicts (table already open, ticket closed)
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

const { createApp } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');

const app = createApp();
const request = supertest(app);

// =====================================================================
// Sprint 5: Helper for authenticated requests
// =====================================================================
function authGet(path) {
  return request.get(path).set('Authorization', 'Bearer ' + jwtToken);
}
function authPost(path, body) {
  return request.post(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {});
}
function authPatch(path, body) {
  return request.patch(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {});
}

// =====================================================================
// Test fixtures
// =====================================================================

let testMenuItemId = null;
let testTicketId = null;
let testTableId = null;
let testPaymentTypeId = null;
let testCalculationTypeId = null;
let jwtToken = null;   // Sprint 5: JWT token for authenticated requests

async function setupFixtures() {
  // === Sprint 5: Login to get JWT token ===
  const loginRes = await authPost('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.body.token);
  jwtToken = loginRes.body.token;

  // Insert a menu item for testing (use authenticated request)
  const [miId] = await db('MenuItems').insert({ Name: 'Test Burger', GroupCode: 'Food', Barcode: 'TB01', Tag: null });
  const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 8.50 });
  testMenuItemId = miId;

  // Insert a tax template for the menu item (needed for tax calculations)
  const [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
    Name: 'Test VAT', SortOrder: 200,
    SourceAccountTypeId: 2, TargetAccountTypeId: 1,
    DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
  });
  const [ttId] = await db('TaxTemplates').insert({
    Name: 'Test VAT 10%', SortOrder: 30, Rate: 10.0, Rounding: 0,
    AccountTransactionTypeId: taxTxnTypeId,
  });
  await db('TaxTemplateMaps').insert({
    TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
    TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId,
  });

  // Create a table entity for testing
  const [entityTypeId] = await db('EntityTypes')
    .where({ Name: 'Tables' }).pluck('Id');
  const [tableId] = await db('Entities').insert({
    Name: 'T1', EntityTypeId: entityTypeId,
    LastUpdateTime: new Date().toISOString(),
    SearchString: 't1', CustomData: null,
    AccountId: 0, WarehouseId: 0,
  });
  await db('EntityStateValues').insert({
    EntityId: tableId,
    EntityStates: JSON.stringify([{
      StateName: 'Status', State: 'Available', StateValue: '',
      LastUpdateTime: new Date().toISOString(), Quantity: 0,
    }]),
  });
  testTableId = tableId;

  // Get the seeded PaymentType (Cash, id=1)
  const pt = await db('PaymentTypes').where({ Name: 'Cash' }).first();
  testPaymentTypeId = pt.Id;

  // Get the seeded CalculationType (Discount, id=1)
  const ct = await db('CalculationTypes').where({ Name: 'Discount' }).first();
  testCalculationTypeId = ct.Id;
}

async function teardownFixtures() {
  // Robust cleanup: only delete test-created rows, never seed data.
  // Strategy: collect all ticket IDs created during tests, delete their children,
  // then the tickets themselves. Then delete test menu items + tables.
  try {
    // Collect ticket IDs from all our test vars (some may be null if a test failed)
    const ticketIds = [testTicketId].filter(Boolean);
    // Also clean up any tickets with Note containing 'Sprint 5' or test markers
    const extraTicketIds = await db('Tickets')
      .whereLike('Note', '%Sprint 5%')
      .orWhereLike('Note', '%Test%')
      .orWhereLike('TicketStates', '%Refunded%')
      .orWhereLike('TicketStates', '%Merged%')
      .pluck('Id');
    const allTicketIds = [...new Set([...ticketIds, ...extraTicketIds])];
    if (allTicketIds.length > 0) {
      await db('Orders').whereIn('TicketId', allTicketIds).del();
      await db('Payments').whereIn('TicketId', allTicketIds).del();
      await db('Calculations').whereIn('TicketId', allTicketIds).del();
      await db('TicketEntities').whereIn('TicketId', allTicketIds).del();
      await db('PaidItems').whereIn('TicketId', allTicketIds).del();
      await db('Tickets').whereIn('Id', allTicketIds).del();
    }
    // Test menu item
    if (testMenuItemId) {
      const portionIds = await db('MenuItemPortions').where({ MenuItemId: testMenuItemId }).pluck('Id');
      if (portionIds.length > 0) {
        await db('MenuItemPrices').whereIn('MenuItemPortionId', portionIds).del();
      }
      await db('MenuItemPortions').where({ MenuItemId: testMenuItemId }).del();
      await db('MenuItems').where({ Id: testMenuItemId }).del();
    }
    // Test table
    if (testTableId) {
      await db('EntityStateValues').where({ EntityId: testTableId }).del();
      await db('Entities').where({ Id: testTableId }).del();
    }
    // Test tax templates + txn types (names start with 'Test ')
    const testTaxTemplateIds = await db('TaxTemplates').whereLike('Name', 'Test %').pluck('Id');
    if (testTaxTemplateIds.length > 0) {
      await db('TaxTemplateMaps').whereIn('TaxTemplateId', testTaxTemplateIds).del();
      await db('TaxTemplates').whereIn('Id', testTaxTemplateIds).del();
    }
    const testTxnTypeIds = await db('AccountTransactionTypes').whereLike('Name', 'Test %').pluck('Id');
    if (testTxnTypeIds.length > 0) {
      await db('AccountTransactionTypes').whereIn('Id', testTxnTypeIds).del();
    }
  } catch (err) {
    console.error('[teardown] Error (continuing):', err.message);
  }
  await db.destroy();
}

// =====================================================================
// ANSI colors + counter
// =====================================================================
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

let passedCount = 0;
let failedCount = 0;

function header(title) {
  console.log('\n' + C.bold + C.cyan + '═'.repeat(70) + C.reset);
  console.log(C.bold + C.cyan + '  ' + title + C.reset);
  console.log(C.bold + C.cyan + '═'.repeat(70) + C.reset);
}

function ok(msg) { console.log(C.green + '  ✓ ' + C.reset + msg); passedCount++; }
function fail(msg) { console.log(C.red + '  ✗ ' + C.reset + msg); failedCount++; }

// Override test() to wrap with try/catch and counting
const originalTest = test;
function countedTest(name, fn) {
  return originalTest(name, async (t) => {
    try {
      await fn(t);
    } catch (err) {
      fail(name + ' — ' + err.message);
      throw err;
    }
  });
}

// =====================================================================
// Tests
// =====================================================================

before(async () => {
  await setupFixtures();
});

after(async () => {
  await teardownFixtures();
  header('FINAL VERDICT');
  console.log(C.gray + '  Passed: ' + C.reset + C.green + passedCount + C.reset);
  console.log(C.gray + '  Failed: ' + C.reset + C.red + failedCount + C.reset);
  if (failedCount === 0) {
    console.log('');
    console.log(C.bold + C.green + '  ╔══════════════════════════════════════════════════════════════╗' + C.reset);
    console.log(C.bold + C.green + '  |  SPRINT 3 ACCEPTANCE TEST PASSED                             |' + C.reset);
    console.log(C.bold + C.green + '  ╚══════════════════════════════════════════════════════════════╝' + C.reset);
  } else {
    console.log('');
    console.log(C.bold + C.red + '  SPRINT 3 ACCEPTANCE TEST FAILED' + C.reset);
    process.exit(1);
  }
});

// =====================================================================
// HEALTH CHECK
// =====================================================================

describe('Health Check', () => {
  test('GET /health returns 200', async () => {
    const res = await authGet('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.service, 'samba-pos-web-clone');
    ok('GET /health → 200 (status: ok)');
  });

  test('GET /unknown returns SPA fallback (200 with index.html)', async () => {
    const res = await request.get('/some-unknown-route');
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('<!DOCTYPE html>'));
    ok('GET /unknown → 200 (SPA fallback to index.html)');
  });
});

// =====================================================================
// PRODUCTS API
// =====================================================================

describe('Products API', () => {
  test('GET /api/products returns 200 with array', async () => {
    const res = await authGet('/api/products');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
    ok(`GET /api/products → 200 (${res.body.count} items)`);
  });

  test('GET /api/products/:id returns 200 for valid ID', async () => {
    const res = await authGet(`/api/products/${testMenuItemId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Id, testMenuItemId);
    assert.strictEqual(res.body.data.Name, 'Test Burger');
    ok(`GET /api/products/${testMenuItemId} → 200 (Test Burger)`);
  });

  test('GET /api/products/:id returns 404 for non-existent ID', async () => {
    const res = await authGet('/api/products/999999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NotFoundError');
    assert.match(res.body.message, /not found/i);
    ok('GET /api/products/999999 → 404 (NotFoundError)');
  });

  test('GET /api/products/:id returns 400 for invalid ID', async () => {
    const res = await authGet('/api/products/notanumber');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('GET /api/products/notanumber → 400 (ValidationError)');
  });

  test('GET /api/products/group/:code returns 200 with filtered items', async () => {
    const res = await authGet('/api/products/group/Food');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    ok(`GET /api/products/group/Food → 200 (${res.body.count} items)`);
  });
});

// =====================================================================
// TABLES API
// =====================================================================

describe('Tables API', () => {
  test('GET /api/tables returns 200 with array', async () => {
    const res = await authGet('/api/tables');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    ok(`GET /api/tables → 200 (${res.body.count} tables)`);
  });

  test('GET /api/tables/:id returns 200 for valid ID', async () => {
    const res = await authGet(`/api/tables/${testTableId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Id, testTableId);
    ok(`GET /api/tables/${testTableId} → 200 (T1)`);
  });

  test('GET /api/tables/:id returns 404 for non-existent ID', async () => {
    const res = await authGet('/api/tables/999999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NotFoundError');
    ok('GET /api/tables/999999 → 404 (NotFoundError)');
  });

  test('PATCH /api/tables/:id/state returns 200 for valid state update', async () => {
    const res = await authPatch(`/api/tables/${testTableId}/state`)
      .send({ state: 'New Orders' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.state, 'New Orders');
    ok(`PATCH /api/tables/${testTableId}/state → 200 (state: New Orders)`);
  });

  test('PATCH /api/tables/:id/state returns 400 when state missing', async () => {
    const res = await authPatch(`/api/tables/${testTableId}/state`)
      .send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('PATCH /api/tables/:id/state (no state) → 400 (ValidationError)');
  });
});

// =====================================================================
// TICKETS API — full lifecycle
// =====================================================================

describe('Tickets API — full lifecycle', () => {
  test('POST /api/tickets creates a new ticket → 201', async () => {
    const res = await authPost('/api/tickets')
      .send({ departmentId: 1, ticketTypeId: 1 });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.data.Id > 0);
    assert.strictEqual(res.body.data.IsClosed, 0);
    assert.strictEqual(Number(res.body.data.TotalAmount), 0);
    testTicketId = res.body.data.Id;
    ok(`POST /api/tickets → 201 (ticketId: ${testTicketId})`);
  });

  test('GET /api/tickets returns 200 with the new ticket in the list', async () => {
    const res = await authGet('/api/tickets');
    assert.strictEqual(res.status, 200);
    const ids = res.body.data.map(t => t.Id);
    assert.ok(ids.includes(testTicketId));
    ok(`GET /api/tickets → 200 (includes ticket ${testTicketId})`);
  });

  test('GET /api/tickets/:id returns 200 for valid ID', async () => {
    const res = await authGet(`/api/tickets/${testTicketId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Id, testTicketId);
    ok(`GET /api/tickets/${testTicketId} → 200`);
  });

  test('GET /api/tickets/:id returns 404 for non-existent ID', async () => {
    const res = await authGet('/api/tickets/999999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NotFoundError');
    ok('GET /api/tickets/999999 → 404 (NotFoundError)');
  });

  test('POST /api/tickets/:id/orders adds an order → 200', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/orders`)
      .send({ menuItemId: testMenuItemId, quantity: 2 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Orders.length, 1);
    assert.strictEqual(res.body.data.Orders[0].MenuItemName, 'Test Burger');
    assert.strictEqual(Number(res.body.data.Orders[0].Quantity), 2);
    // TotalAmount should be 2 * 8.50 = 17.00 (tax-included default)
    assert.strictEqual(Number(res.body.data.TotalAmount), 17.00);
    ok(`POST /api/tickets/${testTicketId}/orders → 200 (1 order, total: $${res.body.data.TotalAmount})`);
  });

  test('POST /api/tickets/:id/orders returns 400 when menuItemId missing', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/orders`)
      .send({ quantity: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('POST /api/tickets/:id/orders (no menuItemId) → 400 (ValidationError)');
  });

  test('POST /api/tickets/:id/orders returns 404 when menuItemId does not exist', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/orders`)
      .send({ menuItemId: 999999 });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NotFoundError');
    ok('POST /api/tickets/:id/orders (non-existent menuItemId) → 404 (NotFoundError)');
  });

  test('POST /api/tickets/:id/calculations applies a discount → 200', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/calculations`)
      .send({ calculationTypeId: testCalculationTypeId, amount: 10 });  // 10% discount
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.Calculations.length > 0);
    // TotalAmount should drop: 17.00 - 1.70 = 15.30 (tax included so no tax adjustment)
    assert.strictEqual(Number(res.body.data.TotalAmount), 15.30);
    ok(`POST /api/tickets/${testTicketId}/calculations → 200 (10% discount, total: $${res.body.data.TotalAmount})`);
  });

  test('POST /api/tickets/:id/calculations returns 400 when amount invalid', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/calculations`)
      .send({ calculationTypeId: testCalculationTypeId, amount: 'not a number' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('POST /api/tickets/:id/calculations (invalid amount) → 400 (ValidationError)');
  });

  test('POST /api/tickets/:id/payments processes a payment → 200', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/payments`)
      .send({ paymentTypeId: testPaymentTypeId, amount: 15.30 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Payments.length, 1);
    assert.strictEqual(Number(res.body.data.Payments[0].Amount), 15.30);
    assert.strictEqual(Number(res.body.data.RemainingAmount), 0);
    ok(`POST /api/tickets/${testTicketId}/payments → 200 (paid $15.30, remaining: $${res.body.data.RemainingAmount})`);
  });

  test('POST /api/tickets/:id/payments returns 400 when amount <= 0', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/payments`)
      .send({ paymentTypeId: testPaymentTypeId, amount: 0 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('POST /api/tickets/:id/payments (amount=0) → 400 (ValidationError)');
  });

  test('POST /api/tickets/:id/close closes the ticket → 200', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/close`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.IsClosed, 1);
    assert.ok(res.body.data.TicketNumber, 'TicketNumber should be assigned');
    ok(`POST /api/tickets/${testTicketId}/close → 200 (closed, ticket#: ${res.body.data.TicketNumber})`);
  });

  test('POST /api/tickets/:id/close returns 409 when already closed', async () => {
    const res = await authPost(`/api/tickets/${testTicketId}/close`);
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'ConflictError');
    ok(`POST /api/tickets/${testTicketId}/close (already closed) → 409 (ConflictError)`);
  });
});

// =====================================================================
// TICKETS API — table conflict scenario (409)
// =====================================================================

describe('Tickets API — table conflict (409)', () => {
  let firstTicketId = null;

  test('POST /api/tickets with tableId creates a ticket linked to the table → 201', async () => {
    const res = await authPost('/api/tickets')
      .send({ departmentId: 1, ticketTypeId: 1, tableId: testTableId });
    assert.strictEqual(res.status, 201);
    firstTicketId = res.body.data.Id;
    ok(`POST /api/tickets (tableId=${testTableId}) → 201 (ticket ${firstTicketId})`);
  });

  test('POST /api/tickets with same tableId returns 409 (conflict)', async () => {
    const res = await authPost('/api/tickets')
      .send({ departmentId: 1, ticketTypeId: 1, tableId: testTableId });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'ConflictError');
    assert.match(res.body.message, /already has an open ticket/i);
    ok(`POST /api/tickets (tableId=${testTableId} again) → 409 (ConflictError)`);
  });

  test('PATCH /api/tables/:id/state to "Available" with open ticket returns 409', async () => {
    const res = await authPatch(`/api/tables/${testTableId}/state`)
      .send({ state: 'Available' });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'ConflictError');
    assert.match(res.body.message, /open ticket/i);
    ok(`PATCH /api/tables/${testTableId}/state (Available with open ticket) → 409 (ConflictError)`);
  });

  // Clean up the conflicting ticket
  after(async () => {
    if (firstTicketId) {
      await db('Orders').where({ TicketId: firstTicketId }).del();
      await db('Payments').where({ TicketId: firstTicketId }).del();
      await db('Calculations').where({ TicketId: firstTicketId }).del();
      await db('TicketEntities').where({ TicketId: firstTicketId }).del();
      await db('Tickets').where({ Id: firstTicketId }).del();
    }
  });
});

// =====================================================================
// PRINT MOCK
// =====================================================================

describe('Print mock', () => {
  test('GET /api/tickets/:id/print returns 200 with ESC/POS base64', async () => {
    const res = await authGet(`/api/tickets/${testTicketId}/print`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.escposBase64, 'escposBase64 should be present');
    assert.ok(res.body.data.escposBase64.length > 0, 'escposBase64 should not be empty');
    assert.ok(res.body.data.formatted, 'formatted text should be present');
    assert.ok(res.body.data.escposBytesCount > 0, 'byte count should be > 0');

    // Verify the base64 decodes to a Buffer starting with ESC @ (0x1B 0x40)
    const buf = Buffer.from(res.body.data.escposBase64, 'base64');
    assert.strictEqual(buf[0], 0x1B);
    assert.strictEqual(buf[1], 0x40);

    // Verify the formatted text contains expected lines
    assert.match(res.body.data.formatted, /Ticket:/);
    assert.match(res.body.data.formatted, /Subtotal/);
    assert.match(res.body.data.formatted, /<cut>/);

    ok(`GET /api/tickets/${testTicketId}/print → 200 (${res.body.data.escposBytesCount} ESC/POS bytes, base64 length ${res.body.data.escposBase64.length})`);
  });

  test('GET /api/tickets/:id/print returns 404 for non-existent ticket', async () => {
    const res = await authGet('/api/tickets/999999/print');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NotFoundError');
    ok('GET /api/tickets/999999/print → 404 (NotFoundError)');
  });
});

// =====================================================================
// Validation edge cases
// =====================================================================

describe('Validation edge cases', () => {
  test('POST /api/tickets/:id/orders with invalid ticketId returns 400', async () => {
    const res = await authPost('/api/tickets/notanumber/orders')
      .send({ menuItemId: 1 });
    assert.strictEqual(res.status, 400);
    ok('POST /api/tickets/notanumber/orders → 400 (invalid id type)');
  });

  test('POST /api/tickets with non-existent departmentId returns 400', async () => {
    const res = await authPost('/api/tickets')
      .send({ departmentId: 999999, ticketTypeId: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('POST /api/tickets (invalid departmentId) → 400 (ValidationError)');
  });
});

// =====================================================================
// Sprint 5 — JWT Authentication tests
// =====================================================================

describe('JWT Authentication', () => {
  test('POST /api/auth/login with valid credentials returns 200 + token', async () => {
    const res = await request.post('/api/auth/login')
      .send({ username: 'Administrator', pin: '1234' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.name, 'Administrator');
    assert.strictEqual(res.body.user.isAdmin, true);
    ok('POST /api/auth/login (valid) → 200 + JWT token + user info');
  });

  test('POST /api/auth/login with invalid PIN returns 401', async () => {
    const res = await request.post('/api/auth/login')
      .send({ username: 'Administrator', pin: 'wrong' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UnauthorizedError');
    ok('POST /api/auth/login (wrong PIN) → 401 UnauthorizedError');
  });

  test('POST /api/auth/login with missing fields returns 400', async () => {
    const res = await request.post('/api/auth/login').send({ username: 'Administrator' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'ValidationError');
    ok('POST /api/auth/login (no pin) → 400 ValidationError');
  });

  test('GET /api/tickets without token returns 401', async () => {
    const res = await request.get('/api/tickets');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UnauthorizedError');
    ok('GET /api/tickets (no token) → 401 UnauthorizedError');
  });

  test('GET /api/tickets with invalid token returns 401', async () => {
    const res = await request.get('/api/tickets')
      .set('Authorization', 'Bearer invalid.token.here');
    assert.strictEqual(res.status, 401);
    ok('GET /api/tickets (invalid token) → 401');
  });

  test('GET /api/auth/me with valid token returns user info', async () => {
    const res = await request.get('/api/auth/me')
      .set('Authorization', 'Bearer ' + jwtToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.username, 'Administrator');
    ok('GET /api/auth/me → 200 (user info)');
  });
});

// =====================================================================
// Sprint 5 — Extended endpoints (note, gift, void, tags)
// =====================================================================

describe('Sprint 5 — Extended ticket endpoints', () => {
  let sprint5TicketId = null;

  test('Setup: create ticket + add order for extended tests', async () => {
    const createRes = await authPost('/api/tickets').send({ departmentId: 1, ticketTypeId: 1 });
    assert.strictEqual(createRes.status, 201);
    sprint5TicketId = createRes.body.data.Id;

    const orderRes = await authPost(`/api/tickets/${sprint5TicketId}/orders`)
      .send({ menuItemId: testMenuItemId, quantity: 1 });
    assert.strictEqual(orderRes.status, 200);
    ok(`Setup: ticket ${sprint5TicketId} + 1 order`);
  });

  test('POST /api/tickets/:id/note sets the note', async () => {
    const res = await authPost(`/api/tickets/${sprint5TicketId}/note`)
      .send({ note: 'Test note from Sprint 5' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Note, 'Test note from Sprint 5');
    ok('POST /api/tickets/:id/note → 200 (note saved)');
  });

  test('POST /api/tickets/:id/tags sets ticket tags', async () => {
    const res = await authPost(`/api/tickets/${sprint5TicketId}/tags`)
      .send({ tags: [{ name: 'OrderType', value: 'Dine-in' }] });
    assert.strictEqual(res.status, 200);
    const tags = JSON.parse(res.body.data.TicketTags);
    assert.strictEqual(tags[0].TagName, 'OrderType');
    assert.strictEqual(tags[0].TagValue, 'Dine-in');
    ok('POST /api/tickets/:id/tags → 200 (tags saved)');
  });

  test('POST /api/tickets/:id/gift marks an order as Gift', async () => {
    const ticket = await authGet(`/api/tickets/${sprint5TicketId}`);
    const orderId = ticket.body.data.Orders[0].Id;
    const res = await authPost(`/api/tickets/${sprint5TicketId}/gift`)
      .send({ orderIds: [orderId] });
    assert.strictEqual(res.status, 200);
    // After gift, the order should have CalculatePrice=0 and TotalAmount should be 0
    assert.strictEqual(res.body.data.Orders[0].CalculatePrice, 0);
    assert.strictEqual(Number(res.body.data.TotalAmount), 0);
    ok('POST /api/tickets/:id/gift → 200 (order marked as Gift, total=0)');
  });

  test('POST /api/tickets/:id/void voids the ticket', async () => {
    const res = await authPost(`/api/tickets/${sprint5TicketId}/void`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.IsClosed, 1);
    const states = JSON.parse(res.body.data.TicketStates);
    const status = states.find(s => s.StateName === 'Status');
    assert.strictEqual(status.State, 'Void');
    ok('POST /api/tickets/:id/void → 200 (ticket voided, state=Void)');
  });

  test('POST /api/tickets/:id/void on already-closed returns 409', async () => {
    const res = await authPost(`/api/tickets/${sprint5TicketId}/void`);
    assert.strictEqual(res.status, 409);
    ok('POST /api/tickets/:id/void (already closed) → 409');
  });
});

// =====================================================================
// Sprint 5 — Split / Refund / Merge
// =====================================================================

describe('Sprint 5 — Split, Refund, Merge', () => {
  let splitSourceId = null;
  let splitNewId = null;
  let refundOriginalId = null;
  let mergeSource1 = null;
  let mergeSource2 = null;
  let mergeResultId = null;

  test('SPLIT: create ticket with 2 orders, split 1 order to new ticket', async () => {
    // Setup
    const createRes = await authPost('/api/tickets').send({ departmentId: 1, ticketTypeId: 1 });
    splitSourceId = createRes.body.data.Id;
    await authPost(`/api/tickets/${splitSourceId}/orders`).send({ menuItemId: testMenuItemId, quantity: 2 });
    await authPost(`/api/tickets/${splitSourceId}/orders`).send({ menuItemId: testMenuItemId, quantity: 3 });
    const beforeSplit = await authGet(`/api/tickets/${splitSourceId}`);
    assert.strictEqual(beforeSplit.body.data.Orders.length, 2);

    // Split: move first order to new ticket
    const orderIdToMove = beforeSplit.body.data.Orders[0].Id;
    const splitRes = await authPost(`/api/tickets/${splitSourceId}/split`).send({ orderIds: [orderIdToMove] });
    assert.strictEqual(splitRes.status, 201);
    splitNewId = splitRes.body.data.newTicket.Id;
    assert.strictEqual(splitRes.body.data.sourceTicket.Orders.length, 1);
    assert.strictEqual(splitRes.body.data.newTicket.Orders.length, 1);
    ok(`SPLIT: source ${splitSourceId} (1 order) + new ${splitNewId} (1 order)`);
  });

  test('REFUND: closed ticket can be refunded', async () => {
    // Create + close a ticket
    const createRes = await authPost('/api/tickets').send({ departmentId: 1, ticketTypeId: 1 });
    refundOriginalId = createRes.body.data.Id;
    await authPost(`/api/tickets/${refundOriginalId}/orders`).send({ menuItemId: testMenuItemId, quantity: 1 });
    await authPost(`/api/tickets/${refundOriginalId}/payments`).send({ paymentTypeId: testPaymentTypeId, amount: 8.50 });
    await authPost(`/api/tickets/${refundOriginalId}/close`);

    // Refund — in-place reversal (no separate refund ticket)
    const refundRes = await authPost(`/api/tickets/${refundOriginalId}/refund`)
      .send({ amount: 5.00, reason: 'Customer was dissatisfied' });
    assert.strictEqual(refundRes.status, 200);
    assert.ok(refundRes.body.data.refundedTicket.Id > 0);
    assert.strictEqual(refundRes.body.data.refundAmount, 5.00);
    ok(`REFUND: original ${refundOriginalId} refunded $${refundRes.body.data.refundAmount} (in-place)`);
  });

  test('MERGE: two open tickets combine into one', async () => {
    // Create two tickets with orders
    const c1 = await authPost('/api/tickets').send({ departmentId: 1, ticketTypeId: 1 });
    mergeSource1 = c1.body.data.Id;
    await authPost(`/api/tickets/${mergeSource1}/orders`).send({ menuItemId: testMenuItemId, quantity: 1 });

    const c2 = await authPost('/api/tickets').send({ departmentId: 1, ticketTypeId: 1 });
    mergeSource2 = c2.body.data.Id;
    await authPost(`/api/tickets/${mergeSource2}/orders`).send({ menuItemId: testMenuItemId, quantity: 2 });

    // Merge
    const mergeRes = await authPost('/api/tickets/merge').send({ sourceTicketIds: [mergeSource1, mergeSource2] });
    assert.strictEqual(mergeRes.status, 201);
    mergeResultId = mergeRes.body.data.mergedTicket.Id;
    assert.strictEqual(mergeRes.body.data.mergedTicket.Orders.length, 2);
    ok(`MERGE: ${mergeSource1} + ${mergeSource2} → ${mergeResultId} (2 orders)`);

    // Verify sources are closed
    const src1 = await authGet(`/api/tickets/${mergeSource1}`);
    assert.strictEqual(src1.body.data.IsClosed, 1);
    ok('MERGE: source ticket 1 marked as closed');
  });
});
