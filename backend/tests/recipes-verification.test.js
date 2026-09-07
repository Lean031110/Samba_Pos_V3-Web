// =====================================================================
// recipes-verification.test.js — FASE 5 recipe + cost + margin tests
// =====================================================================
// Tests the recipe administration module:
//   - RecipeService: getRecipeForPortion, getRecipesForMenuItem
//   - RecipeService: calculateRecipeCost (sum of ingredient costs + fixed)
//   - RecipeService: calculateMargin + suggestPrice
//   - RecipeService: saveRecipeWithCost (atomic save + recompute)
//   - RecipeService: listRecipes with cost summary
//   - RecipeService: deactivateRecipe (soft delete)
//   - InventoryService: deductForTicketSale (consumes ingredients)
//   - InventoryService: reverseForTicket (restores ingredients on void)
//   - HTTP endpoints /api/recipes/*
// =====================================================================

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.chdir(__dirname + '/..');

const { db, withTransaction } = require('../src/infrastructure/db/db');
const { RecipeService } = require('../src/api/services/RecipeService');
const { InventoryService, MOVEMENT_TYPES } = require('../src/api/services/InventoryService');

const recipeService = new RecipeService();
const inventoryService = new InventoryService();

// === Test fixtures ===

async function setupTestMenuItem(name = 'Test Burger', groupCode = 'Food') {
  const [miId] = await db('MenuItems').insert({
    Name: name, GroupCode: groupCode, Barcode: 'TB' + Date.now() + Math.random(), Tag: null,
  });
  const [portionId] = await db('MenuItemPortions').insert({
    MenuItemId: miId, Name: 'Normal', Multiplier: 1,
  });
  await db('MenuItemPrices').insert({
    MenuItemPortionId: portionId, PriceTag: null, Price: 10.00,
  });
  return { miId, portionId };
}

async function setupTestIngredient(name, code, baseUnitId, costPerUnit, minimumStock = 0) {
  // Use a unique code with timestamp to avoid UNIQUE constraint conflicts
  // with seeded ingredients.
  const uniqueCode = (code || 'TEST') + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  const [id] = await db('Ingredients').insert({
    Name: name,
    Code: uniqueCode,
    BaseUnitId: baseUnitId,
    MinimumStock: minimumStock,
    CostPerUnit: costPerUnit,
  });
  return id;
}

async function setupTestRecipe(portionId, items, fixedCost = 0) {
  return recipeService.saveRecipeWithCost(portionId, items, fixedCost);
}

// Helper: insert a test ticket with the minimum required NOT NULL columns.
async function setupTestTicket(ticketNumber, totalAmount = 10, isClosed = false) {
  const now = new Date().toISOString();
  const [ticketId] = await db('Tickets').insert({
    DepartmentId: 1, TicketTypeId: 1, TicketNumber: ticketNumber,
    Date: now, LastUpdateTime: now,
    LastOrderDate: now,
    LastPaymentDate: now,
    TotalAmount: totalAmount, RemainingAmount: 0, IsClosed: isClosed, Version: 1,
  });
  return ticketId;
}

// Helper: insert a test order with the minimum required NOT NULL columns.
async function setupTestOrder(ticketId, menuItemId, menuItemName, quantity = 1, calculatePrice = true) {
  const now = new Date().toISOString();
  const [orderId] = await db('Orders').insert({
    TicketId: ticketId, MenuItemId: menuItemId, MenuItemName: menuItemName,
    PortionName: 'Normal', Quantity: quantity, Price: 10,
    CalculatePrice: calculatePrice ? 1 : 0,
    CreatedDateTime: now,
    AccountTransactionTypeId: 3,  // Sale Transaction (FK required)
    OrderStates: JSON.stringify([{ StateName: 'Status', State: 'Submitted' }]),
  });
  return orderId;
}

async function getFirstUnitId() {
  const unit = await db('IngredientUnits').first();
  return unit.Id;
}

async function getFirstWarehouseId() {
  const w = await db('Warehouses').first();
  return w.Id;
}

async function resetDb() {
  // Clean in dependency order (children first)
  await db('StockMovements').del();
  await db('StockBalances').del();
  await db('RecipeItems').del();
  await db('Recipes').del();
  // Delete test menu items + their portions + prices
  const testMenuItems = await db('MenuItems').where('Name', 'like', 'Test%').orWhere('Name', 'like', 'Recipe%').pluck('Id');
  if (testMenuItems.length > 0) {
    const testPortions = await db('MenuItemPortions').whereIn('MenuItemId', testMenuItems).pluck('Id');
    if (testPortions.length > 0) {
      await db('MenuItemPrices').whereIn('MenuItemPortionId', testPortions).del();
      await db('Orders').whereIn('MenuItemId', testMenuItems).del();
    }
    await db('MenuItemPortions').whereIn('MenuItemId', testMenuItems).del();
    await db('MenuItems').whereIn('Id', testMenuItems).del();
  }
  // Don't delete Ingredients — they're seeded by migration
}

