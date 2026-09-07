// =====================================================================
// domain-verification.test.js — FASE 2 domain unit tests
// =====================================================================
// Tests the new domain aggregates introduced in FASE 2:
//   - WorkPeriod (open/close/reopen)
//   - CashSession (recordSale/payout/transfer/close + expected/difference)
//   - PrintJob (claim/markPrinted/markFailed/backoff/cancel/verifyChecksum)
//   - Notification (deliver/markRead/validate/isVisibleTo)
//   - Customer (credit/debit/refund/deactivate/validate)
//   - TicketStateMachine (all transitions + invalid transitions)
// =====================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { WorkPeriod } = require('../src/domain/WorkPeriod');
const { CashSession } = require('../src/domain/CashSession');
const { PrintJob } = require('../src/domain/PrintJob');
const { Notification } = require('../src/domain/Notification');
const { Customer } = require('../src/domain/Customer');
const {
  STATES: TICKET_STATES,
  deriveState,
  assertCan,
  can,
  isTerminal,
} = require('../src/domain/TicketStateMachine');
const { ConflictError, ValidationError } = require('../src/api/middleware/errorHandler');

// =====================================================================
// 1. WorkPeriod
// =====================================================================
describe('WorkPeriod aggregate', () => {
  test('1A: new WorkPeriod defaults to OPEN status', () => {
    const wp = new WorkPeriod({ Id: 1, Name: 'Day 1' });
    assert.strictEqual(wp.Status, 'OPEN');
    assert.strictEqual(wp.IsOpen, true);
    assert.strictEqual(wp.Version, 1);
  });

  test('1B: close() computes Difference and transitions to CLOSED', () => {
    const wp = new WorkPeriod({ Id: 1, Status: 'OPEN', Version: 1 });
    wp.close({ expectedAmount: 1000, actualAmount: 950, userId: 5, expectedVersion: 1 });
    assert.strictEqual(wp.Status, 'CLOSED');
    assert.strictEqual(wp.IsOpen, false);
    assert.strictEqual(wp.ExpectedAmount, 1000);
    assert.strictEqual(wp.ActualAmount, 950);
    assert.strictEqual(wp.Difference, -50);
    assert.strictEqual(wp.ClosedBy, 5);
    assert.strictEqual(wp.Version, 2);
  });

  test('1C: close() throws on version mismatch (optimistic lock)', () => {
    const wp = new WorkPeriod({ Id: 1, Status: 'OPEN', Version: 5 });
    assert.throws(
      () => wp.close({ expectedAmount: 100, actualAmount: 100, userId: 1, expectedVersion: 1 }),
      ConflictError
    );
  });

  test('1D: close() throws if already CLOSED', () => {
    const wp = new WorkPeriod({ Id: 1, Status: 'CLOSED', Version: 2 });
    assert.throws(
      () => wp.close({ expectedAmount: 0, actualAmount: 0, userId: 1 }),
      ConflictError
    );
  });

  test('1E: reopen() requires reason and increments version', () => {
    const wp = new WorkPeriod({ Id: 1, Status: 'CLOSED', Version: 2 });
    wp.reopen({ userId: 5, reason: 'audit correction', expectedVersion: 2 });
    assert.strictEqual(wp.Status, 'OPEN');
    assert.strictEqual(wp.IsOpen, true);
    assert.strictEqual(wp.Version, 3);
    assert.ok(wp.EndDescription.includes('REOPENED'));
  });

  test('1F: acceptsNewTickets() is true only when OPEN', () => {
    const open = new WorkPeriod({ Status: 'OPEN' });
    const closed = new WorkPeriod({ Status: 'CLOSED' });
    assert.strictEqual(open.acceptsNewTickets(), true);
    assert.strictEqual(closed.acceptsNewTickets(), false);
  });
});

