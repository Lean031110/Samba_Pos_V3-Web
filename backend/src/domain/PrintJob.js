// =====================================================================
// PrintJob.js — PrintJob aggregate root (FASE 2 — prepares FASE 7)
// =====================================================================
// A PrintJob represents a queued print operation that will be sent to a
// physical printer. It is the unit of work for the print queue, with
// idempotency, retry, fallback and audit semantics.
//
// State machine:
//   PENDING ──claim()──► PRINTING
//   PRINTING ──markPrinted()──► PRINTED  (terminal state)
//   PRINTING ──markFailed(err)──► FAILED  (if attempts >= maxAttempts)
//   PRINTING ──markFailed(err)──► RETRYING  (if attempts < maxAttempts)
//   RETRYING ──claim()──► PRINTING
//   any ──cancel()──► CANCELLED  (terminal)
//
// Invariants:
//   - UUID is unique and immutable (use for idempotency)
//   - IdempotencyKey prevents duplicate PrintJobs for the same logical event
//   - Attempts counter never exceeds MaxAttempts before transitioning to FAILED
//   - PayloadChecksum (sha256 of payload) used for golden-fixture comparison
// =====================================================================

const crypto = require('crypto');
const { ConflictError, ValidationError } = require('../api/middleware/errorHandler');

const JOB_TYPES = Object.freeze({
  KITCHEN_ORDER: 'KITCHEN_ORDER',
  RECEIPT: 'RECEIPT',
  REFUND_RECEIPT: 'REFUND_RECEIPT',
  REPRINT: 'REPRINT',
  REPORT: 'REPORT',
});

const STATUS = Object.freeze({
  PENDING: 'PENDING',
  PRINTING: 'PRINTING',
  PRINTED: 'PRINTED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
  CANCELLED: 'CANCELLED',
});

class PrintJob {
  constructor(row) {
    this.Id = row?.Id;
    this.Uuid = row?.Uuid;
    this.TicketId = row?.TicketId || null;
    this.OrderId = row?.OrderId || null;
    this.PrinterId = row?.PrinterId;
    this.JobType = row?.JobType;
    this.Status = row?.Status || STATUS.PENDING;
    this.Attempts = row?.Attempts || 0;
    this.MaxAttempts = row?.MaxAttempts || 5;
    this.IdempotencyKey = row?.IdempotencyKey || null;
    this.Payload = row?.Payload || null;
    this.PayloadSize = row?.PayloadSize || null;
    this.Checksum = row?.Checksum || null;
    this.Error = row?.Error || null;
    this.QueuedAt = row?.QueuedAt || new Date().toISOString();
    this.PrintedAt = row?.PrintedAt || null;
    this.LastAttemptAt = row?.LastAttemptAt || null;
    this.NextAttemptAt = row?.NextAttemptAt || null;
    this.UserId = row?.UserId || null;
    this.FallbackPrinterId = row?.FallbackPrinterId || null;
    this.Version = row?.Version || 1;
  }

  /**
   * Claim the job for printing (atomic transition PENDING/RETRYING → PRINTING).
   * Returns true if the claim succeeded.
   */
  claim() {
    if (this.Status !== STATUS.PENDING && this.Status !== STATUS.RETRYING) {
      throw new ConflictError(
        `PrintJob ${this.Id} cannot be claimed (status=${this.Status})`,
        { currentStatus: this.Status }
      );
    }
    this.Attempts += 1;
    this.LastAttemptAt = new Date().toISOString();
    this.NextAttemptAt = null;
    this.Status = STATUS.PRINTING;
    this.Error = null;
    return true;
  }

  /**
   * Mark the job as successfully printed.
   */
  markPrinted() {
    if (this.Status !== STATUS.PRINTING) {
      throw new ConflictError(
        `PrintJob ${this.Id} cannot be marked PRINTED from ${this.Status}`
      );
    }
    this.Status = STATUS.PRINTED;
    this.PrintedAt = new Date().toISOString();
    this.Error = null;
    this.Version += 1;
    return true;
  }

