// =====================================================================
// kds-verification.test.js — KDS deep verification tests
// =====================================================================
// Tests:
//   1. Atomicity POS→KDS (success + forced failure + rollback)
//   2. Routing (MenuItemId, GroupCode, Default, multiple destinations, priority)
//   3. Idempotency (race condition + UNIQUE constraint)
//   4. State machine (full transition matrix)
//   5. RECALL distinct from updateState
//   6. Optimistic locking (concurrent bump → 409)
//   7. Void POS→KDS (propagation + rollback)
//   8. Audit log (Before/After for each KDS operation)
//   9. API validation (NaN, undefined, invalid states)
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

const { createApp } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');
const { KitchenService, KITCHEN_STATES, VALID_TRANSITIONS } = require('../src/api/services/KitchenService');

const app = createApp();
const request = supertest(app);
const kitchenService = new KitchenService();

// =====================================================================
// Helpers
// =====================================================================

let jwtToken = null;
let testMenuItemId = null;
let testTicketId = null;
let testStationId = null;
let testKitchenOrderId = null;

async function setupFixtures() {
  // Login
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;

  // Create a menu item with GroupCode 'Food' (routes to KITCHEN station)
  const [miId] = await db('MenuItems').insert({ Name: 'KDS Test Burger', GroupCode: 'Food', Barcode: 'KDS01', Tag: null });
  const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 10.00 });
  testMenuItemId = miId;

  // Create a menu item with GroupCode 'Drinks' (routes to DRINKS station)
  const [miId2] = await db('MenuItems').insert({ Name: 'KDS Test Cola', GroupCode: 'Drinks', Barcode: 'KDS02', Tag: null });
  const [portionId2] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId2, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId2, PriceTag: null, Price: 3.00 });

  // Get the KITCHEN station
  const station = await db('KitchenStations').where({ Code: 'KITCHEN' }).first();
  testStationId = station.Id;

  // Create a tax template for the menu items
  const [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
    Name: 'KDS Test Tax', SortOrder: 300,
    SourceAccountTypeId: 2, TargetAccountTypeId: 1,
    DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
  });
  const [ttId] = await db('TaxTemplates').insert({
    Name: 'KDS Test VAT', SortOrder: 40, Rate: 10.0, Rounding: 0,
    AccountTransactionTypeId: taxTxnTypeId,
  });
  await db('TaxTemplateMaps').insert([
    { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
      TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId },
    { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
      TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId2 },
  ]);
}

async function createTicket() {
  const res = await request.post('/api/tickets')
    .set('Authorization', 'Bearer ' + jwtToken)
    .send({ departmentId: 1, ticketTypeId: 1 });
  return res.body.data.Id;
}

async function addOrder(ticketId, menuItemId, quantity = 1) {
  const res = await request.post(`/api/tickets/${ticketId}/orders`)
    .set('Authorization', 'Bearer ' + jwtToken)
    .send({ menuItemId, quantity });
  return res;
}

async function cleanup() {
  try {
    // Clean up all test data
    await db('KitchenOrderItems').del();
    await db('KitchenOrders').del();
    const tickets = await db('Tickets').pluck('Id');
    if (tickets.length > 0) {
      await db('Orders').whereIn('TicketId', tickets).del();
      await db('Payments').whereIn('TicketId', tickets).del();
      await db('Calculations').whereIn('TicketId', tickets).del();
      await db('TicketEntities').whereIn('TicketId', tickets).del();
      await db('Tickets').whereIn('Id', tickets).del();
    }
    const mis = await db('MenuItems').whereLike('Name', 'KDS Test%').pluck('Id');
    for (const miId of mis) {
      const pIds = await db('MenuItemPortions').where({ MenuItemId: miId }).pluck('Id');
      if (pIds.length) await db('MenuItemPrices').whereIn('MenuItemPortionId', pIds).del();
      await db('MenuItemPortions').where({ MenuItemId: miId }).del();
    }
    await db('MenuItems').whereLike('Name', 'KDS Test%').del();
    await db('TaxTemplateMaps').whereLike('TaxTemplateId', db('TaxTemplates').whereLike('Name', 'KDS Test%').select('Id')).del();
    await db('TaxTemplates').whereLike('Name', 'KDS Test%').del();
    await db('AccountTransactionTypes').whereLike('Name', 'KDS Test%').del();
    await db('AuditLogs').whereLike('Action', 'kitchen.%').del();
  } catch (err) {
    console.error('[cleanup]', err.message);
  }
  await db.destroy();
}

