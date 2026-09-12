// =====================================================================
// inventory-verification.test.js — Inventory deep verification tests
// =====================================================================
// Tests:
//   1. Recipe explosion (MenuItemPortion → Recipe → Ingredients)
//   2. Stock deduction on ticket close (transaccional)
//   3. Stock reversal on void (transaccional)
//   4. Stock balance correctness (movements reconstruct balance)
//   5. Manual movements (PURCHASE, WASTE, ADJUSTMENT)
//   6. Low stock alerts
//   7. Idempotency — close ticket twice doesn't double-deduct
//   8. Gifted orders (CalculatePrice=false) don't deduct stock
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

const { createApp } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');
const { InventoryService, MOVEMENT_TYPES } = require('../src/api/services/InventoryService');

const app = createApp();
const request = supertest(app);
const inventoryService = new InventoryService();

let jwtToken = null;
let testMenuItemId = null;
let testPortionId = null;
let testIngredientBread = null;
let testIngredientBeef = null;
let testWarehouseId = null;
let testRecipeId = null;

async function setupFixtures() {
  // Login
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;

  // Get warehouse
  const wh = await db('Warehouses').first();
  testWarehouseId = wh.Id;

  // Create a menu item (Burger)
  const [miId] = await db('MenuItems').insert({ Name: 'Inv Test Burger', GroupCode: 'Food', Barcode: 'INV01', Tag: null });
  const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 10.00 });
  testMenuItemId = miId;
  testPortionId = portionId;

  // Add tax template
  const [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
    Name: 'Inv Test Tax', SortOrder: 400,
    SourceAccountTypeId: 2, TargetAccountTypeId: 1,
    DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
  });
  const [ttId] = await db('TaxTemplates').insert({
    Name: 'Inv Test VAT', SortOrder: 50, Rate: 10.0, Rounding: 0,
    AccountTransactionTypeId: taxTxnTypeId,
  });
  await db('TaxTemplateMaps').insert({
    TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
    TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId,
  });

  // Get ingredients (seeded: Bread Bun, Beef Patty)
  testIngredientBread = await db('Ingredients').where({ Code: 'BREAD' }).first();
  testIngredientBeef = await db('Ingredients').where({ Code: 'BEEF' }).first();

  // Create a recipe: 1 Burger = 1 Bread + 1 Beef
  const unitId = await db('IngredientUnits').where({ Code: 'unit' }).first();
  const result = await inventoryService.saveRecipe(testPortionId, [
    { ingredientId: testIngredientBread.Id, quantity: 1, unitId: unitId.Id },
    { ingredientId: testIngredientBeef.Id, quantity: 1, unitId: unitId.Id },
  ], 0);
  testRecipeId = result.recipeId;

  // Record initial stock (100 units each, already seeded)
  // Verify stock exists
  const breadBalance = await inventoryService.getStockBalance(testIngredientBread.Id, testWarehouseId);
  const beefBalance = await inventoryService.getStockBalance(testIngredientBeef.Id, testWarehouseId);
  assert.ok(breadBalance, 'Bread stock balance should exist');
  assert.ok(beefBalance, 'Beef stock balance should exist');
}

async function createTicket() {
  const res = await request.post('/api/tickets')
    .set('Authorization', 'Bearer ' + jwtToken)
    .send({ departmentId: 1, ticketTypeId: 1 });
  return res.body.data.Id;
}

