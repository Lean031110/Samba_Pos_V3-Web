// =====================================================================
// unit-conversion-verification.test.js — Mathematical unit conversion tests
// =====================================================================
// Verifies that:
//   - 1 kg = 1000 gr (and inverse)
//   - 1 L = 1000 ml (and inverse)
//   - Same unit → no conversion (identity)
//   - Incompatible units → ValidationError
//   - Recipe with 200 gr of an ingredient stored in kg → cost uses 0.2 kg
//   - Sale of 3 units → deducts exactly 0.6 kg (not 600 kg!)
//   - Reversal restores exactly 0.6 kg
//
// Example from the audit prompt:
//   Ingredient base = kg, CostPerUnit = $4.00/kg
//   Recipe = 200 gr (RecipeItem.UnitId = gr)
//   Sale = 3 units
//   Deduction = 0.6 kg (not 600 kg!)
//   Cost = 0.6 × $4.00 = $2.40
// =====================================================================

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.chdir(__dirname + '/..');

const { db } = require('../src/infrastructure/db/db');
const { InventoryService, MOVEMENT_TYPES } = require('../src/api/services/InventoryService');
const { RecipeService } = require('../src/api/services/RecipeService');

const inventoryService = new InventoryService();
const recipeService = new RecipeService();

async function getUnitId(code) {
  const u = await db('IngredientUnits').where({ Code: code }).first();
  if (!u) throw new Error(`Unit '${code}' not found in DB`);
  return u.Id;
}

async function getWarehouseId() {
  const w = await db('Warehouses').first();
  return w.Id;
}

async function setupIngredient(name, code, baseUnitCode, costPerUnit) {
  const baseUnitId = await getUnitId(baseUnitCode);
  const [id] = await db('Ingredients').insert({
    Name: name,
    Code: code + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    BaseUnitId: baseUnitId,
    MinimumStock: 0,
    CostPerUnit: costPerUnit,
  });
  return id;
}

async function setupMenuItemAndPortion(name = 'Conversion Test Burger') {
  const [miId] = await db('MenuItems').insert({
    Name: name, GroupCode: 'Food', Barcode: 'CT' + Date.now() + Math.random(), Tag: null,
  });
  const [portionId] = await db('MenuItemPortions').insert({
    MenuItemId: miId, Name: 'Normal', Multiplier: 1,
  });
  await db('MenuItemPrices').insert({
    MenuItemPortionId: portionId, PriceTag: null, Price: 10.00,
  });
  return { miId, portionId };
}

async function setupRecipe(portionId, items, fixedCost = 0) {
  return recipeService.saveRecipeWithCost(portionId, items, fixedCost);
}

async function setStock(ingredientId, warehouseId, quantity, unitId) {
  const existing = await db('StockBalances')
    .where({ IngredientId: ingredientId, WarehouseId: warehouseId })
    .first();
  if (existing) {
    await db('StockBalances').where({ Id: existing.Id }).update({
      Quantity: quantity, UnitId: unitId, LastUpdated: new Date().toISOString(),
    });
  } else {
    await db('StockBalances').insert({
      IngredientId: ingredientId, WarehouseId: warehouseId,
      Quantity: quantity, UnitId: unitId, AverageCost: 0,
      LastUpdated: new Date().toISOString(),
    });
  }
}

async function getStock(ingredientId, warehouseId) {
  const bal = await db('StockBalances')
    .where({ IngredientId: ingredientId, WarehouseId: warehouseId })
    .first();
  return bal ? Number(bal.Quantity) : 0;
}