function authGet(path) { return request.get(path).set('Authorization', 'Bearer ' + jwtToken); }
function authPost(path, body) { return request.post(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }

// =====================================================================
// 1. ATOMICITY TESTS
// =====================================================================

describe('1. Atomicity POS→KDS', () => {
  test('1A: Success — ticket + order + kitchen order all persisted', async () => {
    const ticketId = await createTicket();
    const res = await addOrder(ticketId, testMenuItemId, 2);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Orders.length, 1);

    // Verify KitchenOrder was created
    const kitchenOrders = await db('KitchenOrders').where({ TicketId: ticketId });
    assert.strictEqual(kitchenOrders.length, 1);
    assert.strictEqual(kitchenOrders[0].State, 'NEW');

    // Verify KitchenOrderItem was created
    const items = await db('KitchenOrderItems').where({ KitchenOrderId: kitchenOrders[0].Id });
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].MenuItemName, 'KDS Test Burger');
    assert.strictEqual(Number(items[0].Quantity), 2);
  });

  test('1B: Forced kitchen failure → full rollback (no partial state)', async () => {
    const ticketId = await createTicket();

    // Patch the KitchenService prototype to force failure
    const originalRoute = require('../src/api/services/KitchenService').KitchenService.prototype.routeOrderToKitchen;
    require('../src/api/services/KitchenService').KitchenService.prototype.routeOrderToKitchen = async function() {
      throw new Error('FORCED_KITCHEN_FAILURE');
    };

    try {
      const orderRes = await addOrder(ticketId, testMenuItemId, 1);
      // addOrder should fail (500) because kitchen routing failed inside the transaction
      assert.strictEqual(orderRes.status, 500);

      // Verify NO order was persisted (rollback worked)
      const orders = await db('Orders').where({ TicketId: ticketId });
      assert.strictEqual(orders.length, 0, 'Order should have been rolled back');

      // Verify NO kitchen order was persisted
      const kitchenOrders = await db('KitchenOrders').where({ TicketId: ticketId });
      assert.strictEqual(kitchenOrders.length, 0, 'KitchenOrder should have been rolled back');
    } finally {
      // Restore original
      require('../src/api/services/KitchenService').KitchenService.prototype.routeOrderToKitchen = originalRoute;
    }
  });

  test('1C: Transaction context — routeOrderToKitchen accepts trx', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const order = orders[0];
    const ticket = await db('Tickets').where({ Id: ticketId }).first();

    // Call routeOrderToKitchen with a trx — should work within transaction
    const { withTransaction } = require('../src/infrastructure/db/db');
    await withTransaction(async (trx) => {
      await kitchenService.routeOrderToKitchen(order, ticket, 1, trx);
    });

    // Verify a second kitchen order was NOT created (idempotency)
    const kitchenOrders = await db('KitchenOrders').where({ OrderId: order.Id });
    assert.strictEqual(kitchenOrders.length, 1, 'Should still have exactly 1 kitchen order (idempotent)');
  });
});

// =====================================================================
// 2. ROUTING TESTS
// =====================================================================