async function addOrder(ticketId, menuItemId, quantity = 1) {
  return request.post(`/api/tickets/${ticketId}/orders`)
    .set('Authorization', 'Bearer ' + jwtToken)
    .send({ menuItemId, quantity });
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

async function getStockQty(ingredientId) {
  const bal = await inventoryService.getStockBalance(ingredientId, testWarehouseId);
  return Number(bal?.Quantity || 0);
}

async function cleanup() {
  try {
    // Clean stock movements and balances for test ingredients
    await db('StockMovements').whereLike('Reference', '%Inv Test%').del();
    await db('StockMovements').whereLike('Notes', '%Inv Test Burger%').del();

    // Delete test recipe
    await db('RecipeItems').where({ RecipeId: testRecipeId }).del();
    await db('Recipes').where({ Id: testRecipeId }).del();

    // Delete test tickets
    const tickets = await db('Tickets').pluck('Id');
    if (tickets.length > 0) {
      await db('Orders').whereIn('TicketId', tickets).del();
      await db('Payments').whereIn('TicketId', tickets).del();
      await db('Calculations').whereIn('TicketId', tickets).del();
      await db('KitchenOrderItems').del();
      await db('KitchenOrders').whereIn('TicketId', tickets).del();
      await db('TicketEntities').whereIn('TicketId', tickets).del();
      await db('Tickets').whereIn('Id', tickets).del();
    }

    // Delete test menu items
    const mis = await db('MenuItems').whereLike('Name', 'Inv Test%').pluck('Id');
    for (const miId of mis) {
      const pIds = await db('MenuItemPortions').where({ MenuItemId: miId }).pluck('Id');
      if (pIds.length) await db('MenuItemPrices').whereIn('MenuItemPortionId', pIds).del();
      await db('MenuItemPortions').where({ MenuItemId: miId }).del();
    }
    await db('MenuItems').whereLike('Name', 'Inv Test%').del();
    await db('TaxTemplateMaps').whereLike('TaxTemplateId', db('TaxTemplates').whereLike('Name', 'Inv Test%').select('Id')).del();
    await db('TaxTemplates').whereLike('Name', 'Inv Test%').del();
    await db('AccountTransactionTypes').whereLike('Name', 'Inv Test%').del();
    await db('AuditLogs').whereLike('Action', 'inventory.%').del();
  } catch (err) {
    console.error('[cleanup]', err.message);
  }
  await db.destroy();
}

function authGet(path) { return request.get(path).set('Authorization', 'Bearer ' + jwtToken); }
function authPost(path, body) { return request.post(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }

// =====================================================================
// 1. RECIPE EXPLOSION
// =====================================================================

describe('1. Recipe Explosion', () => {
  test('1A: getRecipe returns recipe with items', async () => {
    const { recipe, items } = await inventoryService.getRecipe(testPortionId);
    assert.ok(recipe, 'Recipe should exist');
    assert.strictEqual(items.length, 2);
    assert.ok(items.find(i => i.IngredientName === 'Bread Bun'));
    assert.ok(items.find(i => i.IngredientName === 'Beef Patty'));
  });

  test('1B: Recipe without items returns empty array', async () => {
    // Create a menu item with no recipe
    const [miId] = await db('MenuItems').insert({ Name: 'Inv Test No Recipe', GroupCode: 'Food', Barcode: 'INV02', Tag: null });
    const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });

    const { recipe, items } = await inventoryService.getRecipe(portionId);
    assert.strictEqual(recipe, null);
    assert.strictEqual(items.length, 0);

    // Cleanup
    await db('MenuItemPortions').where({ Id: portionId }).del();
    await db('MenuItems').where({ Id: miId }).del();
  });
});

// =====================================================================
// 2. STOCK DEDUCTION ON TICKET CLOSE
// =====================================================================

describe('2. Stock Deduction on Close', () => {
  test('2A: Close ticket with 1 burger → deducts 1 bread + 1 beef', async () => {
    const breadBefore = await getStockQty(testIngredientBread.Id);
    const beefBefore = await getStockQty(testIngredientBeef.Id);

    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    await addPayment(ticketId, 10.00);
    await closeTicket(ticketId);

    const breadAfter = await getStockQty(testIngredientBread.Id);
    const beefAfter = await getStockQty(testIngredientBeef.Id);

    assert.strictEqual(breadAfter, breadBefore - 1, 'Bread should decrease by 1');
    assert.strictEqual(beefAfter, beefBefore - 1, 'Beef should decrease by 1');

    // Verify SALE movement was recorded
    const movements = await db('StockMovements')
      .where({ TicketId: ticketId, MovementType: 'SALE' });
    assert.strictEqual(movements.length, 2, 'Should have 2 SALE movements (bread + beef)');
  });

  test('2B: Close ticket with 3 burgers → deducts 3 bread + 3 beef', async () => {
    const breadBefore = await getStockQty(testIngredientBread.Id);
    const beefBefore = await getStockQty(testIngredientBeef.Id);

    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 3);
    await addPayment(ticketId, 30.00);
    await closeTicket(ticketId);

    const breadAfter = await getStockQty(testIngredientBread.Id);
    const beefAfter = await getStockQty(testIngredientBeef.Id);

    assert.strictEqual(breadAfter, breadBefore - 3, 'Bread should decrease by 3');
    assert.strictEqual(beefAfter, beefBefore - 3, 'Beef should decrease by 3');
  });
});

// =====================================================================
// 3. STOCK REVERSAL ON VOID
// =====================================================================