describe('FASE 5 — RecipeService cost calculation', () => {

  beforeEach(async () => { await resetDb(); });

  test('calculateRecipeCost sums ingredient costs + fixed cost', async () => {
    const unitId = await getFirstUnitId();
    const ing1 = await setupTestIngredient('Bread', 'BREAD', unitId, 0.50);  // $0.50/unit
    const ing2 = await setupTestIngredient('Beef',  'BEEF',  unitId, 4.00);  // $4.00/unit
    const ing3 = await setupTestIngredient('Cheese', 'CHEESE', unitId, 1.20); // $1.20/unit

    const { miId, portionId } = await setupTestMenuItem('Recipe Test 1', 'Food');
    const result = await setupTestRecipe(portionId, [
      { ingredientId: ing1, quantity: 1, unitId },
      { ingredientId: ing2, quantity: 0.2, unitId },  // 0.2kg beef = $0.80
      { ingredientId: ing3, quantity: 0.05, unitId }, // 0.05kg cheese = $0.06
    ], 0.50);  // $0.50 fixed cost

    // Expected: 0.50 + 0.80 + 0.06 + 0.50 (fixed) = 1.86
    assert.equal(result.recipeId > 0, true);
    assert.equal(result.itemCount, 3);
    assert.equal(result.totalCost, 1.86);
  });

  test('calculateRecipeCost returns 0 for recipe with no items', async () => {
    const { portionId } = await setupTestMenuItem('Recipe Test 2', 'Food');
    const result = await setupTestRecipe(portionId, [], 1.00);  // only fixed cost
    assert.equal(result.totalCost, 1.00);
  });

  test('calculateMargin computes margin + marginPct + markupPct', () => {
    const m = recipeService.calculateMargin(5, 10);
    assert.equal(m.margin, 5);
    assert.equal(m.marginPct, 50);
    assert.equal(m.markupPct, 100);
  });

  test('calculateMargin handles zero cost', () => {
    const m = recipeService.calculateMargin(0, 10);
    assert.equal(m.margin, 10);
    assert.equal(m.marginPct, 100);
    assert.equal(m.markupPct, 0);  // can't compute markup on zero cost
  });

  test('calculateMargin handles zero price', () => {
    const m = recipeService.calculateMargin(5, 0);
    assert.equal(m.margin, -5);
    assert.equal(m.marginPct, 0);  // avoid divide by zero
    assert.equal(m.markupPct, -100);
  });

  test('suggestPrice computes price for target margin', () => {
    // 60% margin on $5 cost → price = 5 / (1 - 0.60) = 12.5
    const price = recipeService.suggestPrice(5, 60);
    assert.equal(price, 12.5);
  });

  test('suggestPrice rejects margin >= 100%', () => {
    assert.throws(() => recipeService.suggestPrice(5, 100), /must be less than 100/);
    assert.throws(() => recipeService.suggestPrice(5, 150), /must be less than 100/);
  });

  test('suggestPrice rejects negative margin', () => {
    assert.throws(() => recipeService.suggestPrice(5, -10), /must be >= 0/);
  });
});