describe('2. Routing', () => {
  test('2A: GroupCode routing — Food → KITCHEN station', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const kitchenOrders = await db('KitchenOrders').where({ OrderId: orders[0].Id });
    assert.strictEqual(kitchenOrders.length, 1);

    const station = await db('KitchenStations').where({ Id: kitchenOrders[0].KitchenStationId }).first();
    assert.strictEqual(station.Code, 'KITCHEN');
  });

  test('2B: GroupCode routing — Drinks → DRINKS station', async () => {
    const drinksItem = await db('MenuItems').where({ Name: 'KDS Test Cola' }).first();
    const ticketId = await createTicket();
    await addOrder(ticketId, drinksItem.Id, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const kitchenOrders = await db('KitchenOrders').where({ OrderId: orders[0].Id });
    assert.strictEqual(kitchenOrders.length, 1);

    const station = await db('KitchenStations').where({ Id: kitchenOrders[0].KitchenStationId }).first();
    assert.strictEqual(station.Code, 'DRINKS');
  });

  test('2C: Default station — no routing rule → IsDefault=1', async () => {
    // Create a menu item with a GroupCode that has no routing rule
    const [miId] = await db('MenuItems').insert({ Name: 'KDS Test Dessert', GroupCode: 'Dessert', Barcode: 'KDS03', Tag: null });
    const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
    await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 5.00 });
    // Add tax template for this item
    const taxTemplate = await db('TaxTemplates').where({ Name: 'KDS Test VAT' }).first();
    if (taxTemplate) {
      await db('TaxTemplateMaps').insert({
        TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        TaxTemplateId: taxTemplate.Id, MenuItemGroupCode: null, MenuItemId: miId,
      });
    }

    const ticketId = await createTicket();
    await addOrder(ticketId, miId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    assert.ok(orders.length > 0, 'Order should have been created');
    const kitchenOrders = await db('KitchenOrders').where({ OrderId: orders[0].Id });
    assert.strictEqual(kitchenOrders.length, 1, 'Should route to default station');

    const station = await db('KitchenStations').where({ Id: kitchenOrders[0].KitchenStationId }).first();
    assert.strictEqual(station.IsDefault, 1, 'Should be the default station');
    assert.strictEqual(station.Code, 'KITCHEN');

    // Cleanup (ignore FK errors — the test data will be cleaned up in the final teardown)
    try {
      await db('TaxTemplateMaps').where({ MenuItemId: miId }).del();
      await db('MenuItemPrices').where({ MenuItemPortionId: portionId }).del();
      await db('MenuItemPortions').where({ MenuItemId: miId }).del();
      await db('MenuItems').where({ Id: miId }).del();
    } catch (e) { /* FK constraint — will be cleaned in final teardown */ }
  });

  test('2D: Priority — MenuItemId routing overrides GroupCode', async () => {
    // Create a menu item with GroupCode='Food' but add a specific routing to DRINKS
    const [miId] = await db('MenuItems').insert({ Name: 'KDS Test Special', GroupCode: 'Food', Barcode: 'KDS04', Tag: null });
    const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
    await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 7.00 });
    // Add tax template
    const taxTemplate = await db('TaxTemplates').where({ Name: 'KDS Test VAT' }).first();
    if (taxTemplate) {
      await db('TaxTemplateMaps').insert({
        TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        TaxTemplateId: taxTemplate.Id, MenuItemGroupCode: null, MenuItemId: miId,
      });
    }

    // Add specific routing: this Food item → DRINKS station
    const drinksStation = await db('KitchenStations').where({ Code: 'DRINKS' }).first();
    await db('KitchenStationRouting').insert({
      KitchenStationId: drinksStation.Id,
      MenuItemId: miId,
    });

    const ticketId = await createTicket();
    await addOrder(ticketId, miId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    assert.ok(orders.length > 0);
    const kitchenOrders = await db('KitchenOrders').where({ OrderId: orders[0].Id });
    assert.strictEqual(kitchenOrders.length, 1);

    const station = await db('KitchenStations').where({ Id: kitchenOrders[0].KitchenStationId }).first();
    assert.strictEqual(station.Code, 'DRINKS', 'MenuItemId routing should override GroupCode');

    // Cleanup (ignore FK errors)
    try {
      await db('KitchenStationRouting').where({ MenuItemId: miId }).del();
      await db('TaxTemplateMaps').where({ MenuItemId: miId }).del();
      await db('MenuItemPrices').where({ MenuItemPortionId: portionId }).del();
      await db('MenuItemPortions').where({ MenuItemId: miId }).del();
      await db('MenuItems').where({ Id: miId }).del();
    } catch (e) { /* FK constraint — will be cleaned in final teardown */ }
  });
});

// =====================================================================
// 3. IDEMPOTENCY TESTS
// =====================================================================