  /**
   * Mark the job as failed. If attempts remain, transition to RETRYING with
   * exponential backoff. Otherwise transition to FAILED.
   * @param {string} errorMessage
   */
  markFailed(errorMessage) {
    if (this.Status !== STATUS.PRINTING) {
      throw new ConflictError(
        `PrintJob ${this.Id} cannot be marked FAILED from ${this.Status}`
      );
    }
    this.Error = String(errorMessage || 'Unknown error').slice(0, 5000);
    if (this.Attempts >= this.MaxAttempts) {
      this.Status = STATUS.FAILED;
    } else {
      this.Status = STATUS.RETRYING;
      // Exponential backoff: 2^attempts seconds, capped at 60s, with jitter
      const baseMs = Math.min(60000, Math.pow(2, this.Attempts) * 1000);
      const jitterMs = Math.floor(Math.random() * 500);
      const next = new Date(Date.now() + baseMs + jitterMs);
      this.NextAttemptAt = next.toISOString();
    }
    this.Version += 1;
    return this.Status;
  }

  /**
   * Cancel the job. Only allowed from PENDING, RETRYING or PRINTING.
   */
  cancel(reason = null) {
    if (this.Status === STATUS.PRINTED || this.Status === STATUS.CANCELLED) {
      throw new ConflictError(
        `PrintJob ${this.Id} is in terminal state ${this.Status} and cannot be cancelled`
      );
    }
    this.Status = STATUS.CANCELLED;
    this.Error = reason ? `Cancelled: ${reason}` : 'Cancelled by operator';
    this.Version += 1;
    return true;
  }

  /**
   * Set the payload and compute its sha256 checksum + size.
   */
  setPayload(bytes) {
    if (!Buffer.isBuffer(bytes) && typeof bytes !== 'string') {
      throw new ValidationError('payload must be a Buffer or string');
    }
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
    this.Payload = buf;
    this.PayloadSize = buf.length;
    this.Checksum = crypto.createHash('sha256').update(buf).digest('hex');
    return this;
  }

  /**
   * Verify the payload matches the stored checksum.
   * Used by FASE 7 golden-fixture tests.
   */
  verifyChecksum() {
    if (!this.Payload || !this.Checksum) return false;
    const actual = crypto.createHash('sha256').update(this.Payload).digest('hex');
    return actual === this.Checksum;
  }

  /**
   * Whether the job should be retried (still in RETRYING state and
   * NextAttemptAt is in the past).
   */
  isReadyForRetry() {
    if (this.Status !== STATUS.RETRYING) return false;
    if (!this.NextAttemptAt) return false;
    return new Date(this.NextAttemptAt).getTime() <= Date.now();
  }

  /**
   * Whether the job is in a terminal state (no further transitions possible).
   */
  isTerminal() {
    return this.Status === STATUS.PRINTED
        || this.Status === STATUS.FAILED
        || this.Status === STATUS.CANCELLED;
  }

  toRow() {
    return {
      Id: this.Id,
      Uuid: this.Uuid,
      TicketId: this.TicketId,
      OrderId: this.OrderId,
      PrinterId: this.PrinterId,
      JobType: this.JobType,
      Status: this.Status,
      Attempts: this.Attempts,
      MaxAttempts: this.MaxAttempts,
      IdempotencyKey: this.IdempotencyKey,
      Payload: this.Payload,
      PayloadSize: this.PayloadSize,
      Checksum: this.Checksum,
      Error: this.Error,
      QueuedAt: this.QueuedAt,
      PrintedAt: this.PrintedAt,
      LastAttemptAt: this.LastAttemptAt,
      NextAttemptAt: this.NextAttemptAt,
      UserId: this.UserId,
      FallbackPrinterId: this.FallbackPrinterId,
      Version: this.Version,
    };
  }
}

PrintJob.JOB_TYPES = JOB_TYPES;
PrintJob.STATUS = STATUS;

module.exports = { PrintJob };