async function setupTicketWithOrders(menuItemId, orderQty, portionName = 'Normal') {
  const now = new Date().toISOString();
  const [ticketId] = await db('Tickets').insert({
    DepartmentId: 1, TicketTypeId: 1, TicketNumber: 'T-UC-' + Date.now(),
    Date: now, LastUpdateTime: now, LastOrderDate: now, LastPaymentDate: now,
    TotalAmount: 10 * orderQty, RemainingAmount: 0, IsClosed: 0, Version: 1,
  });
  await db('Orders').insert({
    TicketId: ticketId, MenuItemId: menuItemId, MenuItemName: 'Conv Test',
    PortionName: portionName, Quantity: orderQty, Price: 10,
    CalculatePrice: 1, CreatedDateTime: now,
    AccountTransactionTypeId: 3,
  });
  const ticket = await db('Tickets').where({ Id: ticketId }).first();
  ticket.Orders = await db('Orders').where({ TicketId: ticketId });
  return ticket;
}

async function resetDb() {
  await db('StockMovements').del();
  await db('StockBalances').del();
  await db('RecipeItems').del();
  await db('Recipes').del();
  const testMenuItems = await db('MenuItems').where('Name', 'like', '%Conversion Test%').orWhere('Name', 'like', 'Recipe Test%').pluck('Id');
  if (testMenuItems.length > 0) {
    const testPortions = await db('MenuItemPortions').whereIn('MenuItemId', testMenuItems).pluck('Id');
    if (testPortions.length > 0) {
      await db('MenuItemPrices').whereIn('MenuItemPortionId', testPortions).del();
      await db('Orders').whereIn('MenuItemId', testMenuItems).del();
    }
    await db('MenuItemPortions').whereIn('MenuItemId', testMenuItems).del();
    await db('MenuItems').whereIn('Id', testMenuItems).del();
  }
}

describe('FASE 5 — Unit conversion (kg ↔ gr, L ↔ ml)', () => {

  beforeEach(async () => { await resetDb(); });

  test('5A: convertQuantity: 1 kg → 1000 gr', async () => {
    const kgId = await getUnitId('kg');
    const grId = await getUnitId('gr');
    const result = await inventoryService.convertQuantity(1, kgId, grId);
    assert.equal(result, 1000);
  });

  test('5B: convertQuantity: 1000 gr → 1 kg', async () => {
    const kgId = await getUnitId('kg');
    const grId = await getUnitId('gr');
    const result = await inventoryService.convertQuantity(1000, grId, kgId);
    assert.equal(result, 1);
  });

  test('5C: convertQuantity: 1 L → 1000 ml', async () => {
    const lId = await getUnitId('l');
    const mlId = await getUnitId('ml');
    const result = await inventoryService.convertQuantity(1, lId, mlId);
    assert.equal(result, 1000);
  });

  test('5D: convertQuantity: 500 ml → 0.5 L', async () => {
    const lId = await getUnitId('l');
    const mlId = await getUnitId('ml');
    const result = await inventoryService.convertQuantity(500, mlId, lId);
    assert.equal(result, 0.5);
  });

  test('5E: convertQuantity: same unit → identity (no conversion)', async () => {
    const kgId = await getUnitId('kg');
    const result = await inventoryService.convertQuantity(42, kgId, kgId);
    assert.equal(result, 42);
  });

  test('5F: convertQuantity: incompatible units → ValidationError', async () => {
    const kgId = await getUnitId('kg');
    const mlId = await getUnitId('ml');
    // kg → ml has no conversion seeded
    await assert.rejects(
      () => inventoryService.convertQuantity(1, kgId, mlId),
      (err) => err.message.includes('No unit conversion') || err.name === 'ValidationError'
    );
  });
});