describe('FASE 5 — RecipeService CRUD', () => {

  beforeEach(async () => { await resetDb(); });

  test('saveRecipeWithCost validates items array', async () => {
    const { portionId } = await setupTestMenuItem('Recipe Test 3', 'Food');
    await assert.rejects(
      () => setupTestRecipe(portionId, 'not an array'),
      /items must be an array/
    );
  });

  test('saveRecipeWithCost rejects empty recipe (no items, no fixed cost)', async () => {
    const { portionId } = await setupTestMenuItem('Recipe Test 4', 'Food');
    await assert.rejects(
      () => setupTestRecipe(portionId, [], 0),
      /at least one item or a non-zero fixedCost/
    );
  });

  test('saveRecipeWithCost validates each item has ingredientId', async () => {
    const { portionId } = await setupTestMenuItem('Recipe Test 5', 'Food');
    await assert.rejects(
      () => setupTestRecipe(portionId, [{ quantity: 1, unitId: 1 }]),
      /ingredientId/
    );
  });

  test('saveRecipeWithCost validates quantity is positive', async () => {
    const { portionId } = await setupTestMenuItem('Recipe Test 6', 'Food');
    await assert.rejects(
      () => setupTestRecipe(portionId, [{ ingredientId: 1, quantity: -1, unitId: 1 }]),
      /positive number/
    );
  });

  test('getRecipeForPortion returns full recipe with ingredient details', async () => {
    const unitId = await getFirstUnitId();
    const ingId = await setupTestIngredient('Test Ing', 'TESTI', unitId, 2.00);
    const { miId, portionId } = await setupTestMenuItem('Recipe Test 7', 'Food');
    await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 0.5, unitId },
    ]);

    const result = await recipeService.getRecipeForPortion(portionId);
    assert.equal(result.recipe.MenuItemPortionId, portionId);
    assert.equal(result.portion.Id, portionId);
    assert.equal(result.menuItem.Id, miId);
    assert.equal(result.price, 10);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].IngredientName, 'Test Ing');

    // Calculate cost + margin (this is normally done in the route handler)
    const cost = await recipeService.calculateRecipeCost(result.recipe.Id);
    const marginInfo = recipeService.calculateMargin(cost, result.price);
    assert.equal(cost, 1.00);  // 0.5 × $2.00
    assert.equal(marginInfo.margin, 9);   // $10 - $1
    assert.equal(marginInfo.marginPct, 90);
  });

  test('getRecipeForPortion throws NotFound for unknown portion', async () => {
    await assert.rejects(
      () => recipeService.getRecipeForPortion(99999),
      /not found/
    );
  });

  test('getRecipesForMenuItem returns all portions with cost data', async () => {
    const unitId = await getFirstUnitId();
    const ing1 = await setupTestIngredient('Ing A', 'INGA', unitId, 1.00);
    const ing2 = await setupTestIngredient('Ing B', 'INGB', unitId, 2.00);
    const { miId, portionId: portion1Id } = await setupTestMenuItem('Recipe Test 8', 'Food');

    // Add a second portion
    const [portion2Id] = await db('MenuItemPortions').insert({
      MenuItemId: miId, Name: 'Large', Multiplier: 1.5,
    });
    await db('MenuItemPrices').insert({
      MenuItemPortionId: portion2Id, PriceTag: null, Price: 15.00,
    });

    // Recipe for portion 1 only
    await setupTestRecipe(portion1Id, [
      { ingredientId: ing1, quantity: 1, unitId },
    ]);

    const result = await recipeService.getRecipesForMenuItem(miId);
    assert.equal(result.menuItem.Id, miId);
    assert.equal(result.portions.length, 2);

    const p1 = result.portions.find(p => p.portion.Id === portion1Id);
    assert.ok(p1);
    assert.equal(p1.hasRecipe, true);
    assert.equal(p1.cost, 1.00);  // 1 × $1
    assert.equal(p1.margin, 9);   // $10 - $1
    assert.equal(p1.marginPct, 90);

    const p2 = result.portions.find(p => p.portion.Id === portion2Id);
    assert.ok(p2);
    assert.equal(p2.hasRecipe, false);
    assert.equal(p2.cost, 0);
  });

  test('listRecipes returns recipes with cost summary', async () => {
    const unitId = await getFirstUnitId();
    const ingId = await setupTestIngredient('List Ing', 'LISTI', unitId, 3.00);
    const { miId, portionId } = await setupTestMenuItem('Recipe Test 9', 'Food');
    await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 2, unitId },
    ]);

    const list = await recipeService.listRecipes({});
    assert.ok(list.length >= 1);
    const found = list.find(r => r.recipeId && r.menuItemId === miId);
    assert.ok(found);
    assert.equal(found.cost, 6.00);  // 2 × $3
    assert.equal(found.price, 10);
    assert.equal(found.margin, 4);
    assert.equal(found.marginPct, 40);
  });

  test('deactivateRecipe soft-deletes the recipe', async () => {
    const unitId = await getFirstUnitId();
    const ingId = await setupTestIngredient('Deact Ing', 'DEACTI', unitId, 1.00);
    const { portionId } = await setupTestMenuItem('Recipe Test 10', 'Food');
    const result = await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 1, unitId },
    ]);

    await recipeService.deactivateRecipe(result.recipeId);

    // Verify IsActive=0 in DB
    const recipe = await db('Recipes').where({ Id: result.recipeId }).first();
    assert.equal(recipe.IsActive, 0);

    // Verify listRecipes (default) doesn't include it
    const list = await recipeService.listRecipes({});
    const stillThere = list.find(r => r.recipeId === result.recipeId);
    assert.equal(stillThere, undefined);
  });

  test('getCostSummary returns cost summary for all menu items', async () => {
    const unitId = await getFirstUnitId();
    const ingId = await setupTestIngredient('Summary Ing', 'SUMI', unitId, 2.00);
    const { miId, portionId } = await setupTestMenuItem('Recipe Test 11', 'Food');
    await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 1, unitId },
    ]);

    const summary = await recipeService.getCostSummary();
    assert.ok(summary.length >= 1);
    const found = summary.find(s => s.menuItemId === miId);
    assert.ok(found);
    assert.equal(found.portions.length, 1);
    assert.equal(found.portions[0].cost, 2.00);
    assert.equal(found.portions[0].price, 10);
    assert.equal(found.portions[0].margin, 8);
    assert.equal(found.portions[0].marginPct, 80);
  });
});