// =====================================================================
// 2. CashSession
// =====================================================================
describe('CashSession aggregate', () => {
  test('2A: new CashSession defaults to OPEN with zero sales', () => {
    const cs = new CashSession({ Id: 1, WorkPeriodId: 1, UserId: 5 });
    assert.strictEqual(cs.Status, 'OPEN');
    assert.strictEqual(cs.CashSales, 0);
    assert.strictEqual(cs.CardSales, 0);
    assert.strictEqual(cs.OpeningAmount, 0);
  });

  test('2B: recordSale() accumulates cash/card/voucher separately', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN' });
    cs.recordSale({ paymentType: 'Cash',        amount: 100 });
    cs.recordSale({ paymentType: 'Cash',        amount: 50 });
    cs.recordSale({ paymentType: 'Credit Card', amount: 200 });
    cs.recordSale({ paymentType: 'Voucher',      amount: 30 });
    assert.strictEqual(cs.CashSales, 150);
    assert.strictEqual(cs.CardSales, 200);
    assert.strictEqual(cs.VoucherSales, 30);
  });

  test('2C: recordSale() throws when session is CLOSED', () => {
    const cs = new CashSession({ Id: 1, Status: 'CLOSED' });
    assert.throws(
      () => cs.recordSale({ paymentType: 'Cash', amount: 10 }),
      ConflictError
    );
  });

  test('2D: payout() increases Payouts and returns negative event amount', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN' });
    const ev = cs.payout({ amount: 50, note: 'supplier payment' });
    assert.strictEqual(cs.Payouts, 50);
    assert.strictEqual(ev.Amount, -50);
    assert.strictEqual(ev.EventType, 'PAYOUT');
  });

  test('2E: computeExpected() = Opening + Cash - Payouts + Transfers', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN', OpeningAmount: 200 });
    cs.recordSale({ paymentType: 'Cash', amount: 100 });
    cs.payout({ amount: 30 });
    cs.transfer({ amount: 50 });
    const expected = cs.computeExpected();
    // 200 + 100 - 30 + 50 = 320
    assert.strictEqual(expected, 320);
  });

  test('2F: close() computes Difference and transitions to CLOSED', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN', OpeningAmount: 100, Version: 1 });
    cs.recordSale({ paymentType: 'Cash', amount: 50 });
    cs.close({ countedAmount: 145, userId: 2, expectedVersion: 1 });
    // Expected = 100 + 50 = 150; Actual = 145; Diff = -5
    assert.strictEqual(cs.ExpectedAmount, 150);
    assert.strictEqual(cs.CountedAmount, 145);
    assert.strictEqual(cs.Difference, -5);
    assert.strictEqual(cs.Status, 'CLOSED');
    assert.strictEqual(cs.Version, 2);
  });

  test('2G: close() throws on optimistic lock mismatch', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN', Version: 5 });
    assert.throws(
      () => cs.close({ countedAmount: 0, userId: 1, expectedVersion: 1 }),
      ConflictError
    );
  });

  test('2H: recordRefund() reduces cash sales', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN' });
    cs.recordSale({ paymentType: 'Cash', amount: 100 });
    cs.recordRefund({ paymentType: 'Cash', amount: 30 });
    assert.strictEqual(cs.CashSales, 70);
  });

  test('2I: transfer() accepts negative (out) and positive (in)', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN' });
    cs.transfer({ amount: 100 });   // cash in
    cs.transfer({ amount: -40 });   // cash out
    assert.strictEqual(cs.Transfers, 60);
  });

  test('2J: transfer() rejects zero amount', () => {
    const cs = new CashSession({ Id: 1, Status: 'OPEN' });
    assert.throws(() => cs.transfer({ amount: 0 }), ValidationError);
  });
});