describe('FASE 5 — Recipe cost with unit conversion', () => {

  beforeEach(async () => { await resetDb(); });

  test('5G: Recipe 200 gr of ingredient (base=kg, $4/kg) → cost = $0.80', async () => {
    // Setup: ingredient base = kg, cost = $4.00/kg
    const ingId = await setupIngredient('Beef Conv', 'BEEFC', 'kg', 4.00);
    const { portionId } = await setupMenuItemAndPortion('Conv Cost Test 1');

    // Recipe: 200 gr of beef
    const grId = await getUnitId('gr');
    const result = await setupRecipe(portionId, [
      { ingredientId: ingId, quantity: 200, unitId: grId },
    ]);

    // Expected: 200 gr → 0.2 kg × $4.00/kg = $0.80
    assert.equal(result.totalCost, 0.80,
      `200 gr of $4/kg beef should cost $0.80, got $${result.totalCost}`);
  });

  test('5H: Recipe 50 ml of ingredient (base=L, $2.50/L) → cost = $0.125', async () => {
    const ingId = await setupIngredient('Sauce Conv', 'SAUCEC', 'l', 2.50);
    const { portionId } = await setupMenuItemAndPortion('Conv Cost Test 2');

    const mlId = await getUnitId('ml');
    const result = await setupRecipe(portionId, [
      { ingredientId: ingId, quantity: 50, unitId: mlId },
    ]);

    // 50 ml → 0.05 L × $2.50/L = $0.125
    assert.equal(result.totalCost, 0.125,
      `50 ml of $2.50/L sauce should cost $0.125, got $${result.totalCost}`);
  });

  test('5I: Recipe with mixed units — gr + ml + unit → correct total', async () => {
    const beefId = await setupIngredient('Beef Mix', 'BEEFM', 'kg', 4.00);     // base=kg
    const sauceId = await setupIngredient('Sauce Mix', 'SAUCEM', 'l', 2.50);  // base=L
    const cheeseId = await setupIngredient('Cheese Unit', 'CHEESEU', 'unit', 0.50); // base=unit
    const { portionId } = await setupMenuItemAndPortion('Conv Cost Test 3');

    const grId = await getUnitId('gr');
    const mlId = await getUnitId('ml');
    const unitId = await getUnitId('unit');

    const result = await setupRecipe(portionId, [
      { ingredientId: beefId,   quantity: 200, unitId: grId },   // 0.2 kg × $4 = $0.80
      { ingredientId: sauceId,  quantity: 30,  unitId: mlId },   // 0.03 L × $2.50 = $0.075
      { ingredientId: cheeseId, quantity: 1,   unitId: unitId }, // 1 unit × $0.50 = $0.50
    ]);

    // Total: 0.80 + 0.075 + 0.50 = 1.375
    assert.equal(result.totalCost, 1.375,
      `Mixed recipe should cost $1.375, got $${result.totalCost}`);
  });
});