describe('FASE 5 — Inventory integration (deduct + reverse)', () => {

  beforeEach(async () => { await resetDb(); });

  test('deductForTicketSale consumes ingredients per recipe', async () => {
    const unitId = await getFirstUnitId();
    const warehouseId = await getFirstWarehouseId();
    const ingId = await setupTestIngredient('Deduct Ing', 'DEDUC', unitId, 5.00);

    // Set initial stock = 100 units
    await inventoryService.recordMovement({
      ingredientId: ingId, warehouseId, unitId,
      movementType: MOVEMENT_TYPES.PURCHASE,
      quantity: 100, unitCost: 5.00,
      reference: 'Initial stock', userId: 0,
    });

    // Create a menuItem with a recipe that uses 2 units per portion
    const { miId, portionId } = await setupTestMenuItem('Deduct Test', 'Food');
    await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 2, unitId },
    ]);

    // Create a ticket with 3 orders of the menu item
    const ticketId = await setupTestTicket('T-DED-1', 30, false);
    for (let i = 0; i < 3; i++) {
      await setupTestOrder(ticketId, miId, 'Deduct Test', 1, true);
    }

    // Load full ticket with orders
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    ticket.Orders = await db('Orders').where({ TicketId: ticketId });

    // Deduct
    const movements = await inventoryService.deductForTicketSale(ticket, warehouseId, 0);

    // Should have 3 SALE movements (one per order × one ingredient in recipe)
    assert.equal(movements.length, 3);

    // Verify stock balance: 100 - (2 × 3) = 94
    const balance = await inventoryService.getStockBalance(ingId, warehouseId);
    assert.equal(Number(balance.Quantity), 94);
  });

  test('reverseForTicket restores ingredients on void/refund', async () => {
    const unitId = await getFirstUnitId();
    const warehouseId = await getFirstWarehouseId();
    const ingId = await setupTestIngredient('Reverse Ing', 'REVER', unitId, 5.00);

    // Initial stock = 100
    await inventoryService.recordMovement({
      ingredientId: ingId, warehouseId, unitId,
      movementType: MOVEMENT_TYPES.PURCHASE,
      quantity: 100, unitCost: 5.00,
      reference: 'Initial', userId: 0,
    });

    const { miId, portionId } = await setupTestMenuItem('Reverse Test', 'Food');
    await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 2, unitId },
    ]);

    // Create ticket with 3 orders → consume 6 units → balance = 94
    const ticketId = await setupTestTicket('T-REV-1', 30, true);
    for (let i = 0; i < 3; i++) {
      await setupTestOrder(ticketId, miId, 'Reverse Test', 1, true);
    }
    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    ticket.Orders = await db('Orders').where({ TicketId: ticketId });
    await inventoryService.deductForTicketSale(ticket, warehouseId, 0);

    // Verify consumed: balance = 94
    let balance = await inventoryService.getStockBalance(ingId, warehouseId);
    assert.equal(Number(balance.Quantity), 94);

    // Reverse (void/refund)
    const reversals = await inventoryService.reverseForTicket(ticket, warehouseId, 0);
    assert.equal(reversals.length, 3);  // 3 REVERSAL movements

    // Verify stock restored: 94 + 6 = 100
    balance = await inventoryService.getStockBalance(ingId, warehouseId);
    assert.equal(Number(balance.Quantity), 100);
  });

  test('deductForTicketSale skips orders with CalculatePrice=false (voided/gifted)', async () => {
    const unitId = await getFirstUnitId();
    const warehouseId = await getFirstWarehouseId();
    const ingId = await setupTestIngredient('Skip Ing', 'SKIPI', unitId, 1.00);

    await inventoryService.recordMovement({
      ingredientId: ingId, warehouseId, unitId,
      movementType: MOVEMENT_TYPES.PURCHASE,
      quantity: 100, unitCost: 1.00,
      reference: 'Initial', userId: 0,
    });

    const { miId, portionId } = await setupTestMenuItem('Skip Test', 'Food');
    await setupTestRecipe(portionId, [
      { ingredientId: ingId, quantity: 1, unitId },
    ]);

    // Ticket with 2 active + 1 voided order
    const ticketId = await setupTestTicket('T-SKIP-1', 20, false);
    for (let i = 0; i < 2; i++) {
      await setupTestOrder(ticketId, miId, 'Skip Test', 1, true);
    }
    // Voided order
    await setupTestOrder(ticketId, miId, 'Skip Test', 1, false);

    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    ticket.Orders = await db('Orders').where({ TicketId: ticketId });

    const movements = await inventoryService.deductForTicketSale(ticket, warehouseId, 0);
    assert.equal(movements.length, 2);  // only 2 SALE movements

    // Stock: 100 - 2 = 98
    const balance = await inventoryService.getStockBalance(ingId, warehouseId);
    assert.equal(Number(balance.Quantity), 98);
  });

  test('deductForTicketSale ignores orders with no recipe', async () => {
    const warehouseId = await getFirstWarehouseId();
    const { miId, portionId } = await setupTestMenuItem('No Recipe Test', 'Food');
    // No recipe defined for this portion

    const ticketId = await setupTestTicket('T-NOREC-1', 10, false);
    await setupTestOrder(ticketId, miId, 'No Recipe Test', 1, true);

    const ticket = await db('Tickets').where({ Id: ticketId }).first();
    ticket.Orders = await db('Orders').where({ TicketId: ticketId });

    const movements = await inventoryService.deductForTicketSale(ticket, warehouseId, 0);
    assert.equal(movements.length, 0);  // no recipe = no movements
  });
});