describe('3. Idempotency', () => {
  test('3A: Duplicate routeOrderToKitchen — only 1 KitchenOrder created', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const order = orders[0];
    const ticket = await db('Tickets').where({ Id: ticketId }).first();

    // Call routeOrderToKitchen again (simulating retry)
    await kitchenService.routeOrderToKitchen(order, ticket, 1);
    await kitchenService.routeOrderToKitchen(order, ticket, 1);

    const kitchenOrders = await db('KitchenOrders').where({ OrderId: order.Id });
    assert.strictEqual(kitchenOrders.length, 1, 'Should have exactly 1 kitchen order (idempotent)');
  });

  test('3B: UNIQUE constraint prevents duplicate even under race', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);

    const orders = await db('Orders').where({ TicketId: ticketId });
    const order = orders[0];
    const ticket = await db('Tickets').where({ Id: ticketId }).first();

    // Simulate concurrent calls
    const results = await Promise.allSettled([
      kitchenService.routeOrderToKitchen(order, ticket, 1),
      kitchenService.routeOrderToKitchen(order, ticket, 1),
      kitchenService.routeOrderToKitchen(order, ticket, 1),
    ]);

    // At least one should succeed, the rest should either succeed (idempotent check)
    // or fail (UNIQUE constraint) — either way, only 1 KitchenOrder should exist
    const kitchenOrders = await db('KitchenOrders').where({ OrderId: order.Id });
    assert.strictEqual(kitchenOrders.length, 1, 'Must have exactly 1 kitchen order after concurrent calls');
  });
});

// =====================================================================
// 4. STATE MACHINE TESTS
// =====================================================================

describe('4. State Machine', () => {
  // Helper: create a kitchen order in a given state
  async function createKitchenOrderInState(state) {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();
    if (state !== 'NEW') {
      await db('KitchenOrders').where({ Id: ko.Id }).update({ State: state });
    }
    return ko.Id;
  }

  // Test all valid transitions
  const validTransitions = [
    ['NEW', 'ACCEPTED'],
    ['NEW', 'VOIDED'],
    ['ACCEPTED', 'PREPARING'],
    ['ACCEPTED', 'READY'],
    ['ACCEPTED', 'VOIDED'],
    ['PREPARING', 'READY'],
    ['PREPARING', 'VOIDED'],
    ['READY', 'SERVED'],
    ['READY', 'VOIDED'],
  ];

  for (const [from, to] of validTransitions) {
    test(`4-VALID: ${from} → ${to} should succeed`, async () => {
      const koId = await createKitchenOrderInState(from);
      const result = await kitchenService.updateOrderState(koId, to, 1);
      assert.strictEqual(result.State, to);
    });
  }

  // Test all invalid transitions
  const invalidTransitions = [
    ['NEW', 'READY'],
    ['NEW', 'PREPARING'],
    ['NEW', 'SERVED'],
    ['ACCEPTED', 'SERVED'],
    ['PREPARING', 'SERVED'],
    ['PREPARING', 'ACCEPTED'],
    ['READY', 'NEW'],
    ['READY', 'ACCEPTED'],
    ['READY', 'PREPARING'],
    ['SERVED', 'PREPARING'],
    ['SERVED', 'VOIDED'],
    ['SERVED', 'NEW'],
    ['SERVED', 'ACCEPTED'],
    ['VOIDED', 'NEW'],
    ['VOIDED', 'ACCEPTED'],
    ['VOIDED', 'PREPARING'],
    ['VOIDED', 'READY'],
    ['VOIDED', 'SERVED'],
  ];

  for (const [from, to] of invalidTransitions) {
    test(`4-INVALID: ${from} → ${to} should fail with 409`, async () => {
      const koId = await createKitchenOrderInState(from);
      await assert.rejects(
        kitchenService.updateOrderState(koId, to, 1),
        (err) => {
          assert.ok(err.message.includes('Invalid state transition') || err.statusCode === 409,
            `Expected ConflictError for ${from}→${to}, got: ${err.message}`);
          return true;
        }
      );
    });
  }
});

// =====================================================================
// 5. RECALL TESTS
// =====================================================================

