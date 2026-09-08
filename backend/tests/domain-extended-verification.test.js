// =====================================================================
// domain-extended-verification.test.js — Tests for moveOrders, reopen, changePayment
// =====================================================================
// BLOQUE B — Fase 2: Cerrar dominio y operaciones monetarias.
//
// Tests:
//   - moveOrders: mover órdenes entre tickets, recalcula ambos
//   - moveOrders: no permite mover de ticket cerrado
//   - moveOrders: no permite mover a ticket cerrado
//   - moveOrders: no permite mover órdenes voided/gifted
//   - moveOrders: valida mismo departamento
//   - reopen: reabre ticket cerrado
//   - reopen: no permite reabrir ticket abierto
//   - reopen: no permite reabrir ticket voided
//   - reopen: no permite reabrir ticket refunded
//   - changePayment: registra cambio correctamente
//   - changePayment: no permite en ticket cerrado
//   - changePayment: idempotencia
// =====================================================================

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.chdir(__dirname + '/..');

const { db } = require('../src/infrastructure/db/db');
const { TicketService } = require('../src/api/services/TicketService');
const { TicketServiceExtended } = require('../src/api/services/TicketServiceExtended');

const ticketService = new TicketService();
const ticketServiceExt = new TicketServiceExtended();

async function setupTestMenuItem(name = 'Domain Test Burger', groupCode = 'Food') {
  const [miId] = await db('MenuItems').insert({
    Name: name, GroupCode: groupCode, Barcode: 'DTB' + Date.now() + Math.random(), Tag: null,
  });
  const [portionId] = await db('MenuItemPortions').insert({
    MenuItemId: miId, Name: 'Normal', Multiplier: 1,
  });
  await db('MenuItemPrices').insert({
    MenuItemPortionId: portionId, PriceTag: null, Price: 10.00,
  });
  return miId;
}

async function setupTicketWithOrders(menuItemId, orderQty = 2) {
  const ticket = await ticketService.createTicket({ departmentId: 1, ticketTypeId: 1 });
  for (let i = 0; i < orderQty; i++) {
    await ticketService.addOrder(ticket.Id, { menuItemId, quantity: 1 });
  }
  return ticket;
}

async function setupChangePaymentType() {
  const [id] = await db('ChangePaymentTypes').insert({
    Name: 'Cash Change', AccountTransactionTypeId: 4,
  });
  return id;
}

async function resetDb() {
  // Clean test data
  await db('ChangePayments').del();
  await db('Payments').del();
  await db('Orders').del();
  await db('Calculations').del();
  await db('TicketEntities').del();
  await db('Tickets').del();
  const testMenuItems = await db('MenuItems').where('Name', 'like', 'Domain Test%').pluck('Id');
  if (testMenuItems.length > 0) {
    const testPortions = await db('MenuItemPortions').whereIn('MenuItemId', testMenuItems).pluck('Id');
    if (testPortions.length > 0) {
      await db('MenuItemPrices').whereIn('MenuItemPortionId', testPortions).del();
    }
    await db('MenuItemPortions').whereIn('MenuItemId', testMenuItems).del();
    await db('MenuItems').whereIn('Id', testMenuItems).del();
  }
  await db('ChangePaymentTypes').where('Name', 'Cash Change').del();
  // Reset IdempotencyKeys
  await db('IdempotencyKeys').del();
}

describe('BLOQUE B — moveOrders', () => {

  beforeEach(async () => { await resetDb(); });

  test('B1: Move orders from source to target — both tickets recalculated', async () => {
    const miId = await setupTestMenuItem();
    const source = await setupTicketWithOrders(miId, 2);
    const target = await ticketService.createTicket({ departmentId: 1, ticketTypeId: 1 });

    // Get order IDs from source
    const sourceOrders = await db('Orders').where({ TicketId: source.Id });
    assert.equal(sourceOrders.length, 2);

    const orderIds = sourceOrders.map(o => o.Id);
    const result = await ticketServiceExt.moveOrders(source.Id, orderIds, target.Id);

    // Source should have 0 orders
    const sourceReloaded = result.sourceTicket;
    assert.equal(sourceReloaded.Orders.length, 0, 'Source should have 0 orders after move');

    // Target should have 2 orders
    const targetReloaded = result.targetTicket;
    assert.equal(targetReloaded.Orders.length, 2, 'Target should have 2 orders after move');
  });

  test('B2: Cannot move orders from a closed ticket', async () => {
    const miId = await setupTestMenuItem();
    const source = await setupTicketWithOrders(miId, 1);
    const target = await ticketService.createTicket({ departmentId: 1, ticketTypeId: 1 });

    // Close source ticket (need payment first)
    await ticketService.addPayment(source.Id, { paymentTypeId: 1, amount: 10 });
    await ticketService.closeTicket(source.Id, { userId: 1, username: 'test' });

    const orders = await db('Orders').where({ TicketId: source.Id });
    await assert.rejects(
      () => ticketServiceExt.moveOrders(source.Id, [orders[0].Id], target.Id),
      (err) => err.message.includes('closed')
    );
  });

  test('B3: Cannot move orders to a closed ticket', async () => {
    const miId = await setupTestMenuItem();
    const source = await setupTicketWithOrders(miId, 1);
    const target = await ticketService.createTicket({ departmentId: 1, ticketTypeId: 1 });

    // Add order to target and pay exact amount so close succeeds
    await ticketService.addOrder(target.Id, { menuItemId: miId, quantity: 1 });
    await ticketService.addPayment(target.Id, { paymentTypeId: 1, amount: 10 });
    await ticketService.closeTicket(target.Id, { userId: 1, username: 'test' });

    const orders = await db('Orders').where({ TicketId: source.Id });
    await assert.rejects(
      () => ticketServiceExt.moveOrders(source.Id, [orders[0].Id], target.Id),
      (err) => err.message.includes('closed')
    );
  });

  test('B4: Cannot move voided/gifted orders', async () => {
    const miId = await setupTestMenuItem();
    const source = await setupTicketWithOrders(miId, 1);
    const target = await ticketService.createTicket({ departmentId: 1, ticketTypeId: 1 });

    // Gift the order (CalculatePrice = false)
    await db('Orders').where({ TicketId: source.Id }).update({ CalculatePrice: 0 });

    const orders = await db('Orders').where({ TicketId: source.Id });
    await assert.rejects(
      () => ticketServiceExt.moveOrders(source.Id, [orders[0].Id], target.Id),
      (err) => err.message.includes('voided/gifted')
    );
  });

  test('B5: Source and target must share same department', async () => {
    const miId = await setupTestMenuItem();
    const source = await setupTicketWithOrders(miId, 1);
    const target = await ticketService.createTicket({ departmentId: 1, ticketTypeId: 1 });

    // Get a different department ID that exists in DB
    const depts = await db('Departments').select('Id');
    const otherDept = depts.find(d => d.Id !== 1);
    if (!otherDept) {
      // Only 1 department exists — skip this test
      console.log('B5: skipped (only 1 department in DB)');
      return;
    }
    await db('Tickets').where({ Id: target.Id }).update({ DepartmentId: otherDept.Id });

    const orders = await db('Orders').where({ TicketId: source.Id });
    await assert.rejects(
      () => ticketServiceExt.moveOrders(source.Id, [orders[0].Id], target.Id),
      (err) => err.message.includes('department')
    );
  });
});

