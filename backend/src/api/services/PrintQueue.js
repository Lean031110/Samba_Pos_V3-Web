// =====================================================================
// PrintQueue.js — Persistent print queue with retry + fallback
// =====================================================================
// FASE 7 — Real printing architecture.
//
// The PrintQueue is the single source of truth for "what needs to be
// printed". It persists PrintJobInstances in the database so that
// pending jobs survive a server restart.
//
// Responsibilities:
//   - enqueue(PrintJob)         — insert into DB (idempotent by key)
//   - claimNext()               — atomically claim the next PENDING/RETRYING job
//   - markPrinted(jobId)        — transition to PRINTED
//   - markFailed(jobId, error)  — transition to RETRYING or FAILED
//   - retryReadyJobs()         — pick up RETRYING jobs whose NextAttemptAt passed
//   - cancel(jobId, reason)    — transition to CANCELLED
//   - getQueue(filter)         — list jobs for UI/monitoring
//   - getStats()                — queue health metrics
//
// The actual byte-sending is done by a PrintWorker that calls claimNext()
// in a loop, sends the bytes via PrinterManager, and reports the result
// back via markPrinted/markFailed.
// =====================================================================

const crypto = require('crypto');
const { db } = require('../../infrastructure/db/db');
const { PrintJob } = require('../../domain/PrintJob');
const { ConflictError, NotFoundError } = require('../middleware/errorHandler');

const { STATUS, JOB_TYPES } = PrintJob;

