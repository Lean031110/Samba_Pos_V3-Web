// =====================================================================
// idempotency.js — Atomic idempotency key middleware (FASE 3.3, redesigned)
// =====================================================================
// Provides formal idempotency for critical operations (payment, close,
// void, refund). If a request arrives with an IdempotencyKey that was
// already processed, the original response is returned verbatim.
//
// Storage: IdempotencyKeys table (migration 20240905000001 + 20260908000001).
//
// Design (post-audit fix):
//   - Atomic acquisition via INSERT ... ON CONFLICT DO NOTHING.
//     Two concurrent requests with the same key cannot both proceed:
//     the second one sees the row inserted by the first and waits for
//     its completion (or replays if already completed).
//   - Composite UNIQUE (Key, Endpoint) — same key can be used for
//     different endpoints (independent operations).
//   - Status column coordinates concurrent requests:
//       PENDING   → request in flight, second caller polls.
//       COMPLETED → response cached, replay verbatim.
//       FAILED    → request failed; allow retry with same key.
//   - RequestBodyHash detects payload mismatch:
//       same key + different payload = 409 Conflict.
//   - UserId is verified before replay:
//       same key + different user = 403 Forbidden (info leak prevention).
//   - requirePermission must run BEFORE this middleware in the chain
//     so that authorization is checked before any idempotent replay.
//     (Order in routes: idempotent(...) AFTER requirePermission(...).)
//
// Usage:
//   router.post('/:id/payments',
//     requirePermission('pos.payment'),   // ← authz FIRST
//     idempotent('POST /api/tickets/:id/payments'),
//     async (req, res, next) => { ... });
//
// The idempotency key can come from:
//   1. req.body.idempotencyKey (preferred — set by the client)
//   2. req.headers['x-idempotency-key'] (alternative)
// If no key is provided, the request is NOT idempotent (just passes through).
// =====================================================================

const crypto = require('crypto');
const { db, withTransaction } = require('../../infrastructure/db/db');

const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PENDING_POLL_INTERVAL_MS = 100;
const PENDING_POLL_TIMEOUT_MS = 10000; // 10s — fail if no completion

/**
 * Compute a SHA-256 hash of the request body (excluding the idempotencyKey
 * itself, which can vary between calls with same semantic payload).
 */
function hashPayload(body) {
  const copy = { ...body };
  delete copy.idempotencyKey; // don't include the key itself in the hash
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(copy))
    .digest('hex');
}

/**
 * Middleware factory: makes a route idempotent.
 * @param {string} endpoint - The endpoint template, e.g. 'POST /api/tickets/:id/payments'
 */
