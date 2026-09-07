// =====================================================================
// CashSessionService.js — Service for WorkPeriod + CashSession (FASE 3)
// =====================================================================
// Wires the WorkPeriod and CashSession aggregates (FASE 2) to the
// database and exposes business operations:
//
//   WorkPeriod:
//     - openWorkPeriod(userId, openingAmount, description)
//     - closeWorkPeriod(userId, expectedAmount, actualAmount, description)
//     - getCurrentWorkPeriod()  // returns the OPEN one or null
//     - reopenWorkPeriod(userId, reason)
//
//   CashSession:
//     - openCashSession(userId, terminalId, openingAmount)
//     - closeCashSession(userId, sessionId, countedAmount, note)
//     - getCurrentCashSession(terminalId)
//     - recordSale(sessionId, { paymentType, amount, ticketId, paymentId,
//                                idempotencyKey })
//     - recordRefund(...)
//     - payout(sessionId, { amount, note, idempotencyKey })
//     - transfer(sessionId, { amount, note, idempotencyKey })
//
// All monetary operations run inside a Knex transaction. Every state
// change writes a row to CashSessionEvents (the ledger).
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { WorkPeriod } = require('../../domain/WorkPeriod');
const { CashSession, EVENT_TYPES } = require('../../domain/CashSession');
const {
  NotFoundError, ConflictError, ValidationError,
} = require('../middleware/errorHandler');
const { writeAuditLog } = require('../middleware/auditLog');

// ---------------------------------------------------------------------
// WorkPeriod
// ---------------------------------------------------------------------

/**
 * Get the currently OPEN WorkPeriod (or null).
 */
async function getCurrentWorkPeriod() {
  const row = await db('WorkPeriods').where({ IsOpen: 1, Status: 'OPEN' }).first();
  return row ? new WorkPeriod(row) : null;
}

/**
 * Open a new work period. Fails if another one is already OPEN.
 */
async function openWorkPeriod({ userId, openingAmount = 0, description = null }) {
  const existing = await getCurrentWorkPeriod();
  if (existing) {
    throw new ConflictError(
      `WorkPeriod ${existing.Id} is already OPEN. Close it before opening a new one.`,
      { openWorkPeriodId: existing.Id }
    );
  }
  if (typeof openingAmount !== 'number' || openingAmount < 0) {
    throw new ValidationError('openingAmount must be a non-negative number');
  }
  const now = new Date().toISOString();
  const [id] = await db('WorkPeriods').insert({
    Name: `Work Period ${now}`,
    StartDate: now,
    EndDate: now,  // schema requires NOT NULL; will be overwritten on close
    StartDescription: description,
    EndDescription: null,
    OpenedBy: userId,
    ClosedBy: null,
    OpeningAmount: openingAmount,
    ClosingAmount: null,
    ExpectedAmount: null,
    ActualAmount: null,
    Difference: null,
    Status: 'OPEN',
    IsOpen: 1,
    Version: 1,
  });
  const row = await db('WorkPeriods').where({ Id: id }).first();
  await writeAuditLog({
    userId, username: null,
    action: 'workperiod.open',
    entityType: 'WorkPeriod',
    entityId: id,
    after: row,
    details: { openingAmount, description },
  });
  return new WorkPeriod(row);
}

/**
 * Close the currently OPEN work period.
 */
async function closeWorkPeriod({ userId, expectedAmount, actualAmount, description = null }) {
  const current = await getCurrentWorkPeriod();
  if (!current) {
    throw new ConflictError('No open WorkPeriod to close');
  }
  current.close({ expectedAmount, actualAmount, userId, description, expectedVersion: current.Version });

  await db('WorkPeriods').where({ Id: current.Id, Version: current.Version - 1 }).update({
    EndDate: current.EndDate,
    EndDescription: current.EndDescription,
    ClosedBy: current.ClosedBy,
    ClosingAmount: current.ClosingAmount,
    ExpectedAmount: current.ExpectedAmount,
    ActualAmount: current.ActualAmount,
    Difference: current.Difference,
    Status: 'CLOSED',
    IsOpen: 0,
    Version: current.Version,
  });
  await writeAuditLog({
    userId, username: null,
    action: 'workperiod.close',
    entityType: 'WorkPeriod',
    entityId: current.Id,
    before: { Status: 'OPEN' },
    after: current.toRow(),
    details: { expectedAmount, actualAmount, difference: current.Difference },
  });
  return current;
}

/**
 * Reopen a previously-closed work period. Admin-only (caller must check).
 */
async function reopenWorkPeriod({ workPeriodId, userId, reason }) {
  const row = await db('WorkPeriods').where({ Id: workPeriodId }).first();
  if (!row) throw new NotFoundError(`WorkPeriod ${workPeriodId} not found`);
  const wp = new WorkPeriod(row);
  wp.reopen({ userId, reason, expectedVersion: wp.Version });

  await db('WorkPeriods').where({ Id: wp.Id, Version: wp.Version - 1 }).update({
    EndDate: null,
    EndDescription: wp.EndDescription,
    Status: 'OPEN',
    IsOpen: 1,
    Version: wp.Version,
  });
  await writeAuditLog({
    userId, username: null,
    action: 'workperiod.reopen',
    entityType: 'WorkPeriod',
    entityId: wp.Id,
    before: row,
    after: wp.toRow(),
    details: { reason },
  });
  return wp;
}