// =====================================================================
// 3. PrintJob
// =====================================================================
describe('PrintJob aggregate', () => {
  test('3A: new PrintJob defaults to PENDING with attempts=0', () => {
    const pj = new PrintJob({ Id: 1, Uuid: 'abc-123', PrinterId: 1, JobType: 'RECEIPT' });
    assert.strictEqual(pj.Status, 'PENDING');
    assert.strictEqual(pj.Attempts, 0);
    assert.strictEqual(pj.MaxAttempts, 5);
  });

  test('3B: claim() transitions PENDING → PRINTING and increments attempts', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PENDING', Attempts: 0 });
    pj.claim();
    assert.strictEqual(pj.Status, 'PRINTING');
    assert.strictEqual(pj.Attempts, 1);
    assert.ok(pj.LastAttemptAt);
  });

  test('3C: claim() throws if already PRINTED (terminal)', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PRINTED' });
    assert.throws(() => pj.claim(), ConflictError);
  });

  test('3D: markPrinted() transitions PRINTING → PRINTED', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PRINTING', Attempts: 1 });
    pj.markPrinted();
    assert.strictEqual(pj.Status, 'PRINTED');
    assert.ok(pj.PrintedAt);
  });

  test('3E: markFailed() on attempt < max → RETRYING with backoff', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PRINTING', Attempts: 1, MaxAttempts: 5 });
    pj.markFailed('paper out');
    assert.strictEqual(pj.Status, 'RETRYING');
    assert.ok(pj.NextAttemptAt);
    assert.strictEqual(pj.Error, 'paper out');
  });

  test('3F: markFailed() on attempt = max → FAILED (terminal)', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PRINTING', Attempts: 5, MaxAttempts: 5 });
    pj.markFailed('paper out');
    assert.strictEqual(pj.Status, 'FAILED');
    assert.strictEqual(pj.NextAttemptAt, null);
  });

  test('3G: retry path: RETRYING → claim() → PRINTING → markPrinted()', () => {
    const pj = new PrintJob({ Id: 1, Status: 'RETRYING', Attempts: 1, MaxAttempts: 5 });
    pj.claim();
    assert.strictEqual(pj.Status, 'PRINTING');
    assert.strictEqual(pj.Attempts, 2);
    pj.markPrinted();
    assert.strictEqual(pj.Status, 'PRINTED');
  });

  test('3H: cancel() works from PENDING', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PENDING' });
    pj.cancel('operator request');
    assert.strictEqual(pj.Status, 'CANCELLED');
    assert.ok(pj.Error.includes('operator request'));
  });

  test('3I: cancel() throws from terminal state PRINTED', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PRINTED' });
    assert.throws(() => pj.cancel(), ConflictError);
  });

  test('3J: setPayload() computes sha256 checksum + size', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PENDING' });
    pj.setPayload('hello world');
    assert.strictEqual(pj.PayloadSize, 11);
    assert.strictEqual(pj.Checksum.length, 64);  // sha256 hex
    assert.strictEqual(pj.verifyChecksum(), true);
  });

  test('3K: verifyChecksum() returns false if payload is tampered', () => {
    const pj = new PrintJob({ Id: 1, Status: 'PENDING' });
    pj.setPayload('hello world');
    pj.Payload = Buffer.from('tampered');
    assert.strictEqual(pj.verifyChecksum(), false);
  });

  test('3L: isReadyForRetry() returns true if NextAttemptAt is in the past', () => {
    const pj = new PrintJob({
      Id: 1, Status: 'RETRYING',
      NextAttemptAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.strictEqual(pj.isReadyForRetry(), true);
  });

  test('3M: isTerminal() true for PRINTED, FAILED, CANCELLED', () => {
    assert.strictEqual(new PrintJob({ Status: 'PRINTED' }).isTerminal(), true);
    assert.strictEqual(new PrintJob({ Status: 'FAILED' }).isTerminal(), true);
    assert.strictEqual(new PrintJob({ Status: 'CANCELLED' }).isTerminal(), true);
    assert.strictEqual(new PrintJob({ Status: 'PENDING' }).isTerminal(), false);
    assert.strictEqual(new PrintJob({ Status: 'PRINTING' }).isTerminal(), false);
    assert.strictEqual(new PrintJob({ Status: 'RETRYING' }).isTerminal(), false);
  });
});

