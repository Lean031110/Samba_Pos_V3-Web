// =====================================================================
// PrintWorker.js — Background worker that drains the print queue
// =====================================================================
// FASE 7 — Real printing architecture.
//
// The PrintWorker runs in a loop, claiming jobs from the PrintQueue and
// sending them to the printer via PrinterManager. It handles:
//   - retry with exponential backoff (delegated to PrintQueue.markFailed)
//   - fallback printer (delegated to PrintQueue.markFailed)
//   - heartbeat to detect stuck PRINTING jobs (re-queue if claimed too long)
//
// Lifecycle:
//   start() — begins polling every `pollIntervalMs` ms
//   stop()  — stops polling; finishes any in-flight job
//
// Events emitted (EventEmitter):
//   'job:claimed'  — (job)        a job was claimed and is being sent
//   'job:printed'  — (job)        a job was successfully printed
//   'job:failed'   — (job, error) a job failed (will retry or move to FAILED)
//   'job:retrying' — (job)        a job moved to RETRYING state
//   'queue:empty'  — ()            the queue is empty (no PENDING/RETRYING jobs)
//   'error'        — (err)        an unexpected error in the worker itself
// =====================================================================

const EventEmitter = require('events');
const { PrintQueue } = require('./PrintQueue');
const { PrinterManager } = require('./PrinterManager');
const { PrintJob } = require('../../domain/PrintJob');

const { STATUS } = PrintJob;

class PrintWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.queue = options.queue || new PrintQueue();
    this.printerManager = options.printerManager || new PrinterManager();
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.stuckTimeoutMs = options.stuckTimeoutMs || 30000; // re-queue if PRINTING > 30s
    this.maxConcurrent = options.maxConcurrent || 1;
    this._timer = null;
    this._running = false;
    this._inFlight = 0;
    this._consecutiveEmptyPolls = 0;
  }

  /**
   * Start the polling loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._consecutiveEmptyPolls = 0;
    this._scheduleNext(100); // first poll after 100ms
    this._startStuckJobReaper();
  }

  /**
   * Stop the polling loop. Waits for any in-flight job to finish.
   */
  async stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._reaperTimer) {
      clearInterval(this._reaperTimer);
      this._reaperTimer = null;
    }
    // Wait for in-flight jobs to complete (max 10s)
    const start = Date.now();
    while (this._inFlight > 0 && Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  /**
   * Process one job. Called by _poll().
   */
  async _processOne() {
    let job;
    try {
      job = await this.queue.claimNext();
    } catch (err) {
      this.emit('error', err);
      return;
    }
    if (!job) return;

    this._inFlight += 1;
    this.emit('job:claimed', job);
    this._consecutiveEmptyPolls = 0;

    try {
      // Look up the printer config from DB.
      const printer = await this.printerManager.getPrinter(job.PrinterId);
      // Send the payload bytes via TCP.
      const transport = this.printerManager._getTransport(printer);
      const result = await transport.send(job.Payload);

      if (result.success) {
        await this.queue.markPrinted(job.Id);
        const updated = await this.queue.get(job.Id);
        this.emit('job:printed', updated);
      } else {
        const updated = await this.queue.markFailed(job.Id, result.error || 'Unknown transport error');
        if (updated.Status === STATUS.RETRYING) {
          this.emit('job:retrying', updated);
        } else {
          this.emit('job:failed', updated, new Error(result.error));
        }
      }
    } catch (err) {
      // Unexpected error in the worker itself — mark the job as failed
      // so it can be retried (or moved to FAILED if maxAttempts exhausted).
      try {
        const updated = await this.queue.markFailed(job.Id, `Worker error: ${err.message}`);
        if (updated.Status === STATUS.RETRYING) {
          this.emit('job:retrying', updated);
        } else {
          this.emit('job:failed', updated, err);
        }
      } catch (markErr) {
        this.emit('error', markErr);
      }
    } finally {
      this._inFlight -= 1;
    }
  }

  /**
   * Poll loop: claim and process up to maxConcurrent jobs per tick.
   */
  async _poll() {
    if (!this._running) return;
    try {
      const tasks = [];
      for (let i = 0; i < this.maxConcurrent - this._inFlight; i++) {
        tasks.push(this._processOne());
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
      // If no tasks were created, queue is empty or all workers busy.
      if (tasks.length === 0) {
        this._consecutiveEmptyPolls += 1;
        if (this._consecutiveEmptyPolls === 1) {
          this.emit('queue:empty');
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
    if (this._running) {
      this._scheduleNext(this.pollIntervalMs);
    }
  }

  _scheduleNext(delay) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._poll(), delay);
  }

  /**
   * Periodically reap stuck PRINTING jobs (claimed but never resolved).
   * This happens if the worker crashed mid-print. We re-queue them.
   */
  _startStuckJobReaper() {
    this._reaperTimer = setInterval(async () => {
      try {
        const stuck = await this._findStuckJobs();
        for (const row of stuck) {
          await this._requeueStuckJob(row);
        }
      } catch (err) {
        this.emit('error', err);
      }
    }, 10000); // every 10s
  }

  async _findStuckJobs() {
    const cutoff = new Date(Date.now() - this.stuckTimeoutMs).toISOString();
    const { db } = require('../../infrastructure/db/db');
    return db('PrintJobInstances')
      .where({ Status: STATUS.PRINTING })
      .andWhere('LastAttemptAt', '<', cutoff);
  }

  async _requeueStuckJob(row) {
    const { db } = require('../../infrastructure/db/db');
    // Treat as a failed attempt — bump Attempts and move to RETRYING.
    const job = new PrintJob(row);
    job.Attempts += 1;
    if (job.Attempts >= job.MaxAttempts) {
      job.Status = STATUS.FAILED;
      job.Error = `Stuck in PRINTING > ${this.stuckTimeoutMs}ms — moved to FAILED`;
    } else {
      job.Status = STATUS.RETRYING;
      job.Error = `Stuck in PRINTING > ${this.stuckTimeoutMs}ms — re-queued`;
      const baseMs = Math.min(60000, Math.pow(2, job.Attempts) * 1000);
      job.NextAttemptAt = new Date(Date.now() + baseMs).toISOString();
    }
    job.Version += 1;
    await db('PrintJobInstances')
      .where({ Id: job.Id, Version: row.Version })
      .update({
        Status: job.Status,
        Attempts: job.Attempts,
        Error: job.Error,
        NextAttemptAt: job.NextAttemptAt,
        Version: job.Version,
      });
    this.emit('job:retrying', job);
  }
}

module.exports = { PrintWorker };
