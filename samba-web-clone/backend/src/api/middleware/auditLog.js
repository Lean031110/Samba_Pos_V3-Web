// =====================================================================
// auditLog.js — Audit logging middleware
// =====================================================================
// Per FASE 18: every critical operation must be logged with:
//   - who (userId, username)
//   - when (timestamp)
//   - what (action, entityType, entityId)
//   - before/after state snapshots
//   - where (terminalId, ipAddress)
//
// Usage in routes:
//   router.post('/:id/close', auditLog('ticket.close'), handler);
// =====================================================================

const { db } = require('../../infrastructure/db/db');

/**
 * Middleware factory: creates an audit log entry after the route handler succeeds.
 * @param {string} action — e.g. 'ticket.close', 'payment.process', 'ticket.void'
 * @param {string} entityType — e.g. 'Ticket', 'Payment'
 */
function auditLog(action, entityType = null) {
  return async (req, res, next) => {
    // Store the original res.json to intercept the response
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only log on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const entityId = req.params.id ? parseInt(req.params.id, 10) : null;
          await db('AuditLogs').insert({
            Timestamp: new Date().toISOString(),
            UserId: req.user?.userId || 0,
            Username: req.user?.username || 'anonymous',
            Action: action,
            EntityType: entityType,
            EntityId: entityId,
            Before: null,   // Would need to capture before the handler runs
            After: JSON.stringify(body?.data || null).slice(0, 10000),
            TerminalId: req.headers['x-terminal-id'] || null,
            IpAddress: req.ip || req.socket?.remoteAddress,
            Details: JSON.stringify({
              method: req.method,
              path: req.path,
              body: req.body ? JSON.stringify(req.body).slice(0, 5000) : null,
            }),
          });
        } catch (err) {
          // Don't fail the request if audit log fails — just log the error
          console.error('[auditLog] Failed to write audit entry:', err.message);
        }
      }
      return originalJson(body);
    };
    next();
  };
}

/**
 * Helper to write an audit log entry directly (not as middleware).
 */
async function writeAuditLog({ userId, username, action, entityType, entityId, before, after, terminalId, ipAddress, details }) {
  try {
    await db('AuditLogs').insert({
      Timestamp: new Date().toISOString(),
      UserId: userId || 0,
      Username: username || 'system',
      Action: action,
      EntityType: entityType || null,
      EntityId: entityId || null,
      Before: before ? JSON.stringify(before).slice(0, 10000) : null,
      After: after ? JSON.stringify(after).slice(0, 10000) : null,
      TerminalId: terminalId || null,
      IpAddress: ipAddress || null,
      Details: details ? JSON.stringify(details).slice(0, 5000) : null,
    });
  } catch (err) {
    console.error('[auditLog] Failed to write audit entry:', err.message);
  }
}

module.exports = { auditLog, writeAuditLog };