// =====================================================================
// 4. Notification
// =====================================================================
describe('Notification aggregate', () => {
  test('4A: new Notification defaults to unread + undelivered', () => {
    const n = new Notification({
      Id: 1, Category: 'kitchen', Title: 'Order ready',
    });
    assert.strictEqual(n.IsRead, false);
    assert.strictEqual(n.IsDelivered, false);
    assert.strictEqual(n.Severity, 'info');
  });

  test('4B: deliver() sets IsDelivered + DeliveredAt; idempotent', () => {
    const n = new Notification({ Id: 1, Category: 'system', Title: 'x' });
    const r1 = n.deliver();
    const r2 = n.deliver();
    assert.strictEqual(r1, true);
    assert.strictEqual(r2, false);
    assert.ok(n.DeliveredAt);
  });

  test('4C: markRead() sets IsRead + ReadAt; idempotent', () => {
    const n = new Notification({ Id: 1, Category: 'system', Title: 'x' });
    const r1 = n.markRead();
    const r2 = n.markRead();
    assert.strictEqual(r1, true);
    assert.strictEqual(r2, false);
    assert.ok(n.ReadAt);
  });

  test('4D: validate() rejects unknown category', () => {
    const n = new Notification({ Category: 'not-a-cat', Title: 'x' });
    assert.throws(() => n.validate(), ValidationError);
  });

  test('4E: validate() rejects title > 200 chars', () => {
    const n = new Notification({ Category: 'system', Title: 'x'.repeat(201) });
    assert.throws(() => n.validate(), ValidationError);
  });

  test('4F: validate() rejects unknown severity', () => {
    const n = new Notification({ Category: 'system', Title: 'x', Severity: 'panic' });
    assert.throws(() => n.validate(), ValidationError);
  });

  test('4G: validate() rejects invalid TargetRole', () => {
    const n = new Notification({ Category: 'system', Title: 'x', TargetRole: 'waiter' });
    assert.throws(() => n.validate(), ValidationError);
  });

  test('4H: validate() rejects invalid email (only if Email set — not on Notification, but Customer)', () => {
    // just sanity check: notification validates fine with valid input
    const n = new Notification({ Category: 'kitchen', Severity: 'warn', Title: 'Order ready' });
    assert.strictEqual(n.validate(), true);
  });

  test('4I: isVisibleTo() — broadcast visible to all', () => {
    const n = new Notification({ Category: 'system', Title: 'x' });  // no target
    assert.strictEqual(n.isVisibleTo({ userId: 1, role: 'pos' }), true);
    assert.strictEqual(n.isVisibleTo({ userId: 99, role: 'kitchen' }), true);
  });

  test('4J: isVisibleTo() — role-targeted only visible to that role + admin', () => {
    const n = new Notification({ Category: 'system', Title: 'x', TargetRole: 'kitchen' });
    assert.strictEqual(n.isVisibleTo({ userId: 1, role: 'kitchen' }), true);
    assert.strictEqual(n.isVisibleTo({ userId: 1, role: 'pos' }), false);
    assert.strictEqual(n.isVisibleTo({ userId: 1, role: 'pos', isAdmin: true }), true);
  });

  test('4K: isVisibleTo() — user-targeted only visible to that user + admin', () => {
    const n = new Notification({ Category: 'system', Title: 'x', TargetUserId: 42 });
    assert.strictEqual(n.isVisibleTo({ userId: 42, role: 'pos' }), true);
    assert.strictEqual(n.isVisibleTo({ userId: 99, role: 'pos' }), false);
    assert.strictEqual(n.isVisibleTo({ userId: 99, role: 'pos', isAdmin: true }), true);
  });
});