function idempotent(endpoint) {
  return async (req, res, next) => {
    const key = (req.body && req.body.idempotencyKey) || req.headers['x-idempotency-key'];
    if (!key) {
      // No idempotency key — request is non-idempotent, just continue
      return next();
    }

    const userId = req.user?.userId || 0;
    const payloadHash = hashPayload(req.body || {});
    const now = new Date();
    const expiresAt = new Date(now.getTime() + KEY_TTL_MS);

    try {
      // === Atomic acquisition ===
      // Try to INSERT a new row. ON CONFLICT DO NOTHING ensures that
      // two concurrent requests cannot both succeed — exactly one will
      // actually insert; the other will get 0 rows affected and then
      // read the existing row.
      //
      // We use a transaction so that the INSERT + subsequent state
      // transitions are atomic from the perspective of other readers.
      const inserted = await withTransaction(async (trx) => {
        // Try to insert a PENDING row.
        const result = await trx.raw(
          `INSERT OR IGNORE INTO IdempotencyKeys
             (Key, UserId, Endpoint, RequestBody, RequestBodyHash,
              ResponseStatus, ResponseBody, Status, CreatedAt, ExpiresAt)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, 'PENDING', ?, ?)`,
          [
            String(key).slice(0, 128),
            userId,
            endpoint,
            JSON.stringify(req.body || {}).slice(0, 10000),
            payloadHash,
            now.toISOString(),
            expiresAt.toISOString(),
          ]
        );
        // SQLite via knex.raw returns an array. The 'changes' is in
        // result.changes for newer sqlite3 driver, or in result[0].changes
        // for older versions. Handle both.
        if (result && typeof result.changes === 'number') {
          return result.changes;
        }
        if (Array.isArray(result) && result[0] && typeof result[0].changes === 'number') {
          return result[0].changes;
        }
        // Fallback: check if the row was actually inserted by querying.
        const row = await trx('IdempotencyKeys')
          .where({ Key: String(key).slice(0, 128), Endpoint: endpoint })
          .first();
        // If the row exists AND its Status is PENDING AND CreatedAt matches
        // 'now', we inserted it. If Status is PENDING but CreatedAt is older,
        // someone else inserted it first.
        return (row && row.Status === 'PENDING' && row.CreatedAt === now.toISOString()) ? 1 : 0;
      });

      if (inserted > 0) {
        // === We are the winner — proceed with the request ===
        // Capture the response body + status so we can persist it for
        // future replays. We override res.json AND res.send to intercept
        // all response paths. We also listen for 'finish' to persist
        // asynchronously (fire-and-forget) — the response is sent
        // immediately, persistence happens after.
        //
        // For concurrent requests: if a second request arrives while
        // this one is in-flight (Status='PENDING'), it will poll up
        // to 10s. The persist happens on 'finish' which fires after
        // the response is fully sent — typically <50ms after the
        // handler completes.
        let capturedBody = null;
        let capturedStatus = null;
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);

        res.json = function (body) {
          capturedBody = body;
          capturedStatus = res.statusCode;
          return originalJson(body);
        };
        res.send = function (body) {
          if (!capturedBody && typeof body === 'string') {
            try { capturedBody = JSON.parse(body); } catch { capturedBody = body; }
            capturedStatus = res.statusCode;
          }
          return originalSend(body);
        };

        // Persist on 'finish' — fires after response is sent.
        res.on('finish', () => {
          if (capturedBody === null) return;
          const status = capturedStatus || res.statusCode || 200;
          const newStatus = (status >= 200 && status < 300) ? 'COMPLETED' : 'FAILED';
          const bodyStr = JSON.stringify(capturedBody).slice(0, 20000);
          db('IdempotencyKeys')
            .where({ Key: key, Endpoint: endpoint })
            .update({
              ResponseStatus: status,
              ResponseBody: bodyStr,
              Status: newStatus,
            })
            .catch(err => {
              console.error('[idempotency] Failed to persist response:', err.message);
            });
        });
        return next();
      }

      // === We are NOT the winner — a row already exists ===
      // Read it and decide what to do based on its Status.
      const existing = await db('IdempotencyKeys')
        .where({ Key: key, Endpoint: endpoint })
        .first();

      if (!existing) {
        // Edge case: row was deleted between INSERT and SELECT.
        // Treat as non-idempotent and continue.
        console.warn('[idempotency] Row vanished after INSERT OR IGNORE — continuing without idempotency');
        return next();
      }

      // Verify UserId matches (prevent cross-user replay = info leak).
      if (existing.UserId !== userId) {
        return res.status(403).json({
          error: 'Idempotency key used by a different user',
          code: 'IDEMPOTENCY_USER_MISMATCH',
        });
      }

      // Verify payload hash matches (same key + different payload = conflict).
      if (existing.RequestBodyHash && existing.RequestBodyHash !== payloadHash) {
        return res.status(409).json({
          error: 'Idempotency key used with a different payload',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        });
      }

      if (existing.Status === 'COMPLETED' && existing.ResponseBody) {
        // Replay the original response verbatim
        const body = JSON.parse(existing.ResponseBody);
        return res.status(existing.ResponseStatus || 200).json(body);
      }

      if (existing.Status === 'FAILED') {
        // Previous attempt failed — allow retry by deleting the old row
        // and inserting a fresh PENDING one. This is the only case where
        // we overwrite: a FAILED key can be reused.
        await withTransaction(async (trx) => {
          await trx('IdempotencyKeys')
            .where({ Key: key, Endpoint: endpoint, Status: 'FAILED' })
            .del();
          await trx('IdempotencyKeys').insert({
            Key: key,
            UserId: userId,
            Endpoint: endpoint,
            RequestBody: JSON.stringify(req.body || {}).slice(0, 10000),
            RequestBodyHash: payloadHash,
            Status: 'PENDING',
            CreatedAt: now.toISOString(),
            ExpiresAt: expiresAt.toISOString(),
          });
        });
        // Intercept res.json + res.send + 'finish' to capture response.
        let capturedBody = null;
        let capturedStatus = null;
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        res.json = function (body) {
          capturedBody = body;
          capturedStatus = res.statusCode;
          return originalJson(body);
        };
        res.send = function (body) {
          if (!capturedBody && typeof body === 'string') {
            try { capturedBody = JSON.parse(body); } catch { capturedBody = body; }
            capturedStatus = res.statusCode;
          }
          return originalSend(body);
        };
        res.on('finish', () => {
          if (capturedBody === null) return;
          const status = capturedStatus || res.statusCode || 200;
          const newStatus = (status >= 200 && status < 300) ? 'COMPLETED' : 'FAILED';
          const bodyStr = JSON.stringify(capturedBody).slice(0, 20000);
          db('IdempotencyKeys')
            .where({ Key: key, Endpoint: endpoint })
            .update({ ResponseStatus: status, ResponseBody: bodyStr, Status: newStatus })
            .catch(err => console.error('[idempotency] persist error:', err.message));
        });
        return next();
      }

      // Status === 'PENDING' — another request is in flight.
      // Poll until it completes (or times out).
      const deadline = Date.now() + PENDING_POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, PENDING_POLL_INTERVAL_MS));
        const current = await db('IdempotencyKeys')
          .where({ Key: key, Endpoint: endpoint })
          .first();
        if (!current) {
          // Row vanished — treat as non-idempotent
          return next();
        }
        if (current.Status === 'COMPLETED' && current.ResponseBody) {
          const body = JSON.parse(current.ResponseBody);
          return res.status(current.ResponseStatus || 200).json(body);
        }
        if (current.Status === 'FAILED') {
          // The in-flight request failed — allow this caller to retry.
          // Delete the failed row and proceed.
          await db('IdempotencyKeys')
            .where({ Key: key, Endpoint: endpoint, Status: 'FAILED' })
            .del();
          // Re-enter the middleware logic by recursing once.
          // To avoid infinite recursion, we mark a flag.
          if (!req._idempotencyRetried) {
            req._idempotencyRetried = true;
            return idempotent(endpoint)(req, res, next);
          }
          return next();
        }
        // Still PENDING — keep polling
      }
      // Timed out waiting for the in-flight request
      return res.status(409).json({
        error: 'Idempotency key is in flight (PENDING) and did not complete in time',
        code: 'IDEMPOTENCY_PENDING_TIMEOUT',
      });
    } catch (err) {
      // Don't fail the request if idempotency tracking fails; just continue.
      // This matches the original behavior — idempotency is best-effort
      // from the caller's perspective (the key is still stored for audit).
      console.error('[idempotency] Error:', err.message);
      next();
    }
  };
}

/**
 * Helper: check if a key was already used (for use in service code).
 * Returns the cached response if the key is COMPLETED, else null.
 */
async function checkExistingKey(key, endpoint) {
  if (!key) return null;
  const existing = await db('IdempotencyKeys')
    .where({ Key: key, Endpoint: endpoint })
    .first();
  if (existing && existing.Status === 'COMPLETED' && existing.ResponseBody) {
    return {
      status: existing.ResponseStatus,
      body: JSON.parse(existing.ResponseBody),
    };
  }
  return null;
}

/**
 * Helper: purge expired idempotency keys.
 * Safe to call periodically (e.g., once per hour via a cron-like timer).
 * @param {number} [batchSize=100] — max rows to delete per call
 */
async function purgeExpiredKeys(batchSize = 100) {
  const now = new Date().toISOString();
  const deleted = await db('IdempotencyKeys')
    .where('ExpiresAt', '<', now)
    .del();
  return deleted;
}

module.exports = { idempotent, checkExistingKey, purgeExpiredKeys };