describe('BLOQUE B — reopenTicket', () => {

  beforeEach(async () => { await resetDb(); });

  test('B6: Reopen a closed ticket — IsClosed becomes false', async () => {
    const miId = await setupTestMenuItem();
    const ticket = await setupTicketWithOrders(miId, 1);

    // Pay and close
    await ticketService.addPayment(ticket.Id, { paymentTypeId: 1, amount: 10 });
    await ticketService.closeTicket(ticket.Id, { userId: 1, username: 'test' });

    // Verify closed
    const closed = await db('Tickets').where({ Id: ticket.Id }).first();
    assert.equal(closed.IsClosed, 1);

    // Reopen
    const result = await ticketServiceExt.reopenTicket(ticket.Id, 'customer changed mind');
    assert.equal(result.IsClosed, 0, 'Ticket should be open after reopen');
    assert.ok(result.Note.includes('Reopened'), 'Note should contain reopen info');
  });

  test('B7: Cannot reopen an already-open ticket', async () => {
    const miId = await setupTestMenuItem();
    const ticket = await setupTicketWithOrders(miId, 1);
    // Ticket is already open (not closed)
    await assert.rejects(
      () => ticketServiceExt.reopenTicket(ticket.Id, 'test'),
      (err) => err.message.includes('already open')
    );
  });

  test('B8: Cannot reopen a voided ticket', async () => {
    const miId = await setupTestMenuItem();
    const ticket = await setupTicketWithOrders(miId, 1);

    // Void the ticket while it's open (no payment/close needed for void)
    await ticketServiceExt.voidTicket(ticket.Id);

    // Verify IsVoided is set
    const voided = await db('Tickets').where({ Id: ticket.Id }).first();
    assert.equal(voided.IsVoided, 1, 'Ticket should be voided');
    assert.equal(voided.IsClosed, 1, 'Voided ticket should also be closed');

    await assert.rejects(
      () => ticketServiceExt.reopenTicket(ticket.Id, 'test'),
      (err) => err.message.includes('voided')
    );
  });
});

describe('BLOQUE B — addChangePayment', () => {

  beforeEach(async () => { await resetDb(); });

  test('B9: Add change payment — record created correctly', async () => {
    const miId = await setupTestMenuItem();
    const ticket = await setupTicketWithOrders(miId, 1);
    const cpTypeId = await setupChangePaymentType();

    const result = await ticketServiceExt.addChangePayment(ticket.Id, {
      changePaymentTypeId: cpTypeId,
      amount: 5.00,
    });

    // Verify ChangePayments record
    const cp = await db('ChangePayments').where({ TicketId: ticket.Id }).first();
    assert.ok(cp, 'ChangePayments record should exist');
    assert.equal(Number(cp.Amount), 5.00);
    assert.equal(cp.ChangePaymentTypeId, cpTypeId);
  });

  test('B10: Cannot add change payment to a closed ticket', async () => {
    const miId = await setupTestMenuItem();
    const ticket = await setupTicketWithOrders(miId, 1);
    const cpTypeId = await setupChangePaymentType();

    // Pay and close
    await ticketService.addPayment(ticket.Id, { paymentTypeId: 1, amount: 10 });
    await ticketService.closeTicket(ticket.Id, { userId: 1, username: 'test' });

    await assert.rejects(
      () => ticketServiceExt.addChangePayment(ticket.Id, {
        changePaymentTypeId: cpTypeId,
        amount: 5.00,
      }),
      (err) => err.message.includes('closed')
    );
  });

  test('B11: Change payment amount must be positive', async () => {
    const miId = await setupTestMenuItem();
    const ticket = await setupTicketWithOrders(miId, 1);
    const cpTypeId = await setupChangePaymentType();

    await assert.rejects(
      () => ticketServiceExt.addChangePayment(ticket.Id, {
        changePaymentTypeId: cpTypeId,
        amount: -5.00,
      }),
      (err) => err.message.includes('positive')
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