// ---------------------------------------------------------------------
// CashSession
// ---------------------------------------------------------------------

/**
 * Get the OPEN CashSession for a terminal (or null).
 */
async function getCurrentCashSession(terminalId = 0) {
  const row = await db('CashSessions')
    .where({ TerminalId: terminalId, Status: 'OPEN' })
    .first();
  return row ? new CashSession(row) : null;
}

/**
 * Open a new cash session for a terminal within the current work period.
 */
async function openCashSession({ userId, terminalId = 0, openingAmount = 0, workPeriodId = null }) {
  const existing = await getCurrentCashSession(terminalId);
  if (existing) {
    throw new ConflictError(
      `Terminal ${terminalId} already has an OPEN cash session (${existing.Id})`,
      { openSessionId: existing.Id }
    );
  }
  let wpId = workPeriodId;
  if (!wpId) {
    const wp = await getCurrentWorkPeriod();
    if (!wp) {
      throw new ConflictError('No open WorkPeriod. Open a work period first.');
    }
    wpId = wp.Id;
  }
  if (typeof openingAmount !== 'number' || openingAmount < 0) {
    throw new ValidationError('openingAmount must be a non-negative number');
  }

  const [sessionId] = await db('CashSessions').insert({
    WorkPeriodId: wpId,
    TerminalId: terminalId,
    UserId: userId,
    ClosedByUserId: null,
    OpenedAt: new Date().toISOString(),
    ClosedAt: null,
    OpeningAmount: openingAmount,
    CashSales: 0,
    CardSales: 0,
    VoucherSales: 0,
    Payouts: 0,
    Transfers: 0,
    ExpectedAmount: openingAmount,
    CountedAmount: null,
    Difference: null,
    Status: 'OPEN',
    Version: 1,
    Notes: null,
  });

  // OPEN event in the ledger
  await db('CashSessionEvents').insert({
    CashSessionId: sessionId,
    At: new Date().toISOString(),
    EventType: EVENT_TYPES.OPEN,
    PaymentType: null,
    Amount: openingAmount,
    TicketId: null,
    PaymentId: null,
    UserId: userId,
    Note: 'Session opened',
    IdempotencyKey: null,
  });

  const row = await db('CashSessions').where({ Id: sessionId }).first();
  await writeAuditLog({
    userId, username: null,
    action: 'cashsession.open',
    entityType: 'CashSession',
    entityId: sessionId,
    after: row,
    details: { terminalId, openingAmount, workPeriodId: wpId },
  });
  return new CashSession(row);
}

/**
 * Record a sale on a cash session. Idempotent via idempotencyKey.
 */
async function recordSale({ sessionId, paymentType, amount, ticketId = null, paymentId = null, userId, idempotencyKey = null }) {
  if (idempotencyKey) {
    const existing = await db('CashSessionEvents')
      .where({ IdempotencyKey: idempotencyKey })
      .first();
    if (existing) return { duplicate: true, event: existing };
  }
  const row = await db('CashSessions').where({ Id: sessionId }).first();
  if (!row) throw new NotFoundError(`CashSession ${sessionId} not found`);
  const cs = new CashSession(row);
  const event = cs.recordSale({ paymentType, amount, ticketId, paymentId, idempotencyKey });

  await db.transaction(async (trx) => {
    await trx('CashSessionEvents').insert({
      CashSessionId: sessionId,
      At: new Date().toISOString(),
      EventType: event.EventType,
      PaymentType: event.PaymentType,
      Amount: event.Amount,
      TicketId: event.TicketId,
      PaymentId: event.PaymentId,
      UserId: userId,
      Note: null,
      IdempotencyKey: idempotencyKey,
    });
    await trx('CashSessions').where({ Id: sessionId, Version: cs.Version - 1 }).update({
      CashSales: cs.CashSales,
      CardSales: cs.CardSales,
      VoucherSales: cs.VoucherSales,
      Version: cs.Version,
    });
  });
  return { duplicate: false, event };
}

/**
 * Record a refund on a cash session. Idempotent via idempotencyKey.
 */
async function recordRefund({ sessionId, paymentType, amount, ticketId = null, userId, idempotencyKey = null }) {
  if (idempotencyKey) {
    const existing = await db('CashSessionEvents')
      .where({ IdempotencyKey: idempotencyKey })
      .first();
    if (existing) return { duplicate: true, event: existing };
  }
  const row = await db('CashSessions').where({ Id: sessionId }).first();
  if (!row) throw new NotFoundError(`CashSession ${sessionId} not found`);
  const cs = new CashSession(row);
  const event = cs.recordRefund({ paymentType, amount, ticketId, idempotencyKey });

  await db.transaction(async (trx) => {
    await trx('CashSessionEvents').insert({
      CashSessionId: sessionId,
      At: new Date().toISOString(),
      EventType: event.EventType,
      PaymentType: event.PaymentType,
      Amount: event.Amount,
      TicketId: event.TicketId,
      PaymentId: null,
      UserId: userId,
      Note: null,
      IdempotencyKey: idempotencyKey,
    });
    await trx('CashSessions').where({ Id: sessionId, Version: cs.Version - 1 }).update({
      CashSales: cs.CashSales,
      Version: cs.Version,
    });
  });
  return { duplicate: false, event };
}

