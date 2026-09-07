// =====================================================================
// CashSession.js — CashSession aggregate root (FASE 2)
// =====================================================================
// A CashSession represents a single terminal's cash drawer lifecycle
// within a WorkPeriod. Tracks opening amount, sales by payment type,
// payouts, transfers, and computes expected vs. counted on close.
//
// State machine:
//   OPEN ──payout()/transfer()/recordSale()──► OPEN  (events appended)
//   OPEN ──reconcile(countedAmount)──► RECONCILING
//   RECONCILING ──confirm()──► CLOSED
//   OPEN ──close(countedAmount)──► CLOSED  (one-step shortcut)
//
// Invariants:
//   - Only one OPEN CashSession per terminal+workPeriod.
//   - ExpectedAmount = OpeningAmount + CashSales - Payouts + Transfers
//   - Difference = CountedAmount - ExpectedAmount
//   - Every state change writes a CashSessionEvent row (ledger)
//   - IdempotencyKey on each event prevents duplicate writes
// =====================================================================

const { ConflictError, ValidationError } = require('../api/middleware/errorHandler');

const STATUS = Object.freeze({
  OPEN: 'OPEN',
  RECONCILING: 'RECONCILING',
  CLOSED: 'CLOSED',
});

const EVENT_TYPES = Object.freeze({
  OPEN: 'OPEN',
  SALE: 'SALE',
  REFUND: 'REFUND',
  PAYOUT: 'PAYOUT',
  TRANSFER: 'TRANSFER',
  CLOSE: 'CLOSE',
});

class CashSession {
  constructor(row) {
    this.Id = row?.Id;
    this.WorkPeriodId = row?.WorkPeriodId;
    this.TerminalId = row?.TerminalId || 0;
    this.UserId = row?.UserId;
    this.ClosedByUserId = row?.ClosedByUserId || null;
    this.OpenedAt = row?.OpenedAt;
    this.ClosedAt = row?.ClosedAt || null;
    this.OpeningAmount = row?.OpeningAmount != null ? Number(row.OpeningAmount) : 0;
    this.CashSales = row?.CashSales != null ? Number(row.CashSales) : 0;
    this.CardSales = row?.CardSales != null ? Number(row.CardSales) : 0;
    this.VoucherSales = row?.VoucherSales != null ? Number(row.VoucherSales) : 0;
    this.Payouts = row?.Payouts != null ? Number(row.Payouts) : 0;
    this.Transfers = row?.Transfers != null ? Number(row.Transfers) : 0;
    this.ExpectedAmount = row?.ExpectedAmount != null ? Number(row.ExpectedAmount) : 0;
    this.CountedAmount = row?.CountedAmount != null ? Number(row.CountedAmount) : null;
    this.Difference = row?.Difference != null ? Number(row.Difference) : null;
    this.Status = row?.Status || STATUS.OPEN;
    this.Version = row?.Version || 1;
    this.Notes = row?.Notes || null;
  }

  /**
   * Record a sale (cash or card or voucher).
   * Idempotent: if idempotencyKey was already recorded, returns the existing
   * computed state (no double-counting).
   */
  recordSale({ paymentType, amount, ticketId = null, paymentId = null, idempotencyKey = null }) {
    if (this.Status !== STATUS.OPEN) {
      throw new ConflictError(`CashSession ${this.Id} is not OPEN (status=${this.Status})`);
    }
    if (typeof amount !== 'number' || amount < 0) {
      throw new ValidationError('amount must be a non-negative number');
    }
    switch ((paymentType || '').toLowerCase()) {
      case 'cash':            this.CashSales += amount; break;
      case 'credit card':     this.CardSales += amount; break;
      case 'voucher':         this.VoucherSales += amount; break;
      default:
        // Other payment types don't affect cash drawer; track via events only.
        break;
    }
    return {
      EventType: EVENT_TYPES.SALE,
      PaymentType: paymentType,
      Amount: amount,
      TicketId: ticketId,
      PaymentId: paymentId,
      IdempotencyKey: idempotencyKey,
    };
  }