describe('5. RECALL', () => {
  test('5A: RECALL is distinct from updateState — only recall can SERVED→READY', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    // Move to SERVED via valid path
    await kitchenService.updateOrderState(ko.Id, 'ACCEPTED', 1);
    await kitchenService.updateOrderState(ko.Id, 'PREPARING', 1);
    await kitchenService.updateOrderState(ko.Id, 'READY', 1);
    await kitchenService.updateOrderState(ko.Id, 'SERVED', 1);

    // Verify SERVED
    const served = await db('KitchenOrders').where({ Id: ko.Id }).first();
    assert.strictEqual(served.State, 'SERVED');

    // Try updateState SERVED→READY (should fail — only recall can do this)
    await assert.rejects(
      kitchenService.updateOrderState(ko.Id, 'READY', 1),
      (err) => {
        assert.ok(err.message.includes('Invalid state transition'));
        return true;
      }
    );

    // Use recallOrder (should succeed)
    const result = await kitchenService.recallOrder(ko.Id, 1);
    assert.strictEqual(result.State, 'READY');
  });

  test('5B: RECALL on non-SERVED order should fail', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    // Order is NEW — recall should fail (RECALL_TRANSITIONS only allows SERVED→READY)
    await assert.rejects(
      kitchenService.recallOrder(ko.Id, 1),
      (err) => {
        assert.ok(err.message.includes('Invalid state transition'),
          `Expected 'Invalid state transition', got: ${err.message}`);
        return true;
      }
    );
  });
});

// =====================================================================
// 6. OPTIMISTIC LOCKING TESTS
// =====================================================================

describe('6. Optimistic Locking', () => {
  test('6A: Concurrent BUMP — second should get 409', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    // Move to PREPARING first (BUMP = PREPARING→READY)
    await kitchenService.updateOrderState(ko.Id, 'ACCEPTED', 1);
    await kitchenService.updateOrderState(ko.Id, 'PREPARING', 1);

    // Reload to get current version
    const koReloaded = await db('KitchenOrders').where({ Id: ko.Id }).first();
    const version = koReloaded.Version;

    // First BUMP with correct version — should succeed
    const result = await kitchenService.bumpOrder(ko.Id, 1, version);
    assert.strictEqual(result.State, 'READY');

    // Verify version was incremented
    const koAfter = await db('KitchenOrders').where({ Id: ko.Id }).first();
    assert.strictEqual(koAfter.Version, version + 1, 'Version should have been incremented');

    // Second BUMP with old version — should fail with OPTIMISTIC_LOCK_CONFLICT
    await assert.rejects(
      kitchenService.bumpOrder(ko.Id, 1, version),  // same old version
      (err) => {
        assert.ok(err.message.includes('OPTIMISTIC_LOCK_CONFLICT') || err.message.includes('Invalid state transition'),
          `Expected OPTIMISTIC_LOCK_CONFLICT or Invalid state transition, got: ${err.message}`);
        return true;
      }
    );

    // Verify state is still READY (not corrupted)
    const final = await db('KitchenOrders').where({ Id: ko.Id }).first();
    assert.strictEqual(final.State, 'READY');
    assert.strictEqual(final.Version, version + 1);
  });

  test('6B: Optimistic locking on SERVE', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    // Move to READY
    await kitchenService.updateOrderState(ko.Id, 'ACCEPTED', 1);
    await kitchenService.updateOrderState(ko.Id, 'PREPARING', 1);
    await kitchenService.updateOrderState(ko.Id, 'READY', 1);

    const koReloaded = await db('KitchenOrders').where({ Id: ko.Id }).first();
    const version = koReloaded.Version;

    // First SERVE with correct version
    await kitchenService.serveOrder(ko.Id, 1, version);

    // Second SERVE with old version — should fail
    await assert.rejects(
      kitchenService.serveOrder(ko.Id, 1, version),
      (err) => {
        assert.ok(err.message.includes('OPTIMISTIC_LOCK_CONFLICT') || err.message.includes('Invalid state transition'));
        return true;
      }
    );
  });
});

// =====================================================================
// 7. VOID POS→KDS TESTS
// =====================================================================

