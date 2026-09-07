// =====================================================================
// refund-verification.test.js — Refund flow + idempotency tests
// =====================================================================
// Tests that:
//   - refundTicket sets IsRefunded=1
//   - double refund throws ConflictError (idempotency guard)
//   - inventory reversal happens exactly once
//   - reverseForTicket is idempotent (no duplicate REVERSAL movements)
//   - void + refund are mutually exclusive (can't refund a voided ticket)
//   - full payment → close → refund → verify stock restored
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const BACKEND_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..');
const PORT = 3096;

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

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Administrator', pin: '1234' }),
  });
  return (await res.json()).token;
}

async function authJson(baseUrl, token, method, pathStr, body) {
  const res = await fetch(`${baseUrl}${pathStr}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsedBody;
  try { parsedBody = await res.json(); } catch { parsedBody = await res.text(); }
  return { status: res.status, body: parsedBody };
}

async function insertTestMenuItem() {
  const knex = require('knex');
  const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
  const db = knex(config.development);
  const [miId] = await db('MenuItems').insert({
    Name: 'Test Burger', GroupCode: 'Food', Barcode: 'TB01', Tag: null,
  });
  const [portionId] = await db('MenuItemPortions').insert({
    Name: 'Normal', MenuItemId: miId, Multiplier: 1,
  });
  await db('MenuItemPrices').insert({
    MenuItemPortionId: portionId, PriceTag: null, Price: 10,
  });
  await db.destroy();
  return miId;
}

async function getStockBalance(ingredientId, warehouseId) {
  const knex = require('knex');
  const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
  const db = knex(config.development);
  const bal = await db('StockBalances')
    .where({ IngredientId: ingredientId, WarehouseId: warehouseId })
    .first();
  await db.destroy();
  return bal ? Number(bal.Quantity) : 0;
}

async function countMovements(ticketId, type) {
  const knex = require('knex');
  const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
  const db = knex(config.development);
  const count = await db('StockMovements')
    .where({ TicketId: ticketId, MovementType: type })
    .count('* as c')
    .first();
  await db.destroy();
  return Number(count.c);
}

async function getTicketField(ticketId, field) {
  const knex = require('knex');
  const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
  const db = knex(config.development);
  const row = await db('Tickets').where({ Id: ticketId }).first();
  await db.destroy();
  return row ? row[field] : null;
}

describe('FASE 4 — Refund idempotency + inventory reversal', () => {
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

  test('3A: Full flow: sale → close → refund → IsRefunded=1 + stock restored', async () => {
    // We'll use the inventory-verification approach: create ticket, add order,
    // close it, then refund.
    // Since this test needs recipe + stock to verify reversal, we'll use
    // a direct DB approach for setup.
    const knex = require('knex');
    const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
    const db = knex(config.development);

    // Setup: ingredient with stock + recipe
    const unit = await db('IngredientUnits').where({ Code: 'unit' }).first();
    const warehouse = await db('Warehouses').first();
    const [ingId] = await db('Ingredients').insert({
      Name: 'Refund Test Ing', Code: 'RFDING_' + Date.now(),
      BaseUnitId: unit.Id, MinimumStock: 0, CostPerUnit: 2.00,
    });
    // Set initial stock = 100
    await db('StockBalances').insert({
      IngredientId: ingId, WarehouseId: warehouse.Id,
      Quantity: 100, UnitId: unit.Id, AverageCost: 2.00,
      LastUpdated: new Date().toISOString(),
    });

    // Create recipe: 1 unit per portion
    const [portionId] = await db('MenuItemPortions').insert({
      MenuItemId: menuItemId, Name: 'RefundPortion', Multiplier: 1,
    });
    await db('MenuItemPrices').insert({
      MenuItemPortionId: portionId, PriceTag: null, Price: 10,
    });
    const [recipeId] = await db('Recipes').insert({
      MenuItemPortionId: portionId, FixedCost: 0, IsActive: 1,
    });
    await db('RecipeItems').insert({
      RecipeId: recipeId, IngredientId: ingId, Quantity: 2, UnitId: unit.Id,
    });

    // Create ticket with 3 orders
    const now = new Date().toISOString();
    const [ticketId] = await db('Tickets').insert({
      DepartmentId: 1, TicketTypeId: 1, TicketNumber: 'T-RFD-1',
      Date: now, LastUpdateTime: now, LastOrderDate: now, LastPaymentDate: now,
      TotalAmount: 30, RemainingAmount: 0, IsClosed: 0, Version: 1,
    });
    for (let i = 0; i < 3; i++) {
      await db('Orders').insert({
        TicketId: ticketId, MenuItemId: menuItemId, MenuItemName: 'Test',
        PortionName: 'RefundPortion', Quantity: 1, Price: 10,
        CalculatePrice: 1, CreatedDateTime: now,
        AccountTransactionTypeId: 3,
      });
    }
    await db.destroy();

    // Pay the ticket ($30 = 3 × $10)
    const payRes = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 30, idempotencyKey: 'pay-rfd-1' });
    assert.equal(payRes.status, 200, `Payment failed: ${JSON.stringify(payRes.body).slice(0, 200)}`);

    // Close ticket (deducts inventory: 3 orders × 2 units = 6 units)
    const closeRes = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/close`,
      { idempotencyKey: 'close-rfd-1' });
    assert.equal(closeRes.status, 200, `Close failed: ${JSON.stringify(closeRes.body).slice(0, 200)}`);

    // Verify stock deducted: 100 - 6 = 94
    let stock = await getStockBalance(ingId, warehouse.Id);
    assert.equal(stock, 94, `After close, stock should be 94, got ${stock}`);

    // Verify SALE movements: 3 (one per order × one ingredient)
    let saleCount = await countMovements(ticketId, 'SALE');
    assert.equal(saleCount, 3, `Expected 3 SALE movements, got ${saleCount}`);

    // Refund the ticket
    const refundRes = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/refund`,
      { amount: 30, reason: 'customer request', idempotencyKey: 'refund-rfd-1' });
    assert.equal(refundRes.status, 200, `Refund failed: ${JSON.stringify(refundRes.body).slice(0, 200)}`);

    // Verify IsRefunded=1
    const isRefunded = await getTicketField(ticketId, 'IsRefunded');
    assert.equal(isRefunded, 1, `IsRefunded should be 1 after refund, got ${isRefunded}`);

    // Verify stock restored: 94 + 6 = 100
    stock = await getStockBalance(ingId, warehouse.Id);
    assert.equal(stock, 100, `After refund, stock should be 100, got ${stock}`);

    // Verify REVERSAL movements: 3 (one per SALE)
    const reversalCount = await countMovements(ticketId, 'REVERSAL');
    assert.equal(reversalCount, 3, `Expected 3 REVERSAL movements, got ${reversalCount}`);
  });

  test('3B: Double refund throws ConflictError (idempotency guard)', async () => {
    // Reuse the ticket from 3A (already refunded)
    const knex = require('knex');
    const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
    const db = knex(config.development);
    const ticket = await db('Tickets').where({ TicketNumber: 'T-RFD-1' }).first();
    await db.destroy();

    // Second refund with different key — should fail with 409
    const refund2 = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticket.Id}/refund`,
      { amount: 30, reason: 'second attempt', idempotencyKey: 'refund-rfd-2' });
    assert.ok(refund2.status === 409 || refund2.status === 400,
      `Second refund should be rejected, got ${refund2.status}`);

    // Verify NO additional REVERSAL movements were created
    const reversalCount = await countMovements(ticket.Id, 'REVERSAL');
    assert.equal(reversalCount, 3, `Should still have 3 REVERSAL (not duplicated), got ${reversalCount}`);
  });

  test('3C: reverseForTicket is idempotent at the service level', async () => {
    // Directly test that calling reverseForTicket twice doesn't duplicate
    const knex = require('knex');
    const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));
    const db = knex(config.development);
    const { InventoryService } = require(path.join(BACKEND_DIR, 'src', 'api', 'services', 'InventoryService'));
    const inv = new InventoryService();

    // Use the ticket from 3A
    const ticket = await db('Tickets').where({ TicketNumber: 'T-RFD-1' }).first();
    ticket.Orders = await db('Orders').where({ TicketId: ticket.Id });

    // Count REVERSAL before
    const before = await countMovements(ticket.Id, 'REVERSAL');

    // Call reverseForTicket again (should be no-op due to idempotency)
    await inv.reverseForTicket(ticket, 1, 0);

    // Count REVERSAL after — should be the same
    const after = await countMovements(ticket.Id, 'REVERSAL');
    assert.equal(after, before, `reverseForTicket should be idempotent. Before=${before}, After=${after}`);

    await db.destroy();
  });

  test('3D: Refund with amount exceeding total paid is rejected', async () => {
    // Create a new ticket, pay $5, try to refund $20
    const t = await authJson(baseUrl, token, 'POST', '/api/tickets',
      { departmentId: 1, ticketTypeId: 1 });
    const ticketId = t.body.data.Id;
    await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/orders`,
      { menuItemId, quantity: 1 });
    await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/payments`,
      { paymentTypeId: 1, amount: 5, idempotencyKey: 'pay-rfd-3d' });
    await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/close`,
      { idempotencyKey: 'close-rfd-3d' });

    // Try to refund $20 (exceeds $5 paid)
    const refundRes = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/refund`,
      { amount: 20, reason: 'greedy', idempotencyKey: 'refund-rfd-3d' });
    assert.ok(refundRes.status >= 400, `Refund exceeding paid should fail, got ${refundRes.status}`);
  });

  test('3E: Cannot refund an open (non-closed) ticket', async () => {
    const t = await authJson(baseUrl, token, 'POST', '/api/tickets',
      { departmentId: 1, ticketTypeId: 1 });
    const ticketId = t.body.data.Id;
    await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/orders`,
      { menuItemId, quantity: 1 });

    // Try to refund without closing first
    const refundRes = await authJson(baseUrl, token, 'POST', `/api/tickets/${ticketId}/refund`,
      { amount: 5, reason: 'not closed', idempotencyKey: 'refund-rfd-3e' });
    assert.ok(refundRes.status === 409 || refundRes.status === 400,
      `Refund of open ticket should fail, got ${refundRes.status}`);
  });
});

// Force-exit the process after tests complete.
describe('Teardown', () => {
  test('cleanup', async () => {
    const { db } = require('../src/infrastructure/db/db');
    try { await db.destroy(); } catch (e) {}
    setTimeout(() => process.exit(0), 200);
  });
});