class PrintQueue {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 5;
    this.defaultBackoffBaseMs = options.backoffBaseMs || 1000;
    this.defaultBackoffMaxMs = options.backoffMaxMs || 60000;
  }

  /**
   * Enqueue a new print job. If an IdempotencyKey is provided and an
   * existing job with the same key is already in the queue (not in a
   * terminal FAILED/CANCELLED state), return that job instead of
   * creating a duplicate.
   *
   * @param {Object} params
   * @param {number} params.printerId       — target printer
   * @param {string} params.jobType         — see JOB_TYPES
   * @param {Buffer|string} params.payload  — ESC/POS bytes (or text)
   * @param {string} [params.idempotencyKey]— client-supplied dedup key
   * @param {number} [params.ticketId]
   * @param {number} [params.orderId]
   * @param {number} [params.userId]
   * @param {number} [params.fallbackPrinterId]
   * @param {number} [params.printAreaId]
   * @returns {Promise<PrintJob>}
   */
  async enqueue(params) {
    if (!params.printerId) throw new Error('printerId is required');
    if (!params.jobType || !Object.values(JOB_TYPES).includes(params.jobType)) {
      throw new Error(`Invalid jobType: ${params.jobType}`);
    }
    if (!params.payload) throw new Error('payload is required');

    // Idempotency check: if a job with the same key exists and is not
    // terminal, return it instead of creating a duplicate.
    if (params.idempotencyKey) {
      const existing = await db('PrintJobInstances')
        .where({ IdempotencyKey: params.idempotencyKey })
        .whereNotIn('Status', [STATUS.FAILED, STATUS.CANCELLED])
        .first();
      if (existing) {
        return new PrintJob(existing);
      }
    }

    const buf = Buffer.isBuffer(params.payload)
      ? params.payload
      : Buffer.from(params.payload, 'utf8');

    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();

    const job = new PrintJob({
      Uuid: uuid,
      TicketId: params.ticketId || null,
      OrderId: params.orderId || null,
      PrinterId: params.printerId,
      JobType: params.jobType,
      Status: STATUS.PENDING,
      Attempts: 0,
      MaxAttempts: this.maxAttempts,
      IdempotencyKey: params.idempotencyKey || null,
      Payload: buf,
      PayloadSize: buf.length,
      Checksum: crypto.createHash('sha256').update(buf).digest('hex'),
      QueuedAt: now,
      UserId: params.userId || null,
      FallbackPrinterId: params.fallbackPrinterId || null,
      Version: 1,
    });
    if (params.printAreaId) job.PrintAreaId = params.printAreaId;

    const [id] = await db('PrintJobInstances').insert(job.toRow());
    job.Id = id;

    return job;
  }

  /**
   * Atomically claim the next pending or retry-ready job.
   * Returns null if no job is available.
   *
   * Uses SELECT ... FOR UPDATE-style semantics via a transaction.
   * SQLite doesn't have SELECT FOR UPDATE, but its serializable-by-default
   * WAL mode + the per-job Version (optimistic lock) makes this safe.
   *
   * @returns {Promise<PrintJob|null>}
   */
  async claimNext() {
    return db.transaction(async (trx) => {
      const now = new Date().toISOString();
      // Find the oldest PENDING job, OR the oldest RETRYING job whose
      // NextAttemptAt has elapsed.
      const row = await trx('PrintJobInstances')
        .where(function () {
          this.where({ Status: STATUS.PENDING })
              .orWhere(function () {
                this.where({ Status: STATUS.RETRYING })
                    .andWhere('NextAttemptAt', '<=', now);
              });
        })
        .orderBy('QueuedAt', 'asc')
        .first();

      if (!row) return null;

      const job = new PrintJob(row);
      // Apply state transition in the domain
      job.claim();
      // Persist the claim
      await trx('PrintJobInstances')
        .where({ Id: job.Id, Version: row.Version })
        .update({
          Status: job.Status,
          Attempts: job.Attempts,
          LastAttemptAt: job.LastAttemptAt,
          NextAttemptAt: null,
          Version: job.Version,
        });
      return job;
    });
  }

  /**
   * Mark a job as successfully printed.
   * @param {number} jobId
   * @returns {Promise<PrintJob>}
   */
  async markPrinted(jobId) {
    return db.transaction(async (trx) => {
      const row = await trx('PrintJobInstances').where({ Id: jobId }).first();
      if (!row) throw new NotFoundError(`PrintJob ${jobId} not found`);
      const job = new PrintJob(row);
      job.markPrinted();
      await trx('PrintJobInstances')
        .where({ Id: jobId, Version: row.Version })
        .update({
          Status: job.Status,
          PrintedAt: job.PrintedAt,
          Error: null,
          Version: job.Version,
        });
      return job;
    });
  }

  /**
   * Mark a job as failed. If attempts remain, transition to RETRYING
   * with exponential backoff. Otherwise transition to FAILED.
   *
   * If a FallbackPrinterId is set on the job and we've exhausted attempts
   * on the primary printer, re-queue on the fallback printer with a fresh
   * attempt counter.
   *
   * @param {number} jobId
   * @param {string} errorMessage
   * @returns {Promise<PrintJob>}
   */
  async markFailed(jobId, errorMessage) {
    return db.transaction(async (trx) => {
      const row = await trx('PrintJobInstances').where({ Id: jobId }).first();
      if (!row) throw new NotFoundError(`PrintJob ${jobId} not found`);
      const job = new PrintJob(row);

      // Check for fallback printer: if primary exhausted and fallback exists,
      // switch printer and reset attempts.
      if (job.Attempts >= job.MaxAttempts
          && job.FallbackPrinterId
          && job.FallbackPrinterId !== job.PrinterId) {
        job.PrinterId = job.FallbackPrinterId;
        job.FallbackPrinterId = null;
        job.Attempts = 0;
        job.Status = STATUS.RETRYING;
        job.NextAttemptAt = new Date(Date.now() + 1000).toISOString(); // retry in 1s
        job.Error = `Switched to fallback printer after primary failure: ${errorMessage}`.slice(0, 5000);
        job.Version += 1;
      } else {
        job.markFailed(errorMessage);
      }

      await trx('PrintJobInstances')
        .where({ Id: jobId, Version: row.Version })
        .update({
          Status: job.Status,
          Attempts: job.Attempts,
          Error: job.Error,
          NextAttemptAt: job.NextAttemptAt,
          PrinterId: job.PrinterId,
          FallbackPrinterId: job.FallbackPrinterId,
          Version: job.Version,
        });
      return job;
    });
  }

  /**
   * Cancel a job. Only allowed from non-terminal states.
   * @param {number} jobId
   * @param {string} [reason]
   * @returns {Promise<PrintJob>}
   */
  async cancel(jobId, reason = null) {
    return db.transaction(async (trx) => {
      const row = await trx('PrintJobInstances').where({ Id: jobId }).first();
      if (!row) throw new NotFoundError(`PrintJob ${jobId} not found`);
      const job = new PrintJob(row);
      job.cancel(reason);
      await trx('PrintJobInstances')
        .where({ Id: jobId, Version: row.Version })
        .update({
          Status: job.Status,
          Error: job.Error,
          Version: job.Version,
        });
      return job;
    });
  }

  /**
   * Get a job by ID.
   * @param {number} jobId
   * @returns {Promise<PrintJob>}
   */
  async get(jobId) {
    const row = await db('PrintJobInstances').where({ Id: jobId }).first();
    if (!row) throw new NotFoundError(`PrintJob ${jobId} not found`);
    return new PrintJob(row);
  }

  /**
   * Get a job by UUID.
   * @param {string} uuid
   * @returns {Promise<PrintJob>}
   */
  async getByUuid(uuid) {
    const row = await db('PrintJobInstances').where({ Uuid: uuid }).first();
    if (!row) throw new NotFoundError(`PrintJob uuid=${uuid} not found`);
    return new PrintJob(row);
  }

  /**
   * Find a job by its idempotency key. Returns null if not found.
   */
  async findByIdempotencyKey(key) {
    if (!key) return null;
    const row = await db('PrintJobInstances').where({ IdempotencyKey: key }).first();
    return row ? new PrintJob(row) : null;
  }

  /**
   * List jobs with optional filters. Used by the monitoring UI.
   *
   * @param {Object} [filter]
   * @param {string} [filter.status]
   * @param {number} [filter.printerId]
   * @param {number} [filter.ticketId]
   * @param {number} [limit=50]
   * @returns {Promise<PrintJob[]>}
   */
  async list(filter = {}, limit = 50) {
    const q = db('PrintJobInstances');
    if (filter.status) q.where({ Status: filter.status });
    if (filter.printerId) q.where({ PrinterId: filter.printerId });
    if (filter.ticketId) q.where({ TicketId: filter.ticketId });
    q.orderBy('QueuedAt', 'desc').limit(limit);
    const rows = await q;
    return rows.map(r => new PrintJob(r));
  }

  /**
   * Count jobs by status. Used by the monitoring UI / health endpoint.
   * @returns {Promise<Object>} { PENDING: 3, PRINTING: 1, ... }
   */
  async getStats() {
    const rows = await db('PrintJobInstances')
      .select('Status')
      .count('* as count')
      .groupBy('Status');
    const stats = {};
    for (const r of rows) stats[r.Status] = r.count;
    return stats;
  }

  /**
   * Count jobs that are ready to be retried (RETRYING + NextAttemptAt passed).
   * Used by the worker to decide whether to spin up an extra processing loop.
   * @returns {Promise<number>}
   */
  async countRetryReady() {
    const now = new Date().toISOString();
    const row = await db('PrintJobInstances')
      .where({ Status: STATUS.RETRYING })
      .andWhere('NextAttemptAt', '<=', now)
      .count('* as count')
      .first();
    return row ? row.count : 0;
  }

  /**
   * Count pending jobs (PENDING only — excludes RETRYING).
   */
  async countPending() {
    const row = await db('PrintJobInstances')
      .where({ Status: STATUS.PENDING })
      .count('* as count')
      .first();
    return row ? row.count : 0;
  }
}

module.exports = { PrintQueue };