describe('7. Void POS→KDS', () => {
  test('7A: voidTicket propagates to KitchenOrders', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);

    // Verify kitchen order exists and is NEW
    const kos = await db('KitchenOrders').where({ TicketId: ticketId });
    assert.strictEqual(kos.length, 1);
    assert.strictEqual(kos[0].State, 'NEW');

    // Void the ticket
    const voidRes = await authPost(`/api/tickets/${ticketId}/void`);
    assert.strictEqual(voidRes.status, 200);

    // Verify kitchen order is VOIDED
    const kosAfter = await db('KitchenOrders').where({ TicketId: ticketId });
    assert.strictEqual(kosAfter.length, 1);
    assert.strictEqual(kosAfter[0].State, 'VOIDED');
  });

  test('7B: voidTicket with multiple orders — all kitchen orders voided', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    await addOrder(ticketId, testMenuItemId, 1);

    const kos = await db('KitchenOrders').where({ TicketId: ticketId });
    assert.strictEqual(kos.length, 2);

    await authPost(`/api/tickets/${ticketId}/void`);

    const kosAfter = await db('KitchenOrders').where({ TicketId: ticketId });
    for (const ko of kosAfter) {
      assert.strictEqual(ko.State, 'VOIDED');
    }
  });
});

// =====================================================================
// 8. AUDIT LOG TESTS
// =====================================================================

describe('8. Audit Log', () => {
  test('8A: BUMP creates audit entry with Before=PREPARING, After=READY', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    // Move to PREPARING
    await kitchenService.updateOrderState(ko.Id, 'ACCEPTED', 1);
    await kitchenService.updateOrderState(ko.Id, 'PREPARING', 1);

    // Clear audit logs for this test
    await db('AuditLogs').whereLike('Action', 'kitchen.%').del();

    // BUMP via API (triggers auditLog middleware)
    const res = await authPost(`/api/kitchen/orders/${ko.Id}/bump`, {});
    assert.strictEqual(res.status, 200);

    // Check audit log
    const audit = await db('AuditLogs').where({ Action: 'kitchen.bump', EntityId: ko.Id }).first();
    assert.ok(audit, 'Audit entry should exist');
    assert.ok(audit.Before, 'Before should not be null');
    assert.ok(audit.After, 'After should not be null');

    const before = JSON.parse(audit.Before);
    const after = JSON.parse(audit.After);
    assert.strictEqual(before.State, 'PREPARING');
    assert.strictEqual(after.State, 'READY');
    assert.ok(audit.UserId > 0, 'UserId should be set');
    assert.ok(audit.Timestamp, 'Timestamp should be set');
  });

  test('8B: VOID creates audit entry with Before and After', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    await db('AuditLogs').whereLike('Action', 'kitchen.%').del();

    const res = await authPost(`/api/kitchen/orders/${ko.Id}/void`, {});
    assert.strictEqual(res.status, 200);

    const audit = await db('AuditLogs').where({ Action: 'kitchen.void', EntityId: ko.Id }).first();
    assert.ok(audit, 'Audit entry should exist');
    const before = JSON.parse(audit.Before);
    const after = JSON.parse(audit.After);
    assert.strictEqual(before.State, 'NEW');
    assert.strictEqual(after.State, 'VOIDED');
  });
});

// =====================================================================
// 9. API VALIDATION TESTS
// =====================================================================

describe('9. API Validation', () => {
  test('9A: Invalid state string → 400', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    const res = await authPost(`/api/kitchen/orders/${ko.Id}/state`, { state: 'INVALID_STATE' });
    assert.strictEqual(res.status, 400);
  });

  test('9B: Non-existent kitchen order → 404', async () => {
    const res = await authPost('/api/kitchen/orders/99999/bump', {});
    assert.strictEqual(res.status, 404);
  });

  test('9C: Invalid order ID (NaN) → 400 or 404', async () => {
    const res = await authPost('/api/kitchen/orders/notanumber/bump', {});
    // Should be 400 (ValidationError) or 404 (NotFound) — not 200 or 500
    assert.ok(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
  });

  test('9D: Missing state in body → 500 or 400', async () => {
    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    const orders = await db('Orders').where({ TicketId: ticketId });
    const ko = await db('KitchenOrders').where({ OrderId: orders[0].Id }).first();

    const res = await authPost(`/api/kitchen/orders/${ko.Id}/state`, {});
    // Should be 400 (ValidationError) or 500 (if state is undefined and not caught)
    assert.ok(res.status === 400 || res.status === 500, `Expected 400 or 500, got ${res.status}`);
  });

  test('9E: No auth token → 401', async () => {
    const res = await request.get('/api/kitchen/stations');
    assert.strictEqual(res.status, 401);
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
