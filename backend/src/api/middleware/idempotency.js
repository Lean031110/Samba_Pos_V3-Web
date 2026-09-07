// =====================================================================
// idempotency.js — Idempotency key middleware (FASE 3.3)
// =====================================================================
// Provides formal idempotency for critical operations (payment, close,
// void, refund). If a request arrives with an IdempotencyKey that was
// already processed, the original response is returned verbatim.
//
// Storage: IdempotencyKeys table (created in migration 20240905000001).
//
// Usage:
//   router.post('/:id/payments',
//     idempotent('POST /api/tickets/:id/payments'),
//     requirePermission('pos.payment'),
//     async (req, res, next) => { ... });
//
// The idempotency key can come from:
//   1. req.body.idempotencyKey (preferred — set by the client)
//   2. req.headers['x-idempotency-key'] (alternative)
// If no key is provided, the request is NOT idempotent (just passes through).
// =====================================================================

const { db } = require('../../infrastructure/db/db');

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

    try {
      // Look for an existing entry with this key + endpoint
      const existing = await db('IdempotencyKeys')
        .where({ Key: key, Endpoint: endpoint })
        .first();

      if (existing && existing.ResponseBody) {
        // Replay the original response verbatim
        const body = JSON.parse(existing.ResponseBody);
        return res.status(existing.ResponseStatus || 200).json(body);
      }

      // New key — register it (status pending, no response yet)
      if (!existing) {
        await db('IdempotencyKeys').insert({
          Key: key,
          UserId: req.user?.userId || 0,
          Endpoint: endpoint,
          RequestBody: JSON.stringify(req.body || {}).slice(0, 10000),
          ResponseStatus: null,
          ResponseBody: null,
          CreatedAt: new Date().toISOString(),
          ExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),  // 24h
        });
      }

      // Intercept res.json to capture the response
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        // Persist the response (best-effort, fire-and-forget)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          db('IdempotencyKeys')
            .where({ Key: key, Endpoint: endpoint })
            .update({
              ResponseStatus: res.statusCode,
              ResponseBody: JSON.stringify(body).slice(0, 20000),
            })
            .catch(err => console.error('[idempotency] Failed to persist response:', err.message));
        }
        return originalJson(body);
      };
      next();
    } catch (err) {
      // Don't fail the request if idempotency tracking fails; just continue
      console.error('[idempotency] Error:', err.message);
      next();
    }
  };
}

/**
 * Helper: check if a key was already used (for use in service code).
 */
async function checkExistingKey(key, endpoint) {
  if (!key) return null;
  const existing = await db('IdempotencyKeys')
    .where({ Key: key, Endpoint: endpoint })
    .first();
  if (existing && existing.ResponseBody) {
    return {
      status: existing.ResponseStatus,
      body: JSON.parse(existing.ResponseBody),
    };
  }
  return null;
}

module.exports = { idempotent, checkExistingKey };
