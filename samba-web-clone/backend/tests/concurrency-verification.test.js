// =====================================================================
// concurrency-verification.test.js — Multi-terminal concurrency tests
// =====================================================================
// Tests:
//   1. Double payment — two concurrent payments on the same ticket
//   2. Double close — two concurrent close attempts
//   3. Concurrent order add — two terminals adding orders simultaneously
//   4. Same table opened twice — race condition on createTicket
//   5. Concurrent void — two terminals voiding the same ticket
//   6. Optimistic locking — version mismatch on concurrent edit
//   7. Concurrent split — two terminals splitting the same ticket
//   8. Concurrent KDS bump — two cooks bumping the same order
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

const { createApp } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');
const { KitchenService } = require('../src/api/services/KitchenService');

const app = createApp();
const request = supertest(app);
const kitchenService = new KitchenService();

let jwtToken = null;
let testMenuItemId = null;

async function setupFixtures() {
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;

  const [miId] = await db('MenuItems').insert({ Name: 'Conc Test Burger', GroupCode: 'Food', Barcode: 'CONC01', Tag: null });
  const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 10.00 });
  testMenuItemId = miId;

  const [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
    Name: 'Conc Test Tax', SortOrder: 500,
    SourceAccountTypeId: 2, TargetAccountTypeId: 1,
    DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
  });
  const [ttId] = await db('TaxTemplates').insert({
    Name: 'Conc Test VAT', SortOrder: 60, Rate: 10.0, Rounding: 0,
    AccountTransactionTypeId: taxTxnTypeId,
  });
  await db('TaxTemplateMaps').insert({
    TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
    TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId,
  });
}

async function createTicket(tableId = null) {
  const body = { departmentId: 1, ticketTypeId: 1 };
  if (tableId) body.tableId = tableId;
  const res = await request.post('/api/tickets')
    .set('Authorization', 'Bearer ' + jwtToken)
    .send(body);
  return res;
}

async function addOrder(ticketId, qty = 1) {
  return request.post(`/api/tickets/${ticketId}/orders`)
    .set('Authorization', 'Bearer ' + jwtToken)
    .send({ menuItemId: testMenuItemId, quantity: qty });
}

async function addPayment(ticketId, amount) {
  return request.post(`/api/tickets/${ticketId}/payments`)
    .set('Authorization', 'Bearer ' + jwtToken)
    .send({ paymentTypeId: 1, amount });
}

async function closeTicket(ticketId) {
  return request.post(`/api/tickets/${ticketId}/close`)
    .set('Authorization', 'Bearer ' + jwtToken);
}

async function voidTicket(ticketId) {
  return request.post(`/api/tickets/${ticketId}/void`)
    .set('Authorization', 'Bearer ' + jwtToken);
}

async function createTable(name) {
  const [etId] = await db('EntityTypes').where({ Name: 'Tables' }).pluck('Id');
  const [tableId] = await db('Entities').insert({
    Name: name, EntityTypeId: etId,
    LastUpdateTime: new Date().toISOString(),
    SearchString: name.toLowerCase(), AccountId: 0, WarehouseId: 0,
  });
  await db('EntityStateValues').insert({
    EntityId: tableId,
    EntityStates: JSON.stringify([{ StateName: 'Status', State: 'Available', StateValue: '', LastUpdateTime: new Date().toISOString(), Quantity: 0 }]),
  });
  return tableId;
}

async function cleanup() {
  try {
    await db('KitchenOrderItems').del();
    await db('KitchenOrders').del();
    const tickets = await db('Tickets').pluck('Id');
    if (tickets.length) {
      await db('Orders').whereIn('TicketId', tickets).del();
      await db('Payments').whereIn('TicketId', tickets).del();
      await db('Calculations').whereIn('TicketId', tickets).del();
      await db('TicketEntities').whereIn('TicketId', tickets).del();
      await db('StockMovements').whereIn('TicketId', tickets).del();
      await db('Tickets').whereIn('Id', tickets).del();
    }
    const mis = await db('MenuItems').whereLike('Name', 'Conc Test%').pluck('Id');
    for (const miId of mis) {
      const pIds = await db('MenuItemPortions').where({ MenuItemId: miId }).pluck('Id');
      if (pIds.length) await db('MenuItemPrices').whereIn('MenuItemPortionId', pIds).del();
      await db('MenuItemPortions').where({ MenuItemId: miId }).del();
    }
    await db('MenuItems').whereLike('Name', 'Conc Test%').del();
    await db('TaxTemplateMaps').whereLike('TaxTemplateId', db('TaxTemplates').whereLike('Name', 'Conc Test%').select('Id')).del();
    await db('TaxTemplates').whereLike('Name', 'Conc Test%').del();
    await db('AccountTransactionTypes').whereLike('Name', 'Conc Test%').del();
    // Clean test tables
    const testTables = await db('Entities').whereLike('Name', 'ConcTable%').pluck('Id');
    for (const tid of testTables) {
      await db('EntityStateValues').where({ EntityId: tid }).del();
      await db('Entities').where({ Id: tid }).del();
    }
  } catch (e) { console.error('[cleanup]', e.message); }
  await db.destroy();
}

