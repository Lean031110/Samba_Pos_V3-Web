// =====================================================================
// bloque-d-verification.test.js — Bloque D (Fase 4) deep verification
// =====================================================================
// Tests the gaps identified in docs/PRODUCTION_GAP_MATRIX.md for BLOQUE D:
//
//   1. Traspasos entre almacenes (transferStock)
//   2. Merma dedicada (recordWaste with reason)
//   3. Inventario físico (PhysicalCountSessions + finalize + adjustments)
//   4. Kardex (movements ledger with running balance + summary)
//   5. Recetas versionadas (saveRecipeVersion + history + restore)
//   6. Combos (createCombo + getCombo + pricing model)
//
// All tests use supertest against the real app + real SQLite DB.
// Test data is cleaned up in after() to leave the DB pristine.
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

const { createApp } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');
const { InventoryService, MOVEMENT_TYPES } = require('../src/api/services/InventoryService');
const { RecipeService } = require('../src/api/services/RecipeService');
const { ComboService } = require('../src/api/services/ComboService');

const app = createApp();
const request = supertest(app);
const inventoryService = new InventoryService();
const recipeService = new RecipeService();
const comboService = new ComboService();

let jwtToken = null;
let testWarehouseId = null;
let testWarehouse2Id = null;
let testIngredient = null;
let testMenuItemId = null;
let testPortionId = null;

// Track all created entities for cleanup
const created = {
  menuItems: [],
  portions: [],
  prices: [],
  ingredients: [],
  recipes: [],
  versions: [],
  transfers: [],
  combos: [],
  physicalCountSessions: [],
  warehouses: [],
};

