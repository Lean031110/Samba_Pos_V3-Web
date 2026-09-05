// =====================================================================
// rbac.js — Role-Based Access Control middleware
// =====================================================================
// Usage in routes:
//   router.post('/:id/void', requirePermission('pos.void'), handler);
//
// The middleware checks if the authenticated user's role has the
// required permission. If not, returns 403 Forbidden.
//
// Admin users (IsAdmin=1) bypass all checks — they have all permissions.
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { ForbiddenError } = require('./errorHandler');

// Cache: roleId → Set of permission codes (loaded once per role)
const rolePermissionCache = new Map();

/**
 * Load permissions for a role into cache.
 */
async function loadRolePermissions(roleId) {
  const perms = await db('RolePermissions')
    .where({ UserRoleId: roleId })
    .join('Permissions', 'RolePermissions.PermissionId', 'Permissions.Id')
    .pluck('Permissions.Code');
  rolePermissionCache.set(roleId, new Set(perms));
  return perms;
}

/**
 * Check if a user has a specific permission.
 * @param {Object} user — req.user from JWT
 * @param {string} permissionCode — e.g. 'pos.void'
 * @returns {Promise<boolean>}
 */
async function hasPermission(user, permissionCode) {
  if (!user) return false;
  // Admin bypass
  if (user.isAdmin) return true;

  // Load from cache or DB
  let perms = rolePermissionCache.get(user.roleId);
  if (!perms) {
    const codes = await loadRolePermissions(user.roleId);
    perms = new Set(codes);
  }

  return perms.has(permissionCode) || perms.has('admin.all');
}

/**
 * Express middleware factory: require a specific permission.
 * @param {string} permissionCode — e.g. 'pos.void', 'kitchen.bump'
 */
function requirePermission(permissionCode) {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    try {
      const allowed = await hasPermission(req.user, permissionCode);
      if (!allowed) {
        return next(new ForbiddenError(
          `Permission denied: requires '${permissionCode}'`,
          { requiredPermission: permissionCode, userRole: req.user.roleId }
        ));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Clear the permission cache (for when roles are updated).
 */
function clearPermissionCache() {
  rolePermissionCache.clear();
}

module.exports = { requirePermission, hasPermission, clearPermissionCache, loadRolePermissions };