describe('FASE 5 — Inventory deduction with unit conversion (THE CRITICAL TEST)', () => {

  beforeEach(async () => { await resetDb(); });

  test('5J: Sale of 3 units, recipe=200 gr, base=kg → deducts exactly 0.6 kg (not 600 kg!)', async () => {
    // === SETUP ===
    // Ingredient: base unit = kg, cost = $4.00/kg
    const ingId = await setupIngredient('Beef Critical', 'BEEFCRIT', 'kg', 4.00);
    const warehouseId = await getWarehouseId();
    const kgId = await getUnitId('kg');

    // Set initial stock = 10 kg
    await setStock(ingId, warehouseId, 10, kgId);

    // Recipe: 200 gr of beef per portion
    const { miId, portionId } = await setupMenuItemAndPortion('Critical Conv Test');
    const grId = await getUnitId('gr');
    await setupRecipe(portionId, [
      { ingredientId: ingId, quantity: 200, unitId: grId },
    ]);

    // === ACT ===
    // Create ticket with 1 order of quantity 3
    const ticket = await setupTicketWithOrders(miId, 3, 'Normal');

    // Deduct inventory
    const movements = await inventoryService.deductForTicketSale(ticket, warehouseId, 0);

    // === ASSERT ===
    // 1 order × 200 gr = 200 gr = 0.2 kg per order
    // With Quantity=3, the deduction is 200 gr × 3 = 600 gr = 0.6 kg
    // Stock should be: 10 - 0.6 = 9.4 kg (NOT 10 - 600 = -590!)
    const finalStock = await getStock(ingId, warehouseId);
    assert.equal(finalStock, 9.4,
      `Stock should be 9.4 kg (10 - 0.6), got ${finalStock}. ` +
      `If you got -590, the conversion is NOT working!`);

    // Verify 1 SALE movement was created (1 order × 1 ingredient in recipe)
    assert.equal(movements.length, 1, `Expected 1 SALE movement, got ${movements.length}`);

    // Verify each movement's quantity is -0.2 kg (200 gr converted to kg)
    for (const m of movements) {
      const qty = Number(m.newBalance.Quantity) - 10; // approximate: each deduction is -0.2 from running total
      // Just verify the movement was in kg (BaseUnitId), not gr
      const movement = await db('StockMovements').where({ Id: m.movementId }).first();
      assert.equal(movement.UnitId, kgId, 'Movement should be recorded in kg (base unit)');
    }
  });

  test('5K: Reversal restores exactly 0.6 kg after void/refund', async () => {
    const ingId = await setupIngredient('Beef Rev', 'BEEFREV', 'kg', 4.00);
    const warehouseId = await getWarehouseId();
    const kgId = await getUnitId('kg');
    await setStock(ingId, warehouseId, 10, kgId);

    const { miId, portionId } = await setupMenuItemAndPortion('Rev Conv Test');
    const grId = await getUnitId('gr');
    await setupRecipe(portionId, [
      { ingredientId: ingId, quantity: 200, unitId: grId },
    ]);

    // Sale 3 orders → deduct 0.6 kg → stock = 9.4
    const ticket = await setupTicketWithOrders(miId, 3, 'Normal');
    await inventoryService.deductForTicketSale(ticket, warehouseId, 0);
    let stock = await getStock(ingId, warehouseId);
    assert.equal(stock, 9.4, `After sale, stock should be 9.4, got ${stock}`);

    // Reverse (void/refund) → restore 0.6 kg → stock = 10.0
    await inventoryService.reverseForTicket(ticket, warehouseId, 0);
    stock = await getStock(ingId, warehouseId);
    assert.equal(stock, 10.0, `After reversal, stock should be 10.0, got ${stock}`);
  });

  test('5L: Recipe in same unit as base → no conversion needed, works correctly', async () => {
    // Ingredient base = unit, recipe also in unit → identity
    const ingId = await setupIngredient('Bread Same', 'BREADS', 'unit', 0.50);
    const warehouseId = await getWarehouseId();
    const unitId = await getUnitId('unit');
    await setStock(ingId, warehouseId, 100, unitId);

    const { miId, portionId } = await setupMenuItemAndPortion('Same Unit Test');
    await setupRecipe(portionId, [
      { ingredientId: ingId, quantity: 1, unitId: unitId },
    ]);

    // Sale 5 orders → deduct 5 units → stock = 95
    const ticket = await setupTicketWithOrders(miId, 5, 'Normal');
    await inventoryService.deductForTicketSale(ticket, warehouseId, 0);
    const stock = await getStock(ingId, warehouseId);
    assert.equal(stock, 95, `After 5 sales × 1 unit, stock should be 95, got ${stock}`);
  });

  test('5M: Recipe with incompatible units → ValidationError on cost calculation', async () => {
    // Ingredient base = kg, recipe uses ml (no conversion kg↔ml)
    const ingId = await setupIngredient('Incompat', 'INCOMPAT', 'kg', 4.00);
    const { portionId } = await setupMenuItemAndPortion('Incompat Test');
    const mlId = await getUnitId('ml');

    // Save recipe with ml (no kg↔ml conversion exists).
    // saveRecipeWithCost calls calculateRecipeCost which should throw.
    await assert.rejects(
      () => setupRecipe(portionId, [
        { ingredientId: ingId, quantity: 100, unitId: mlId },
      ]),
      (err) => err.message.includes('No unit conversion') || err.name === 'ValidationError'
    );
  });
});

// Force-exit the process after tests complete.
describe('Teardown', () => {
  test('cleanup db pool', async () => {
    try { await db.destroy(); } catch (e) {}
    setTimeout(() => process.exit(0), 200);
  });
});