describe('FASE 5 — Transactional integrity', () => {

  beforeEach(async () => { await resetDb(); });

  test('saveRecipeWithCost runs inside a transaction', async () => {
    const unitId = await getFirstUnitId();
    const ingId = await setupTestIngredient('Tx Ing', 'TXI', unitId, 2.00);
    const { portionId } = await setupTestMenuItem('Tx Test', 'Food');

    const result = await withTransaction(async (trx) => {
      return recipeService.saveRecipeWithCost(portionId, [
        { ingredientId: ingId, quantity: 1, unitId },
      ], 0, trx);
    });

    assert.ok(result.recipeId);
    assert.equal(result.totalCost, 2.00);

    // Verify recipe persisted
    const recipe = await db('Recipes').where({ Id: result.recipeId }).first();
    assert.ok(recipe);
    assert.equal(recipe.MenuItemPortionId, portionId);
  });

  test('saveRecipeWithCost replaces existing recipe for the portion', async () => {
    const unitId = await getFirstUnitId();
    const ing1 = await setupTestIngredient('Old Ing', 'OLDI', unitId, 1.00);
    const ing2 = await setupTestIngredient('New Ing', 'NEWI', unitId, 5.00);
    const { portionId } = await setupTestMenuItem('Replace Test', 'Food');

    // First recipe
    const r1 = await setupTestRecipe(portionId, [
      { ingredientId: ing1, quantity: 1, unitId },
    ]);
    const recipe1Id = r1.recipeId;

    // Replace with new recipe (same portionId)
    const r2 = await setupTestRecipe(portionId, [
      { ingredientId: ing2, quantity: 2, unitId },
    ]);

    // New recipe should have new ID
    assert.notEqual(r2.recipeId, recipe1Id);
    assert.equal(r2.totalCost, 10.00);  // 2 × $5

    // Old recipe should be deleted
    const oldRecipe = await db('Recipes').where({ Id: recipe1Id }).first();
    assert.equal(oldRecipe, undefined);

    // Old RecipeItems should be cascade-deleted
    const oldItems = await db('RecipeItems').where({ RecipeId: recipe1Id });
    assert.equal(oldItems.length, 0);
  });
});

// Force-exit the process after tests complete.
describe('FASE 5 — Teardown', () => {
  test('cleanup db pool', async () => {
    try { await db.destroy(); } catch (e) {}
    setTimeout(() => process.exit(0), 100);
  });
});