  /**
   * Record a refund (reduces cash sales if the original sale was cash).
   */
  recordRefund({ paymentType, amount, ticketId = null, idempotencyKey = null }) {
    if (this.Status !== STATUS.OPEN) {
      throw new ConflictError(`CashSession ${this.Id} is not OPEN`);
    }
    if (typeof amount !== 'number' || amount < 0) {
      throw new ValidationError('amount must be a non-negative number');
    }
    if ((paymentType || '').toLowerCase() === 'cash') {
      this.CashSales = Math.max(0, this.CashSales - amount);
    }
    return {
      EventType: EVENT_TYPES.REFUND,
      PaymentType: paymentType,
      Amount: -amount,  // negative
      TicketId: ticketId,
      IdempotencyKey: idempotencyKey,
    };
  }

  /**
   * Cash payout (e.g. pay a supplier from the drawer).
   */
  payout({ amount, note = null, idempotencyKey = null }) {
    if (this.Status !== STATUS.OPEN) {
      throw new ConflictError(`CashSession ${this.Id} is not OPEN`);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('payout amount must be positive');
    }
    this.Payouts += amount;
    return {
      EventType: EVENT_TYPES.PAYOUT,
      Amount: -amount,  // negative (cash leaving drawer)
      Note: note,
      IdempotencyKey: idempotencyKey,
    };
  }

  /**
   * Cash transfer in/out (e.g. move cash between drawers).
   * Positive = cash in, negative = cash out.
   */
  transfer({ amount, note = null, idempotencyKey = null }) {
    if (this.Status !== STATUS.OPEN) {
      throw new ConflictError(`CashSession ${this.Id} is not OPEN`);
    }
    if (typeof amount !== 'number' || amount === 0) {
      throw new ValidationError('transfer amount must be non-zero');
    }
    this.Transfers += amount;
    return {
      EventType: EVENT_TYPES.TRANSFER,
      Amount: amount,
      Note: note,
      IdempotencyKey: idempotencyKey,
    };
  }

  /**
   * Compute the expected cash amount based on the ledger.
   *   Expected = Opening + CashSales - Payouts + Transfers
   */
  computeExpected() {
    this.ExpectedAmount = Number(
      (this.OpeningAmount + this.CashSales - this.Payouts + this.Transfers).toFixed(2)
    );
    return this.ExpectedAmount;
  }

  /**
   * Close the cash session. Computes Difference.
   * @param {object} params
   * @param {number} params.countedAmount - Actual counted cash
   * @param {number} params.userId        - User closing the session
   * @param {string} [params.note]
   * @param {number} [params.expectedVersion] - Optimistic lock
   */
  close({ countedAmount, userId, note = null, expectedVersion = null }) {
    if (this.Status === STATUS.CLOSED) {
      throw new ConflictError(`CashSession ${this.Id} is already closed`);
    }
    if (typeof countedAmount !== 'number' || countedAmount < 0) {
      throw new ValidationError('countedAmount must be a non-negative number');
    }
    if (expectedVersion !== null && expectedVersion !== this.Version) {
      throw new ConflictError(
        `CashSession ${this.Id} was modified by another terminal`,
        { expectedVersion, actualVersion: this.Version }
      );
    }

    this.computeExpected();
    this.CountedAmount = countedAmount;
    this.Difference = Number((countedAmount - this.ExpectedAmount).toFixed(2));
    this.ClosedByUserId = userId;
    this.ClosedAt = new Date().toISOString();
    this.Status = STATUS.CLOSED;
    this.Version += 1;
    if (note) this.Notes = note;

    return {
      EventType: EVENT_TYPES.CLOSE,
      Amount: countedAmount,
      Note: note,
      IdempotencyKey: null,
    };
  }

  toRow() {
    return {
      Id: this.Id,
      WorkPeriodId: this.WorkPeriodId,
      TerminalId: this.TerminalId,
      UserId: this.UserId,
      ClosedByUserId: this.ClosedByUserId,
      OpenedAt: this.OpenedAt,
      ClosedAt: this.ClosedAt,
      OpeningAmount: this.OpeningAmount,
      CashSales: this.CashSales,
      CardSales: this.CardSales,
      VoucherSales: this.VoucherSales,
      Payouts: this.Payouts,
      Transfers: this.Transfers,
      ExpectedAmount: this.ExpectedAmount,
      CountedAmount: this.CountedAmount,
      Difference: this.Difference,
      Status: this.Status,
      Version: this.Version,
      Notes: this.Notes,
    };
  }
}

CashSession.STATUS = STATUS;
CashSession.EVENT_TYPES = EVENT_TYPES;

module.exports = { CashSession, EVENT_TYPES, STATUS };
