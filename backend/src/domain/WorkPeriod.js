// =====================================================================
// WorkPeriod.js — WorkPeriod aggregate root (FASE 2)
// =====================================================================
// A WorkPeriod represents a contiguous business session (a "day" in
// restaurant terms) that groups all tickets, payments and cash sessions.
//
// State machine:
//   OPEN  ──close(expected, actual)──►  CLOSED
//   CLOSED ──reopen()──►  OPEN  (admin only, audit-logged)
//
// Invariants:
//   - Only one WorkPeriod may be OPEN at a time.
//   - Cannot close if there are open tickets.
//   - Difference = ActualAmount - ExpectedAmount (computed on close)
//   - Version column for optimistic locking (multi-terminal safe)
// =====================================================================

const { ConflictError, ValidationError } = require('../api/middleware/errorHandler');

const STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
});

class WorkPeriod {
  constructor(row) {
    this.Id = row?.Id;
    this.Name = row?.Name || null;
    this.StartDate = row?.StartDate;
    this.EndDate = row?.EndDate || null;
    this.StartDescription = row?.StartDescription || null;
    this.EndDescription = row?.EndDescription || null;
    this.OpenedBy = row?.OpenedBy || null;
    this.ClosedBy = row?.ClosedBy || null;
    this.OpeningAmount = row?.OpeningAmount != null ? Number(row.OpeningAmount) : 0;
    this.ClosingAmount = row?.ClosingAmount != null ? Number(row.ClosingAmount) : null;
    this.ExpectedAmount = row?.ExpectedAmount != null ? Number(row.ExpectedAmount) : null;
    this.ActualAmount = row?.ActualAmount != null ? Number(row.ActualAmount) : null;
    this.Difference = row?.Difference != null ? Number(row.Difference) : null;
    this.Status = row?.Status || STATUS.OPEN;
    this.IsOpen = row?.IsOpen != null ? !!row.IsOpen : (this.Status === STATUS.OPEN);
    this.Version = row?.Version || 1;
  }

  /**
   * Close the work period. Computes Difference from expected/actual.
   * @param {object} params
   * @param {number} params.expectedAmount - System-computed expected cash
   * @param {number} params.actualAmount   - Counted cash amount
   * @param {number} params.userId         - User closing the period
   * @param {string} [params.description]   - Optional closing note
   * @param {number} [params.expectedVersion] - Optimistic lock check
   */
  close({ expectedAmount, actualAmount, userId, description = null, expectedVersion = null }) {
    if (this.Status !== STATUS.OPEN) {
      throw new ConflictError(`WorkPeriod ${this.Id} is already closed`);
    }
    if (typeof expectedAmount !== 'number' || typeof actualAmount !== 'number') {
      throw new ValidationError('expectedAmount and actualAmount must be numbers');
    }
    if (expectedVersion !== null && expectedVersion !== this.Version) {
      throw new ConflictError(
        `WorkPeriod ${this.Id} was modified by another terminal. Expected version ${expectedVersion}, got ${this.Version}`,
        { expectedVersion, actualVersion: this.Version }
      );
    }

    this.ExpectedAmount = expectedAmount;
    this.ActualAmount = actualAmount;
    this.Difference = Number((actualAmount - expectedAmount).toFixed(2));
    this.ClosingAmount = actualAmount;
    this.EndDate = new Date().toISOString();
    this.EndDescription = description;
    this.ClosedBy = userId;
    this.Status = STATUS.CLOSED;
    this.IsOpen = false;
    this.Version += 1;
    return this;
  }

  /**
   * Reopen a previously-closed work period. Admin-only (enforced by caller).
   * Audit log entry should be written by the caller.
   * @param {number} userId
   * @param {string} reason
   * @param {number} [expectedVersion]
   */
  reopen({ userId, reason, expectedVersion = null }) {
    if (this.Status !== STATUS.CLOSED) {
      throw new ConflictError(`WorkPeriod ${this.Id} is not closed; cannot reopen`);
    }
    if (!reason) {
      throw new ValidationError('reason is required to reopen a WorkPeriod');
    }
    if (expectedVersion !== null && expectedVersion !== this.Version) {
      throw new ConflictError(
        `WorkPeriod ${this.Id} was modified by another terminal`,
        { expectedVersion, actualVersion: this.Version }
      );
    }
    this.Status = STATUS.OPEN;
    this.IsOpen = true;
    this.EndDate = null;
    this.EndDescription = `[REOPENED: ${reason}]`;
    this.Version += 1;
    return this;
  }

  /**
   * Whether this work period is open and accepts new tickets.
   */
  acceptsNewTickets() {
    return this.Status === STATUS.OPEN;
  }

  toRow() {
    return {
      Id: this.Id,
      Name: this.Name,
      StartDate: this.StartDate,
      EndDate: this.EndDate,
      StartDescription: this.StartDescription,
      EndDescription: this.EndDescription,
      OpenedBy: this.OpenedBy,
      ClosedBy: this.ClosedBy,
      OpeningAmount: this.OpeningAmount,
      ClosingAmount: this.ClosingAmount,
      ExpectedAmount: this.ExpectedAmount,
      ActualAmount: this.ActualAmount,
      Difference: this.Difference,
      Status: this.Status,
      IsOpen: this.IsOpen ? 1 : 0,
      Version: this.Version,
    };
  }
}

WorkPeriod.STATUS = STATUS;

module.exports = { WorkPeriod };
