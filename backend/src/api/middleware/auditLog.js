// =====================================================================
// auditLog.js — Audit logging middleware (production-ready)
// =====================================================================
// Per FASE 18: every critical operation must be logged with:
//   - who (userId, username)
//   - when (timestamp)
//   - what (action, entityType, entityId)
//   - before/after state snapshots
//   - where (terminalId, ipAddress)
//
// Usage in routes:
//   router.post('/:id/close', auditLog('ticket.close', 'Ticket'), handler);
//
// The middleware captures the "before" state by reading the entity
// before the route handler runs, and the "after" state from the
// response body. Both are stored as JSON in the AuditLogs table.
// =====================================================================

const { db } = require('../../infrastructure/db/db');

/**
 * Middleware factory: creates an audit log entry after the route handler succeeds.
 * @param {string} action — e.g. 'ticket.close', 'payment.process', 'ticket.void'
 * @param {string} entityType — e.g. 'Ticket', 'Payment'
 */
function auditLog(action, entityType = null) {
  return async (req, res, next) => {
    // Capture "before" state for entity if we have an ID
    let beforeState = null;
    if (entityType && req.params.id) {
      try {
        const id = parseInt(req.params.id, 10);
        if (!isNaN(id)) {
          const table = entityType === 'Ticket' ? 'Tickets'
                      : entityType === 'Payment' ? 'Payments'
                      : entityType === 'Order' ? 'Orders'
                      : entityType === 'KitchenOrder' ? 'KitchenOrders'
                      : entityType === 'InventoryItem' ? 'InventoryItems'
                      : entityType === 'Product' ? 'MenuItems'
                      : entityType === 'User' ? 'Users'
                      : entityType === 'Printer' ? 'Printers'
                      : null;
          if (table) {
            beforeState = await db(table).where({ Id: id }).first();
          }
        }
      } catch (err) {
        // Don't fail the request if "before" capture fails
        console.error('[auditLog] Failed to capture before state:', err.message);
      }
    }

    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json to intercept the response
    res.json = function(body) {
      // Only log on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Fire-and-forget the audit log insert (don't block the response)
        const entityId = req.params.id ? parseInt(req.params.id, 10) : null;
        const logEntry = {
          Timestamp: new Date().toISOString(),
          UserId: req.user?.userId || 0,
          Username: req.user?.username || 'anonymous',
          Action: action,
          EntityType: entityType,
          EntityId: entityId,
          Before: beforeState ? JSON.stringify(beforeState).slice(0, 10000) : null,
          After: body?.data ? JSON.stringify(body.data).slice(0, 10000) : JSON.stringify(body || {}).slice(0, 10000),
          TerminalId: req.headers['x-terminal-id'] || null,
          IpAddress: req.ip || req.socket?.remoteAddress || null,
          Details: JSON.stringify({
            method: req.method,
            path: req.path,
            bodyKeys: req.body ? Object.keys(req.body) : [],
          }).slice(0, 5000),
        };

        // Insert asynchronously — don't await, don't block response
        db('AuditLogs').insert(logEntry).catch(err => {
          console.error('[auditLog] Failed to write audit entry:', err.message);
        });
      }
      // Call the original res.json synchronously
      return originalJson(body);
    };
    next();
  };
}

/**
 * Helper to write an audit log entry directly (not as middleware).
 * Use this in service code where you need to log without an HTTP response.
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