describe('3. Stock Reversal on Void', () => {
  test('3A: Void ticket → stock restored', async () => {
    const breadBefore = await getStockQty(testIngredientBread.Id);
    const beefBefore = await getStockQty(testIngredientBeef.Id);

    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 2);

    // Void the ticket BEFORE closing (stock hasn't been deducted yet on close,
    // but the SALE movements were created during addOrder? No — deduction
    // happens on close, not on addOrder. So void before close = no stock
    // movements to reverse. Let's test: void after close using refund instead.

    // Actually, void is for OPEN tickets. For CLOSED tickets, we use refund.
    // Let's test void on an open ticket (no stock deduction yet).
    // Then test that closing a voided ticket doesn't deduct stock.

    await voidTicket(ticketId);

    // Since the ticket was voided BEFORE close, no SALE movements were created.
    // Stock should be unchanged.
    const breadAfterVoid = await getStockQty(testIngredientBread.Id);
    const beefAfterVoid = await getStockQty(testIngredientBeef.Id);

    assert.strictEqual(breadAfterVoid, breadBefore, 'Bread should be unchanged (voided before close)');
    assert.strictEqual(beefAfterVoid, beefBefore, 'Beef should be unchanged (voided before close)');
  });

  test('3B: Refund closed ticket → stock restored', async () => {
    const breadBefore = await getStockQty(testIngredientBread.Id);
    const beefBefore = await getStockQty(testIngredientBeef.Id);

    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 2);
    await addPayment(ticketId, 20.00);
    await closeTicket(ticketId);

    // Verify stock was deducted
    const breadAfterClose = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(breadAfterClose, breadBefore - 2);

    // Refund the closed ticket
    const refundRes = await authPost(`/api/tickets/${ticketId}/refund`, { amount: 20.00, reason: 'Test refund' });
    assert.strictEqual(refundRes.status, 200);

    // Verify stock was restored (REVERSAL movements)
    const breadAfterRefund = await getStockQty(testIngredientBread.Id);
    const beefAfterRefund = await getStockQty(testIngredientBeef.Id);

    assert.strictEqual(breadAfterRefund, breadBefore, 'Bread should be restored after refund');
    assert.strictEqual(beefAfterRefund, beefBefore, 'Beef should be restored after refund');

    // Verify REVERSAL movements exist
    const reversals = await db('StockMovements')
      .where({ TicketId: ticketId, MovementType: 'REVERSAL' });
    assert.strictEqual(reversals.length, 2, 'Should have 2 REVERSAL movements');
  });
});

// =====================================================================
// 4. STOCK BALANCE CORRECTNESS
// =====================================================================

describe('4. Stock Balance Correctness', () => {
  test('4A: Balance = initial + sum(movements)', async () => {
    // Get all movements for bread
    const movements = await db('StockMovements')
      .where({ IngredientId: testIngredientBread.Id, WarehouseId: testWarehouseId });

    const balance = await inventoryService.getStockBalance(testIngredientBread.Id, testWarehouseId);

    // Sum all movements
    const calculatedQty = movements.reduce((sum, m) => sum + Number(m.Quantity), 0);

    // The balance should equal the initial seed (100) + sum of all movements
    // But since we seeded StockBalances with 100 and also recorded initial stock,
    // we need to check that balance = 100 + sum(movements) - but initial seed
    // didn't create a movement. So balance = 100 + sum(movements).
    assert.strictEqual(Number(balance.Quantity), 100 + calculatedQty,
      'Balance should equal initial seed (100) + sum of all movements');
  });
});

// =====================================================================
// 5. MANUAL MOVEMENTS
// =====================================================================

describe('5. Manual Movements', () => {
  test('5A: PURCHASE movement increases stock', async () => {
    const before = await getStockQty(testIngredientBread.Id);
    const unitId = testIngredientBread.BaseUnitId;

    await inventoryService.recordMovement({
      ingredientId: testIngredientBread.Id,
      warehouseId: testWarehouseId,
      unitId,
      movementType: MOVEMENT_TYPES.PURCHASE,
      quantity: 50,
      unitCost: 0.35,
      supplierId: null,
      reference: 'Test Purchase',
      notes: 'Restocking bread',
      userId: 1,
    });

    const after = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(after, before + 50, 'Stock should increase by 50');
  });

  test('5B: WASTE movement decreases stock', async () => {
    const before = await getStockQty(testIngredientBread.Id);
    const unitId = testIngredientBread.BaseUnitId;

    await inventoryService.recordMovement({
      ingredientId: testIngredientBread.Id,
      warehouseId: testWarehouseId,
      unitId,
      movementType: MOVEMENT_TYPES.WASTE,
      quantity: -5,
      unitCost: 0.30,
      reference: 'Test Waste',
      notes: 'Expired bread',
      userId: 1,
    });

    const after = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(after, before - 5, 'Stock should decrease by 5');
  });

  test('5C: ADJUSTMENT movement can be positive or negative', async () => {
    const before = await getStockQty(testIngredientBread.Id);
    const unitId = testIngredientBread.BaseUnitId;

    // Positive adjustment (found extra stock)
    await inventoryService.recordMovement({
      ingredientId: testIngredientBread.Id,
      warehouseId: testWarehouseId,
      unitId,
      movementType: MOVEMENT_TYPES.ADJUSTMENT,
      quantity: 3,
      unitCost: 0,
      reference: 'Stock count adjustment +3',
      userId: 1,
    });

    const afterPositive = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(afterPositive, before + 3);

    // Negative adjustment (missing stock)
    await inventoryService.recordMovement({
      ingredientId: testIngredientBread.Id,
      warehouseId: testWarehouseId,
      unitId,
      movementType: MOVEMENT_TYPES.ADJUSTMENT,
      quantity: -2,
      unitCost: 0,
      reference: 'Stock count adjustment -2',
      userId: 1,
    });

    const afterNegative = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(afterNegative, before + 3 - 2, 'Should be before + 3 - 2');
  });
});