/**
 * Cash payout from a session.
 */
async function payout({ sessionId, amount, note = null, userId, idempotencyKey = null }) {
  if (idempotencyKey) {
    const existing = await db('CashSessionEvents')
      .where({ IdempotencyKey: idempotencyKey })
      .first();
    if (existing) return { duplicate: true, event: existing };
  }
  const row = await db('CashSessions').where({ Id: sessionId }).first();
  if (!row) throw new NotFoundError(`CashSession ${sessionId} not found`);
  const cs = new CashSession(row);
  const event = cs.payout({ amount, note, idempotencyKey });

  await db.transaction(async (trx) => {
    await trx('CashSessionEvents').insert({
      CashSessionId: sessionId,
      At: new Date().toISOString(),
      EventType: event.EventType,
      PaymentType: null,
      Amount: event.Amount,
      TicketId: null,
      PaymentId: null,
      UserId: userId,
      Note: note,
      IdempotencyKey: idempotencyKey,
    });
    await trx('CashSessions').where({ Id: sessionId, Version: cs.Version - 1 }).update({
      Payouts: cs.Payouts,
      Version: cs.Version,
    });
  });
  await writeAuditLog({
    userId, username: null,
    action: 'cashsession.payout',
    entityType: 'CashSession',
    entityId: sessionId,
    after: cs.toRow(),
    details: { amount, note },
  });
  return { duplicate: false, event };
}

/**
 * Cash transfer in/out.
 */
async function transfer({ sessionId, amount, note = null, userId, idempotencyKey = null }) {
  if (idempotencyKey) {
    const existing = await db('CashSessionEvents')
      .where({ IdempotencyKey: idempotencyKey })
      .first();
    if (existing) return { duplicate: true, event: existing };
  }
  const row = await db('CashSessions').where({ Id: sessionId }).first();
  if (!row) throw new NotFoundError(`CashSession ${sessionId} not found`);
  const cs = new CashSession(row);
  const event = cs.transfer({ amount, note, idempotencyKey });

  await db.transaction(async (trx) => {
    await trx('CashSessionEvents').insert({
      CashSessionId: sessionId,
      At: new Date().toISOString(),
      EventType: event.EventType,
      PaymentType: null,
      Amount: event.Amount,
      TicketId: null,
      PaymentId: null,
      UserId: userId,
      Note: note,
      IdempotencyKey: idempotencyKey,
    });
    await trx('CashSessions').where({ Id: sessionId, Version: cs.Version - 1 }).update({
      Transfers: cs.Transfers,
      Version: cs.Version,
    });
  });
  return { duplicate: false, event };
}

/**
 * Close a cash session. Computes Difference.
 */
async function closeCashSession({ sessionId, userId, countedAmount, note = null }) {
  const row = await db('CashSessions').where({ Id: sessionId }).first();
  if (!row) throw new NotFoundError(`CashSession ${sessionId} not found`);
  const cs = new CashSession(row);
  const event = cs.close({ countedAmount, userId, note, expectedVersion: cs.Version });

  await db.transaction(async (trx) => {
    await trx('CashSessionEvents').insert({
      CashSessionId: sessionId,
      At: new Date().toISOString(),
      EventType: event.EventType,
      PaymentType: null,
      Amount: event.Amount,
      TicketId: null,
      PaymentId: null,
      UserId: userId,
      Note: note,
      IdempotencyKey: null,
    });
    await trx('CashSessions').where({ Id: sessionId, Version: cs.Version - 1 }).update({
      ClosedByUserId: cs.ClosedByUserId,
      ClosedAt: cs.ClosedAt,
      ExpectedAmount: cs.ExpectedAmount,
      CountedAmount: cs.CountedAmount,
      Difference: cs.Difference,
      Status: cs.Status,
      Notes: cs.Notes,
      Version: cs.Version,
    });
  });
  await writeAuditLog({
    userId, username: null,
    action: 'cashsession.close',
    entityType: 'CashSession',
    entityId: sessionId,
    before: row,
    after: cs.toRow(),
    details: { countedAmount, difference: cs.Difference },
  });
  return cs;
}

/**
 * Get the ledger (events) for a cash session.
 */
async function getCashSessionEvents(sessionId) {
  return db('CashSessionEvents')
    .where({ CashSessionId: sessionId })
    .orderBy('At', 'asc');
}

module.exports = {
  // WorkPeriod
  getCurrentWorkPeriod,
  openWorkPeriod,
  closeWorkPeriod,
  reopenWorkPeriod,
  // CashSession
  getCurrentCashSession,
  openCashSession,
  closeCashSession,
  recordSale,
  recordRefund,
  payout,
  transfer,
  getCashSessionEvents,
};