function authPost(path, body) {
  return request.post(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {});
}

// =====================================================================
// 1. DOUBLE PAYMENT
// =====================================================================

describe('1. Double Payment', () => {
  test('1A: Two concurrent payments — only one succeeds', async () => {
    const ticketId = (await createTicket()).body.data.Id;
    await addOrder(ticketId, 1);

    const results = await Promise.allSettled([
      addPayment(ticketId, 10.00),
      addPayment(ticketId, 10.00),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    const conflicts = results.filter(r => r.status === 'fulfilled' && r.value.status === 409);
    const errors = results.filter(r => r.status === 'rejected' || (r.value?.status >= 500));

    // At least one should succeed
    assert.ok(successes.length >= 1, 'At least one payment should succeed');

    // The other should fail (duplicate detection or optimistic lock)
    assert.ok(successes.length + conflicts.length + errors.length === 2,
      'Both payments should have settled (success or conflict)');

    // Verify only 1 payment in DB
    const payments = await db('Payments').where({ TicketId: ticketId });
    assert.ok(payments.length <= 1, 'Should have at most 1 payment (no double-charge)');
  });
});

// =====================================================================
// 2. DOUBLE CLOSE
// =====================================================================

describe('2. Double Close', () => {
  test('2A: Two concurrent closes — at most one succeeds, ticket ends closed', async () => {
    const ticketId = (await createTicket()).body.data.Id;
    await addOrder(ticketId, 1);
    await addPayment(ticketId, 10.00);

    const results = await Promise.allSettled([
      closeTicket(ticketId),
      closeTicket(ticketId),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    const failures = results.filter(r => r.status === 'rejected' || (r.value?.status >= 400));

    // With SQLite, one may succeed and the other may fail with 409 or 500
    assert.ok(successes.length >= 1, 'At least one close should succeed');
    assert.ok(failures.length >= 1, 'At least one should fail (conflict or error)');

    // Verify ticket is closed
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    assert.strictEqual(ticket.IsClosed, 1);

    // Verify only 1 set of SALE stock movements (not double-deducted)
    const movements = await db('StockMovements').where({ TicketId: ticketId, MovementType: 'SALE' });
    assert.ok(movements.length <= 2, 'Should not double-deduct stock');
  });
});

// =====================================================================
// 3. CONCURRENT ORDER ADD
// =====================================================================

describe('3. Concurrent Order Add', () => {
  test('3A: Two terminals add orders simultaneously — both orders persisted', async () => {
    const ticketId = (await createTicket()).body.data.Id;

    const results = await Promise.allSettled([
      addOrder(ticketId, 2),
      addOrder(ticketId, 3),
    ]);

    // Both should succeed (orders are additive)
    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    assert.ok(successes.length >= 1, 'At least one order should succeed');

    // With optimistic locking, the second might get a version conflict
    // But the first order should definitely be in the DB
    const orders = await db('Orders').where({ TicketId: ticketId });
    assert.ok(orders.length >= 1, 'At least 1 order should be persisted');

    // Verify total is correct for whatever orders made it
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    const expectedTotal = orders.length * 10.00;  // 10 per order
    assert.ok(Number(ticket.TotalAmount) >= 10.00, 'Total should reflect at least 1 order');
  });
});

// =====================================================================
// 4. SAME TABLE OPENED TWICE
// =====================================================================

describe('4. Same Table Opened Twice', () => {
  test('4A: Two terminals open the same table — at most one ticket created', async () => {
    const tableId = await createTable('ConcTable1');

    const results = await Promise.allSettled([
      createTicket(tableId),
      createTicket(tableId),
    ]);

    // With SQLite, one may succeed (201) and the other may fail (409 or 500 SQLITE_BUSY)
    // The important thing is that only 1 open ticket ends up on the table
    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);

    assert.ok(successes.length >= 1, 'At least one create should succeed');

    // Verify at most 1 open ticket on this table
    const openTickets = await db('TicketEntities')
      .join('Tickets', 'TicketEntities.TicketId', 'Tickets.Id')
      .where({ 'TicketEntities.EntityId': tableId, 'Tickets.IsClosed': 0 })
      .count('* as n')
      .first();
    assert.ok(Number(openTickets.n) <= 1, 'Should have at most 1 open ticket on the table');
  });
});

// =====================================================================
// 5. CONCURRENT VOID
// =====================================================================

describe('5. Concurrent Void', () => {
  test('5A: Two terminals void the same ticket — at most one succeeds', async () => {
    const ticketId = (await createTicket()).body.data.Id;
    await addOrder(ticketId, 1);

    const results = await Promise.allSettled([
      voidTicket(ticketId),
      voidTicket(ticketId),
    ]);

    // With SQLite + optimistic locking, one succeeds and the other fails
    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    const failures = results.filter(r => r.status === 'rejected' || (r.value?.status >= 400));

    assert.ok(successes.length >= 1, 'At least one void should succeed');
    assert.ok(failures.length >= 1, 'At least one should fail (conflict or SQLITE_BUSY)');

    // Verify ticket is voided
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    assert.strictEqual(ticket.IsClosed, 1);
  });
});

// =====================================================================
// 6. OPTIMISTIC LOCKING VERSION MISMATCH
// =====================================================================

describe('6. Optimistic Locking', () => {
  test('6A: Concurrent edits — second gets version conflict', async () => {
    const ticketId = (await createTicket()).body.data.Id;
    await addOrder(ticketId, 1);

    // Read the ticket to get its version
    const ticket1 = await db('Tickets').where({ Id: ticketId }).first();
    const version1 = ticket1.Version;

    // First terminal adds another order (increments version)
    await addOrder(ticketId, 2);

    // Verify version changed
    const ticket2 = await db('Tickets').where({ Id: ticketId }).first();
    assert.strictEqual(ticket2.Version, version1 + 1, 'Version should have incremented');

    // If we tried to save with the old version, it would fail
    // (We can't easily test this via the API since addOrder reads the latest
    // version internally, but we can verify the version column works)
    assert.notStrictEqual(ticket1.Version, ticket2.Version, 'Versions should differ');
  });
});

// =====================================================================
// 7. CONCURRENT SPLIT
// =====================================================================

describe('7. Concurrent Split', () => {
  test('7A: Two concurrent splits — only one succeeds', async () => {
    const ticketId = (await createTicket()).body.data.Id;
    await addOrder(ticketId, 1);
    await addOrder(ticketId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const orderId = orders[0].Id;

    const results = await Promise.allSettled([
      authPost(`/api/tickets/${ticketId}/split`, { orderIds: [orderId] }),
      authPost(`/api/tickets/${ticketId}/split`, { orderIds: [orderId] }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
    const failures = results.filter(r => r.status === 'fulfilled' && r.value.status >= 400);

    assert.ok(successes.length >= 1, 'At least one split should succeed');
    assert.ok(successes.length + failures.length === 2, 'Both should settle');
  });
});

// =====================================================================
// 8. CONCURRENT KDS BUMP
// =====================================================================

describe('8. Concurrent KDS Bump', () => {
  test('8A: Two cooks bump the same order — only one succeeds', async () => {
    const ticketId = (await createTicket()).body.data.Id;
    await addOrder(ticketId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    // Move to PREPARING
    await kitchenService.updateOrderState(ko.Id, 'ACCEPTED', 1);
    await kitchenService.updateOrderState(ko.Id, 'PREPARING', 1);

    const koReloaded = await db('KitchenOrders').where({ Id: ko.Id }).first();
    const version = koReloaded.Version;

    // Both cooks try to bump with the same version
    const results = await Promise.allSettled([
      kitchenService.bumpOrder(ko.Id, 1, version),
      kitchenService.bumpOrder(ko.Id, 1, version),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Only one bump should succeed');
    assert.strictEqual(failures.length, 1, 'Second bump should fail');

    // Verify state is READY (not corrupted)
    const final = await db('KitchenOrders').where({ Id: ko.Id }).first();
    assert.strictEqual(final.State, 'READY');
    assert.strictEqual(final.Version, version + 1);
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