// =====================================================================
// 6. LOW STOCK ALERTS
// =====================================================================

describe('6. Low Stock Alerts', () => {
  test('6A: Ingredients below minimum stock are returned', async () => {
    // Set bread to below minimum (minimum is 10)
    const unitId = testIngredientBread.BaseUnitId;
    const currentBalance = await inventoryService.getStockBalance(testIngredientBread.Id, testWarehouseId);
    const currentQty = Number(currentBalance.Quantity);

    // Waste enough to go below 10
    const toWaste = currentQty - 5;  // bring it to 5 (below minimum of 10)
    if (toWaste > 0) {
      await inventoryService.recordMovement({
        ingredientId: testIngredientBread.Id,
        warehouseId: testWarehouseId,
        unitId,
        movementType: MOVEMENT_TYPES.WASTE,
        quantity: -toWaste,
        reference: 'Test: bring below minimum',
        userId: 1,
      });
    }

    const alerts = await inventoryService.getLowStockAlerts(testWarehouseId);
    const breadAlert = alerts.find(a => a.Id === testIngredientBread.Id);
    assert.ok(breadAlert, 'Bread should be in low stock alerts');
    assert.ok(Number(breadAlert.Quantity) <= Number(breadAlert.MinimumStock),
      'Quantity should be <= MinimumStock');
  });
});

// =====================================================================
// 7. IDEMPOTENCY — CLOSE TWICE DOESN'T DOUBLE-DEDUCT
// =====================================================================

describe('7. Idempotency', () => {
  test('7A: Closing a ticket twice does not double-deduct stock', async () => {
    const breadBefore = await getStockQty(testIngredientBread.Id);

    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);
    await addPayment(ticketId, 10.00);
    await closeTicket(ticketId);

    const breadAfterFirstClose = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(breadAfterFirstClose, breadBefore - 1);

    // Try to close again — should fail (already closed)
    const secondClose = await closeTicket(ticketId);
    assert.strictEqual(secondClose.status, 409);  // Conflict

    // Stock should NOT have changed
    const breadAfterSecondClose = await getStockQty(testIngredientBread.Id);
    assert.strictEqual(breadAfterSecondClose, breadAfterFirstClose,
      'Stock should not change on failed second close');
  });
});

// =====================================================================
// 8. GIFTED ORDERS DON'T DEDUCT STOCK
// =====================================================================

describe('8. Gifted Orders', () => {
  test('8A: Gifted order (CalculatePrice=false) does not deduct stock', async () => {
    const breadBefore = await getStockQty(testIngredientBread.Id);
    const beefBefore = await getStockQty(testIngredientBeef.Id);

    const ticketId = await createTicket();
    await addOrder(ticketId, testMenuItemId, 1);

    // Gift the order (CalculatePrice=false)
    const orders = await db('Orders').where({ TicketId: ticketId });
    await db('Orders').where({ Id: orders[0].Id }).update({ CalculatePrice: 0 });

    await addPayment(ticketId, 0.01);  // pay 1 cent to close
    await closeTicket(ticketId);

    const breadAfter = await getStockQty(testIngredientBread.Id);
    const beefAfter = await getStockQty(testIngredientBeef.Id);

    assert.strictEqual(breadAfter, breadBefore, 'Bread should NOT decrease (order was gifted)');
    assert.strictEqual(beefAfter, beefBefore, 'Beef should NOT decrease (order was gifted)');
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