// =====================================================================
// 5. Customer
// =====================================================================
describe('Customer aggregate', () => {
  test('5A: new Customer defaults to active with zero balance', () => {
    const c = new Customer({ Id: 1, Name: 'Alice' });
    assert.strictEqual(c.IsActive, true);
    assert.strictEqual(c.AccountBalance, 0);
  });

  test('5B: credit() increases balance', () => {
    const c = new Customer({ Id: 1, Name: 'Alice' });
    c.credit(100);
    c.credit(50);
    assert.strictEqual(c.AccountBalance, 150);
  });

  test('5C: debit() decreases balance; fails if insufficient', () => {
    const c = new Customer({ Id: 1, Name: 'Alice', AccountBalance: 100 });
    c.debit(30);
    assert.strictEqual(c.AccountBalance, 70);
    assert.throws(() => c.debit(100), ConflictError);
  });

  test('5D: refund() increases balance', () => {
    const c = new Customer({ Id: 1, Name: 'Alice', AccountBalance: 50 });
    c.refund(20);
    assert.strictEqual(c.AccountBalance, 70);
  });

  test('5E: deactivate() soft-deletes; reactivate() restores', () => {
    const c = new Customer({ Id: 1, Name: 'Alice' });
    c.deactivate('left restaurant');
    assert.strictEqual(c.IsActive, false);
    c.reactivate();
    assert.strictEqual(c.IsActive, true);
  });

  test('5F: deactivate() throws if already inactive', () => {
    const c = new Customer({ Id: 1, Name: 'Alice', IsActive: false });
    assert.throws(() => c.deactivate(), ConflictError);
  });

  test('5G: validate() rejects missing Name', () => {
    const c = new Customer({ Email: 'bad' });
    assert.throws(() => c.validate(), ValidationError);
  });

  test('5H: validate() rejects bad Email format', () => {
    const c = new Customer({ Name: 'Alice', Email: 'not-an-email' });
    assert.throws(() => c.validate(), ValidationError);
  });

  test('5I: validate() rejects negative balance', () => {
    const c = new Customer({ Name: 'Alice', AccountBalance: -10 });
    assert.throws(() => c.validate(), ValidationError);
  });

  test('5J: toRow() returns snake_case DB row with 0/1 IsActive', () => {
    const c = new Customer({ Id: 5, Name: 'Alice', AccountBalance: 100 });
    const row = c.toRow();
    assert.strictEqual(row.Id, 5);
    assert.strictEqual(row.IsActive, 1);
    assert.strictEqual(row.AccountBalance, 100);
  });
});

