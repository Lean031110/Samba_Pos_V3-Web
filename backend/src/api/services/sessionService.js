// =====================================================================
// sessionService.js — Session tracking and token revocation
// =====================================================================
// Fase 1 (guía maestra) — Device/session tracking and revocation.
//
// Tracks active JWT sessions per user+device. Allows:
//   - Listing active sessions
//   - Revoking a specific session (logout from a device)
//   - Revoking all sessions for a user (force logout)
//   - Checking if a token has been revoked
//
// Implementation: in-memory Set of jti (JWT ID) claims.
// For production with multiple server instances, this should be
// backed by Redis or a DB table. For single-instance deployment,
// in-memory is sufficient.
// =====================================================================

const crypto = require('crypto');

// In-memory store: Set of revoked JTIs
// (a JTI is a unique ID embedded in each JWT at sign time)
const revokedTokens = new Set();

// Active sessions: Map of userId → Set of { jti, deviceInfo, issuedAt }
const activeSessions = new Map();

/**
 * Generate a unique JTI (JWT ID) for a new token.
 */
function generateJTI() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Register a new session when a token is issued.
 * @param {number} userId
 * @param {string} jti — JWT ID
 * @param {Object} [deviceInfo] — { userAgent, ip, deviceId }
 */
function registerSession(userId, jti, deviceInfo = {}) {
  if (!activeSessions.has(userId)) {
    activeSessions.set(userId, new Map());
  }
  activeSessions.get(userId).set(jti, {
    ...deviceInfo,
    issuedAt: new Date().toISOString(),
  });
}

/**
 * Check if a JTI has been revoked.
 * @param {string} jti
 * @returns {boolean}
 */
function isRevoked(jti) {
  return revokedTokens.has(jti);
}

/**
 * Revoke a specific session (logout from one device).
 * @param {string} jti — JWT ID to revoke
 */
function revokeSession(jti) {
  revokedTokens.add(jti);
  // Remove from active sessions
  for (const [userId, sessions] of activeSessions.entries()) {
    if (sessions.has(jti)) {
      sessions.delete(jti);
      return { revoked: true, userId };
    }
  }
  return { revoked: true };
}

/**
 * Revoke all sessions for a user (force logout from all devices).
 * @param {number} userId
 * @returns {number} count of revoked sessions
 */
function revokeAllUserSessions(userId) {
  const sessions = activeSessions.get(userId);
  if (!sessions) return 0;
  let count = 0;
  for (const jti of sessions.keys()) {
    revokedTokens.add(jti);
    count++;
  }
  activeSessions.delete(userId);
  return count;
}

/**
 * List active sessions for a user.
 * @param {number} userId
 * @returns {Array} active sessions
 */
function listSessions(userId) {
  const sessions = activeSessions.get(userId);
  if (!sessions) return [];
  return Array.from(sessions.entries()).map(([jti, info]) => ({
    jti,
    ...info,
  }));
}

/**
 * Clean up expired revoked tokens (older than JWT_EXPIRES_IN).
 * Called periodically to prevent memory growth.
 */
function cleanupExpired(maxSize = 10000) {
  if (revokedTokens.size > maxSize) {
    // Simple strategy: clear all and start fresh
    // (expired tokens would fail JWT verification anyway)
    revokedTokens.clear();
    console.log('[session] Cleared revoked token cache (size limit reached)');
  }
}

module.exports = {
  generateJTI,
  registerSession,
  isRevoked,
  revokeSession,
  revokeAllUserSessions,
  listSessions,
  cleanupExpired,
};