function authGet(path) { return request.get(path).set('Authorization', 'Bearer ' + jwtToken); }
function authPost(path, body) { return request.post(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }
function authPatch(path, body) { return request.patch(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }
function authPut(path, body) { return request.put(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }
function authDelete(path) { return request.delete(path).set('Authorization', 'Bearer ' + jwtToken); }

async function setupFixtures() {
  // Login
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;
  assert.ok(jwtToken, 'Login should return a JWT token');

  // Use main warehouse
  const wh = await db('Warehouses').first();
  testWarehouseId = wh.Id;

  // Create a SECOND warehouse for transfer tests
  const [wh2Id] = await db('Warehouses').insert({
    Name: 'Bloque D Test WH', WarehouseTypeId: 1, SortOrder: 999,
  });
  testWarehouse2Id = wh2Id;
  created.warehouses.push(wh2Id);

  // Use an existing ingredient (Bread Bun)
  testIngredient = await db('Ingredients').where({ Code: 'BREAD' }).first();
  assert.ok(testIngredient, 'BREAD ingredient should exist (seeded)');

  // Seed some initial stock at WH1 (purchase 100)
  await inventoryService.recordMovement({
    ingredientId: testIngredient.Id, warehouseId: testWarehouseId,
    unitId: testIngredient.BaseUnitId, movementType: MOVEMENT_TYPES.PURCHASE,
    quantity: 100, unitCost: 0.30, reference: 'Bloque D test setup',
    userId: 1,
  });

  // Create a menu item + portion for recipe tests
  const [miId] = await db('MenuItems').insert({
    Name: 'Bloque D Recipe Test', GroupCode: 'Food', Barcode: 'BLDRECIPE', Tag: null,
  });
  created.menuItems.push(miId);
  testMenuItemId = miId;

  const [pId] = await db('MenuItemPortions').insert({
    Name: 'Normal', MenuItemId: miId, Multiplier: 1,
  });
  created.portions.push(pId);
  testPortionId = pId;
}

async function cleanup() {
  try {
    // Delete in reverse FK order
    await db('ComboItems').del();
    await db('Combos').del();
    await db('RecipeVersions').whereIn('RecipeId', created.recipes).del();
    await db('RecipeItems').whereIn('RecipeId', created.recipes).del();
    await db('Recipes').whereIn('Id', created.recipes).del();
    await db('PhysicalCountItems').del();
    await db('PhysicalCountSessions').del();
    await db('WarehouseTransferItems').del();
    await db('WarehouseTransfers').del();
    await db('StockMovements').whereLike('Reference', '%Bloque D%').del();
    await db('StockMovements').whereLike('Notes', '%Bloque D%').del();
    await db('StockMovements').whereLike('Notes', '%transfer%').del();
    await db('StockBalances').where({ WarehouseId: testWarehouse2Id }).del();
    await db('MenuItemPrices').whereIn('MenuItemPortionId', created.portions).del();
    await db('MenuItemPortions').whereIn('Id', created.portions).del();
    await db('MenuItems').whereIn('Id', created.menuItems).del();
    await db('Warehouses').whereIn('Id', created.warehouses).del();
    await db('AuditLogs').whereLike('Action', 'inventory.%').del();
    await db('AuditLogs').whereLike('Action', 'recipe.%').del();
    await db('AuditLogs').whereLike('Action', 'combo.%').del();
  } catch (err) {
    console.error('[cleanup error]', err.message);
  }
  await db.destroy();
}

// =====================================================================
// 1. TRASPASOS ENTRE ALMACENES
// =====================================================================

describe('1. Traspasos entre almacenes', () => {
  test('1A: POST /api/inventory/transfer — transfer 10 from WH1 to WH2', async () => {
    const wh1Before = await inventoryService.getStockBalance(testIngredient.Id, testWarehouseId);
    const wh2Before = await inventoryService.getStockBalance(testIngredient.Id, testWarehouse2Id);
    const wh1BeforeQty = Number(wh1Before?.Quantity || 0);
    const wh2BeforeQty = Number(wh2Before?.Quantity || 0);

    const res = await authPost('/api/inventory/transfer', {
      fromWarehouseId: testWarehouseId,
      toWarehouseId: testWarehouse2Id,
      items: [{ ingredientId: testIngredient.Id, quantity: 10, unitId: testIngredient.BaseUnitId }],
      notes: 'Bloque D test transfer',
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.data.transferId);
    assert.ok(res.body.data.transferNumber);
    assert.match(res.body.data.transferNumber, /^WT-\d{4}-\d{4}$/);
    assert.strictEqual(res.body.data.itemCount, 1);
    created.transfers.push(res.body.data.transferId);

    const wh1After = await inventoryService.getStockBalance(testIngredient.Id, testWarehouseId);
    const wh2After = await inventoryService.getStockBalance(testIngredient.Id, testWarehouse2Id);

    assert.strictEqual(Number(wh1After.Quantity), wh1BeforeQty - 10, 'WH1 should decrease by 10');
    assert.strictEqual(Number(wh2After.Quantity), wh2BeforeQty + 10, 'WH2 should increase by 10');
  });

  test('1B: Transfer fails when source == target', async () => {
    const res = await authPost('/api/inventory/transfer', {
      fromWarehouseId: testWarehouseId,
      toWarehouseId: testWarehouseId,
      items: [{ ingredientId: testIngredient.Id, quantity: 1, unitId: testIngredient.BaseUnitId }],
    });
    assert.strictEqual(res.status, 400);
  });

  test('1C: Transfer fails when insufficient stock', async () => {
    const res = await authPost('/api/inventory/transfer', {
      fromWarehouseId: testWarehouse2Id,  // WH2 has only 10 from previous test
      toWarehouseId: testWarehouseId,
      items: [{ ingredientId: testIngredient.Id, quantity: 9999, unitId: testIngredient.BaseUnitId }],
    });
    assert.strictEqual(res.status, 409);
  });

  test('1D: GET /api/inventory/transfers — list returns our transfer', async () => {
    const res = await authGet('/api/inventory/transfers');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.count >= 1, 'Should have at least 1 transfer');
    const our = res.body.data.find(t => t.Notes === 'Bloque D test transfer');
    assert.ok(our, 'Our transfer should be in the list');
  });

  test('1E: GET /api/inventory/transfers/:id — get by ID with items', async () => {
    const listRes = await authGet('/api/inventory/transfers');
    const firstId = listRes.body.data[0].Id;
    const res = await authGet('/api/inventory/transfers/' + firstId);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.transfer);
    assert.ok(Array.isArray(res.body.data.items));
    assert.strictEqual(res.body.data.items.length, 1);
  });

  test('1F: TRANSFER_OUT and TRANSFER_IN movements are recorded in ledger', async () => {
    const listRes = await authGet('/api/inventory/transfers?status=COMPLETED');
    const our = listRes.body.data.find(t => t.Notes === 'Bloque D test transfer');
    assert.ok(our, 'Should find our completed transfer');

    // Movements should have both types
    const outMovements = await db('StockMovements')
      .where({ MovementType: MOVEMENT_TYPES.TRANSFER_OUT, WarehouseId: testWarehouseId });
    const inMovements = await db('StockMovements')
      .where({ MovementType: MOVEMENT_TYPES.TRANSFER_IN, WarehouseId: testWarehouse2Id });
    assert.ok(outMovements.length >= 1, 'Should have TRANSFER_OUT movements');
    assert.ok(inMovements.length >= 1, 'Should have TRANSFER_IN movements');
  });
});

// =====================================================================
// 2. MERMA (WASTE)
// =====================================================================

describe('2. Merma (Waste)', () => {
  test('2A: POST /api/inventory/waste — record waste with reason', async () => {
    const before = await inventoryService.getStockBalance(testIngredient.Id, testWarehouseId);
    const beforeQty = Number(before?.Quantity || 0);

    const res = await authPost('/api/inventory/waste', {
      ingredientId: testIngredient.Id,
      warehouseId: testWarehouseId,
      unitId: testIngredient.BaseUnitId,
      quantity: 3,
      reason: 'expired',
      notes: 'Bloque D waste test',
    });
    assert.strictEqual(res.status, 201);

    const after = await inventoryService.getStockBalance(testIngredient.Id, testWarehouseId);
    assert.strictEqual(Number(after.Quantity), beforeQty - 3, 'Stock should decrease by 3');

    const movement = await db('StockMovements')
      .where({ MovementType: MOVEMENT_TYPES.WASTE, IngredientId: testIngredient.Id })
      .orderBy('Id', 'desc')
      .first();
    assert.ok(movement, 'WASTE movement should be recorded');
    assert.strictEqual(Number(movement.Quantity), -3, 'WASTE quantity should be -3 (negative)');
    assert.match(movement.Reference, /^WASTE: expired$/);
  });

  test('2B: Waste fails when reason is missing', async () => {
    const res = await authPost('/api/inventory/waste', {
      ingredientId: testIngredient.Id,
      warehouseId: testWarehouseId,
      unitId: testIngredient.BaseUnitId,
      quantity: 1,
      // reason missing
    });
    assert.strictEqual(res.status, 400);
  });

  test('2C: Waste fails when quantity is not positive', async () => {
    const res = await authPost('/api/inventory/waste', {
      ingredientId: testIngredient.Id,
      warehouseId: testWarehouseId,
      unitId: testIngredient.BaseUnitId,
      quantity: -5,  // negative — should fail (we negate internally)
      reason: 'should fail',
    });
    assert.strictEqual(res.status, 400);
  });

  test('2D: Waste fails when insufficient stock', async () => {
    const res = await authPost('/api/inventory/waste', {
      ingredientId: testIngredient.Id,
      warehouseId: testWarehouse2Id,  // WH2 has only 10 from transfer
      unitId: testIngredient.BaseUnitId,
      quantity: 99999,
      reason: 'should fail',
    });
    assert.strictEqual(res.status, 409);
  });
});

// =====================================================================
// 3. INVENTARIO FÍSICO (Physical Count)
// =====================================================================

describe('3. Inventario físico (Physical Count)', () => {
  let sessionId = null;

  test('3A: POST /api/inventory/physical-count — create session', async () => {
    const res = await authPost('/api/inventory/physical-count', {
      warehouseId: testWarehouse2Id,
      name: 'Bloque D PC Test',
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.data.sessionId);
    assert.ok(res.body.data.itemCount >= 1, 'Should seed at least 1 item');
    sessionId = res.body.data.sessionId;
    created.physicalCountSessions.push(sessionId);
  });

  test('3B: GET /api/inventory/physical-count/:id — items seeded with expected qty', async () => {
    const res = await authGet('/api/inventory/physical-count/' + sessionId);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.session.Status, 'OPEN');
    assert.ok(Array.isArray(res.body.data.items));
    assert.ok(res.body.data.items.length >= 1);
    const breadItem = res.body.data.items.find(i => i.IngredientId === testIngredient.Id);
    assert.ok(breadItem, 'Bread should be in the count');
    assert.strictEqual(Number(breadItem.ExpectedQuantity), Number(breadItem.CountedQuantity), 'Initially counted=expected');
    assert.strictEqual(Number(breadItem.Difference), 0, 'Initially difference=0');
  });

  test('3C: PATCH /api/inventory/physical-count/:id/items/:ingredientId — set counted qty', async () => {
    const res = await authPatch('/api/inventory/physical-count/' + sessionId + '/items/' + testIngredient.Id, {
      countedQuantity: 5,
      notes: 'Counted 5 units',
    });
    assert.strictEqual(res.status, 200);
    const item = await db('PhysicalCountItems')
      .where({ SessionId: sessionId, IngredientId: testIngredient.Id }).first();
    assert.strictEqual(Number(item.CountedQuantity), 5);
    assert.strictEqual(Number(item.Difference), 5 - Number(item.ExpectedQuantity));
  });

  test('3D: POST /api/inventory/physical-count/:id/finalize — apply adjustments', async () => {
    const session = await db('PhysicalCountSessions').where({ Id: sessionId }).first();
    const items = await db('PhysicalCountItems').where({ SessionId: sessionId }).first();
    const expectedQty = Number(items.ExpectedQuantity);
    const countedQty = Number(items.CountedQuantity);
    const diff = countedQty - expectedQty;

    const balanceBefore = await inventoryService.getStockBalance(testIngredient.Id, testWarehouse2Id);
    const beforeQty = Number(balanceBefore?.Quantity || 0);

    const res = await authPost('/api/inventory/physical-count/' + sessionId + '/finalize', {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.adjustedItems, diff !== 0 ? 1 : 0);

    const balanceAfter = await inventoryService.getStockBalance(testIngredient.Id, testWarehouse2Id);
    const afterQty = Number(balanceAfter?.Quantity || 0);
    assert.strictEqual(afterQty, beforeQty + diff, 'Stock should match counted after finalization');

    const sessionAfter = await db('PhysicalCountSessions').where({ Id: sessionId }).first();
    assert.strictEqual(sessionAfter.Status, 'FINALIZED');
    assert.ok(sessionAfter.FinalizedAt);
  });

  test('3E: Finalize fails when session already finalized', async () => {
    const res = await authPost('/api/inventory/physical-count/' + sessionId + '/finalize', {});
    assert.strictEqual(res.status, 409);
  });

  test('3F: GET /api/inventory/physical-count — list sessions', async () => {
    const res = await authGet('/api/inventory/physical-count');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.count >= 1);
    const ours = res.body.data.find(s => s.Name === 'Bloque D PC Test');
    assert.ok(ours, 'Our session should be in the list');
    assert.strictEqual(ours.Status, 'FINALIZED');
  });
});

// =====================================================================
// 4. KARDEX (Inventory Movement Ledger)
// =====================================================================

describe('4. Kardex', () => {
  test('4A: GET /api/inventory/kardex?ingredientId=... — returns movements with running balance', async () => {
    const res = await authGet('/api/inventory/kardex?ingredientId=' + testIngredient.Id);
    assert.strictEqual(res.status, 200);
    const data = res.body.data;
    assert.ok(data.ingredient);
    assert.strictEqual(data.ingredient.id, testIngredient.Id);
    assert.ok(Array.isArray(data.entries));
    assert.ok(data.entries.length >= 1);
    assert.ok(typeof data.currentBalance === 'number');
    assert.ok(data.summary);
    // Each entry should have runningBalance
    for (const e of data.entries) {
      assert.ok(typeof e.runningBalance === 'number');
      assert.ok(e.movementType);
      assert.ok(e.date);
    }
  });

  test('4B: Kardex running balance = sum of all movements up to each point', async () => {
    const res = await authGet('/api/inventory/kardex?ingredientId=' + testIngredient.Id);
    const entries = res.body.data.entries;
    let expected = 0;
    for (const e of entries) {
      expected += e.quantity;
      assert.strictEqual(e.runningBalance, Math.round(expected * 10000) / 10000);
    }
  });

  test('4C: Kardex summary aggregates by movement type', async () => {
    const res = await authGet('/api/inventory/kardex?ingredientId=' + testIngredient.Id);
    const summary = res.body.data.summary;
    assert.ok(summary);

    let totalBySummary = 0;
    for (const type of Object.keys(summary)) {
      assert.ok(typeof summary[type].count === 'number');
      assert.ok(typeof summary[type].totalQuantity === 'number');
      assert.ok(typeof summary[type].totalCost === 'number');
      totalBySummary += summary[type].totalQuantity;
    }
    // Sum of all summary totals should equal the currentBalance
    assert.strictEqual(Math.round(totalBySummary * 10000) / 10000, res.body.data.currentBalance);
  });

  test('4D: Kardex filters by warehouseId', async () => {
    const resAll = await authGet('/api/inventory/kardex?ingredientId=' + testIngredient.Id);
    const resWH1 = await authGet('/api/inventory/kardex?ingredientId=' + testIngredient.Id + '&warehouseId=' + testWarehouseId);
    assert.strictEqual(resWH1.status, 200);
    assert.ok(resWH1.body.data.entries.length <= resAll.body.data.entries.length,
      'Filtered by warehouse should have <= entries than unfiltered');
  });

  test('4E: Kardex filters by date range (from/to)', async () => {
    const future = '2999-12-31';
    const res = await authGet('/api/inventory/kardex?ingredientId=' + testIngredient.Id + '&from=' + future);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.entries.length, 0, 'Future filter should return 0 entries');
  });

  test('4F: Kardex fails when ingredientId missing', async () => {
    const res = await authGet('/api/inventory/kardex');
    assert.strictEqual(res.status, 400);
  });

  test('4G: Kardex fails when ingredient does not exist', async () => {
    const res = await authGet('/api/inventory/kardex?ingredientId=99999');
    assert.strictEqual(res.status, 404);
  });
});

// =====================================================================
// 5. RECETAS VERSIONADAS
// =====================================================================

describe('5. Recetas versionadas', () => {
  test('5A: POST /api/recipes/by-portion/:portionId/versions — save v1', async () => {
    const bread = await db('Ingredients').where({ Code: 'BREAD' }).first();
    const beef = await db('Ingredients').where({ Code: 'BEEF' }).first();
    const unit = await db('IngredientUnits').where({ Code: 'unit' }).first();

    const res = await authPost('/api/recipes/by-portion/' + testPortionId + '/versions', {
      items: [
        { ingredientId: bread.Id, quantity: 1, unitId: unit.Id },
        { ingredientId: beef.Id, quantity: 1, unitId: unit.Id },
      ],
      fixedCost: 0.50,
      label: 'v1 — original',
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.versionNumber, 1);
    assert.strictEqual(res.body.data.itemCount, 2);
    assert.ok(res.body.data.recipeId);
    assert.ok(res.body.data.versionId);
    created.recipes.push(res.body.data.recipeId);
    created.versions.push(res.body.data.versionId);

    // Verify ActiveVersionId set on recipe
    const recipe = await db('Recipes').where({ Id: res.body.data.recipeId }).first();
    assert.strictEqual(recipe.ActiveVersionId, res.body.data.versionId);
  });

  test('5B: Save v2 with different items', async () => {
    const bread = await db('Ingredients').where({ Code: 'BREAD' }).first();
    const unit = await db('IngredientUnits').where({ Code: 'unit' }).first();

    const res = await authPost('/api/recipes/by-portion/' + testPortionId + '/versions', {
      items: [
        { ingredientId: bread.Id, quantity: 2, unitId: unit.Id },
      ],
      fixedCost: 0.50,
      label: 'v2 — less ingredients',
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.versionNumber, 2);
    created.versions.push(res.body.data.versionId);

    // v2 cost should be different
    const recipe = await db('Recipes').where({ MenuItemPortionId: testPortionId }).first();
    assert.strictEqual(recipe.ActiveVersionId, res.body.data.versionId, 'v2 should be active');
  });

  test('5C: GET /api/recipes/by-portion/:portionId/versions — version history', async () => {
    const res = await authGet('/api/recipes/by-portion/' + testPortionId + '/versions');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.versions.length >= 2);
    assert.strictEqual(res.body.data.versions[0].versionNumber, 2, 'Most recent first');
    assert.strictEqual(res.body.data.versions[1].versionNumber, 1);
    // Each version should have a snapshot
    for (const v of res.body.data.versions) {
      assert.ok(v.snapshot);
      assert.ok(Array.isArray(v.snapshot.items));
      assert.ok(typeof v.isActive === 'boolean');
    }
  });

  test('5D: POST /api/recipes/by-portion/:portionId/restore/:versionId — restore v1 as v3', async () => {
    const histRes = await authGet('/api/recipes/by-portion/' + testPortionId + '/versions');
    const v1 = histRes.body.data.versions.find(v => v.versionNumber === 1);
    assert.ok(v1);

    const res = await authPost('/api/recipes/by-portion/' + testPortionId + '/restore/' + v1.id, {
      label: 'v3 — restored from v1',
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.versionNumber, 3);
    assert.strictEqual(res.body.data.itemCount, 2, 'Restored v1 had 2 items');
    created.versions.push(res.body.data.versionId);

    // Active should now be v3
    const recipe = await db('Recipes').where({ MenuItemPortionId: testPortionId }).first();
    assert.strictEqual(recipe.ActiveVersionId, res.body.data.versionId);
  });

  test('5E: Version snapshots are immutable — restoring v1 does not delete v1', async () => {
    const res = await authGet('/api/recipes/by-portion/' + testPortionId + '/versions');
    const v1 = res.body.data.versions.find(v => v.versionNumber === 1);
    assert.ok(v1, 'v1 should still exist after restore');
    assert.strictEqual(v1.isActive, false, 'v1 is not active after restore');
  });
});

// =====================================================================
// 6. COMBOS
// =====================================================================

describe('6. Combos', () => {
  let comboId = null;
  let comboMenuId = null;
  let subIds = [];

  before(async () => {
    // Create 3 sub-items with portions + prices
    const items = [
      { name: 'Combo Sub Burger', price: 5.00 },
      { name: 'Combo Sub Fries', price: 2.00 },
      { name: 'Combo Sub Drink', price: 1.50 },
    ];
    subIds = [];
    for (const it of items) {
      const [miId] = await db('MenuItems').insert({ Name: it.name, GroupCode: 'Food', Barcode: 'CMB_SUB_' + it.name, Tag: null });
      const [pId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
      await db('MenuItemPrices').insert({ MenuItemPortionId: pId, PriceTag: null, Price: it.price });
      subIds.push({ miId, pId, price: it.price });
      created.menuItems.push(miId);
      created.portions.push(pId);
    }
    // Create the combo container MenuItem
    [comboMenuId] = await db('MenuItems').insert({ Name: 'Combo Test Container', GroupCode: 'COMBO', Barcode: 'CMB_TEST', Tag: null });
    created.menuItems.push(comboMenuId);
  });

  test('6A: POST /api/combos — create combo with useCustomPrice=false', async () => {
    const res = await authPost('/api/combos', {
      menuItemId: comboMenuId,
      name: 'Test Combo',
      items: [
        { menuItemId: subIds[0].miId, menuItemPortionId: subIds[0].pId, quantity: 2 }, // 2×$5 = $10
        { menuItemId: subIds[1].miId, menuItemPortionId: subIds[1].pId, quantity: 1 }, // 1×$2 = $2
        { menuItemId: subIds[2].miId, menuItemPortionId: subIds[2].pId, quantity: 1, overridePrice: 1.00 }, // override = $1
      ],
      comboPrice: 12.00,  // not used (useCustomPrice=false)
      useCustomPrice: false,
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.data.comboId);
    comboId = res.body.data.comboId;
    created.combos.push(comboId);
  });

  test('6B: GET /api/combos/:id — effectivePrice = sum of sub-items', async () => {
    const res = await authGet('/api/combos/' + comboId);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.combo.useCustomPrice, false);
    // 2×$5 + 1×$2 + 1×$1 = 10+2+1 = 13
    assert.strictEqual(res.body.data.sumOfSubItems, 13);
    assert.strictEqual(res.body.data.effectivePrice, 13);
    assert.strictEqual(res.body.data.discount, 0);
    assert.strictEqual(res.body.data.items.length, 3);
  });

  test('6C: PATCH /api/combos/:id — switch to useCustomPrice=true with comboPrice=11', async () => {
    const res = await authPatch('/api/combos/' + comboId, {
      comboPrice: 11.00,
      useCustomPrice: true,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.combo.useCustomPrice, true);
    assert.strictEqual(res.body.data.combo.comboPrice, 11);
    assert.strictEqual(res.body.data.effectivePrice, 11);
    assert.strictEqual(res.body.data.discount, 2);  // 13 - 11 = 2
  });

  test('6D: GET /api/combos — list returns our combo', async () => {
    const res = await authGet('/api/combos');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.count >= 1);
    const ours = res.body.data.find(c => c.Id === comboId);
    assert.ok(ours);
    assert.strictEqual(ours.Name, 'Test Combo');
  });

  test('6E: PUT /api/combos/:id/items — replace items', async () => {
    const res = await authPut('/api/combos/' + comboId + '/items', {
      items: [
        { menuItemId: subIds[0].miId, menuItemPortionId: subIds[0].pId, quantity: 1 },  // 1×$5
        { menuItemId: subIds[1].miId, menuItemPortionId: subIds[1].pId, quantity: 1 },  // 1×$2
      ],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.itemCount, 2);

    // Verify effective price is now 5+2 = 7 (since useCustomPrice is still true → comboPrice=11)
    const getRes = await authGet('/api/combos/' + comboId);
    assert.strictEqual(getRes.body.data.items.length, 2);
    // Note: effectivePrice still 11 (custom), but sumOfSubItems is now 7
    assert.strictEqual(getRes.body.data.sumOfSubItems, 7);
  });

  test('6F: DELETE /api/combos/:id — soft delete (IsActive=0)', async () => {
    const res = await authDelete('/api/combos/' + comboId);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isActive, false);
    const combo = await db('Combos').where({ Id: comboId }).first();
    assert.strictEqual(combo.IsActive, 0);
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