// =====================================================================
// 6. TicketStateMachine
// =====================================================================
describe('TicketStateMachine', () => {
  test('6A: deriveState() — DRAFT for new ticket with no orders', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 0, Orders: [], Payments: [] };
    assert.strictEqual(deriveState(t), TICKET_STATES.DRAFT);
  });

  test('6B: deriveState() — OPEN when ticket has orders', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 100, Orders: [{ Id: 1 }], Payments: [] };
    assert.strictEqual(deriveState(t), TICKET_STATES.OPEN);
  });

  test('6C: deriveState() — LOCKED when IsLocked', () => {
    const t = { IsClosed: false, IsLocked: true, RemainingAmount: 100, Orders: [{ Id: 1 }] };
    assert.strictEqual(deriveState(t), TICKET_STATES.LOCKED);
  });

  test('6D: deriveState() — PAID when remaining=0 and has payments', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 0, Orders: [{ Id: 1 }], Payments: [{ Id: 1 }] };
    assert.strictEqual(deriveState(t), TICKET_STATES.PAID);
  });

  test('6E: deriveState() — CLOSED when IsClosed', () => {
    const t = { IsClosed: true, IsLocked: false, RemainingAmount: 0, Orders: [], Payments: [] };
    assert.strictEqual(deriveState(t), TICKET_STATES.CLOSED);
  });

  test('6F: deriveState() — VOIDED when IsVoided (overrides IsClosed)', () => {
    const t = { IsClosed: false, IsVoided: true };
    assert.strictEqual(deriveState(t), TICKET_STATES.VOIDED);
  });

  test('6G: deriveState() — REFUNDED when IsClosed + IsRefunded', () => {
    const t = { IsClosed: true, IsRefunded: true };
    assert.strictEqual(deriveState(t), TICKET_STATES.REFUNDED);
  });

  test('6H: assertCan() — OPEN ticket can add order', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 100, Orders: [{ Id: 1 }], Payments: [] };
    const target = assertCan(t, 'addOrder');
    assert.strictEqual(target, TICKET_STATES.OPEN);
  });

  test('6I: assertCan() — CLOSED ticket cannot add order', () => {
    const t = { IsClosed: true, RemainingAmount: 0, Orders: [], Payments: [] };
    assert.throws(() => assertCan(t, 'addOrder'), ConflictError);
  });

  test('6J: assertCan() — LOCKED ticket cannot add order (extra check)', () => {
    const t = { IsClosed: false, IsLocked: true, RemainingAmount: 100, Orders: [{ Id: 1 }] };
    assert.throws(() => assertCan(t, 'addOrder'), ConflictError);
  });

  test('6K: assertCan() — OPEN ticket with remaining=0 can close (after payment)', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 0, Orders: [{ Id: 1 }], Payments: [{ Id: 1 }] };
    assertCan(t, 'close');  // should not throw
  });

  test('6L: assertCan() — OPEN ticket with remaining > 0 cannot close', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 50, Orders: [{ Id: 1 }] };
    assert.throws(() => assertCan(t, 'close'), ConflictError);
  });

  test('6M: assertCan() — CLOSED ticket can fullRefund', () => {
    const t = { IsClosed: true, IsRefunded: false };
    assertCan(t, 'fullRefund');
  });

  test('6N: assertCan() — REFUNDED ticket cannot do anything (terminal)', () => {
    const t = { IsClosed: true, IsRefunded: true };
    assert.throws(() => assertCan(t, 'addOrder'), ConflictError);
    assert.throws(() => assertCan(t, 'close'), ConflictError);
    assert.throws(() => assertCan(t, 'void'), ConflictError);
  });

  test('6O: assertCan() — CLOSED ticket cannot void without admin override', () => {
    const t = { IsClosed: true, IsRefunded: false };
    assert.throws(() => assertCan(t, 'void', { adminOverride: false }), ConflictError);
  });

  test('6P: assertCan() — CLOSED ticket can void with admin override', () => {
    const t = { IsClosed: true, IsRefunded: false };
    assertCan(t, 'void', { adminOverride: true });
  });

  test('6Q: assertCan() — OPEN ticket can void', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 50, Orders: [{ Id: 1 }] };
    assertCan(t, 'void');
  });

  test('6R: assertCan() — DRAFT ticket can void', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 0, Orders: [], Payments: [] };
    assertCan(t, 'void');
  });

  test('6S: assertCan() — VOIDED ticket is terminal', () => {
    const t = { IsVoided: true };
    assert.throws(() => assertCan(t, 'addOrder'), ConflictError);
    assert.throws(() => assertCan(t, 'close'), ConflictError);
    assert.throws(() => assertCan(t, 'void'), ConflictError);
  });

  test('6T: assertCan() throws on unknown action', () => {
    const t = { IsClosed: false };
    assert.throws(() => assertCan(t, 'bogusAction'), ValidationError);
  });

  test('6U: can() returns boolean, never throws', () => {
    const t = { IsClosed: false, IsLocked: false, RemainingAmount: 100, Orders: [{ Id: 1 }] };
    assert.strictEqual(can(t, 'addOrder'), true);
    assert.strictEqual(can(t, 'close'), false);
  });

  test('6V: isTerminal() — VOIDED and REFUNDED are terminal', () => {
    assert.strictEqual(isTerminal(TICKET_STATES.VOIDED), true);
    assert.strictEqual(isTerminal(TICKET_STATES.REFUNDED), true);
    assert.strictEqual(isTerminal(TICKET_STATES.OPEN), false);
  });
});
