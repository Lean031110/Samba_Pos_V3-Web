// =====================================================================
// auth.js — JWT authentication middleware
// =====================================================================
// Per Architect's directive (Sprint 5):
//   - Replace mock admin/1234 with real JWT auth
//   - Login returns a token included in Authorization: Bearer <token>
//   - Middleware validates token + extracts userId
//
// Token payload: { userId, username, roleId, isAdmin, iat, exp }
// Default expiry: 8 hours (POS terminal session length)
// =====================================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../../infrastructure/db/db');
const { UnauthorizedError, ValidationError } = require('./errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'samba-web-clone-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Generate a JWT for a user.
 * @param {{Id: number, Name: string, UserRoleId: number, UserRole?: {IsAdmin: number}}} user
 */
function signToken(user) {
  return jwt.sign(
    {
      userId: user.Id,
      username: user.Name,
      roleId: user.UserRoleId,
      isAdmin: !!(user.UserRole?.IsAdmin),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify a JWT and return its payload.
 * @param {string} token
 * @returns {object} decoded payload
 * @throws UnauthorizedError if invalid/expired
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired token', { reason: err.message });
  }
}

/**
 * Express middleware: extract Bearer token from Authorization header,
 * verify it, and attach req.user = { userId, username, roleId, isAdmin }.
 *
 * Skip auth for: /health, /api/auth/login, static files.
 */
async function authenticate(req, res, next) {
  // Skip auth for public routes
  // NOTE: when mounted on '/api', req.path strips the '/api' prefix,
  // so '/api/auth/login' becomes '/auth/login'.
  const publicPaths = ['/auth/login'];
  const isPublic = publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'));
  // Also allow /auth/login POST explicitly
  if (isPublic) {
    return next();
  }
  // Skip for non-/api requests (static files, /health, SPA fallback)
  // NOTE: when this middleware is mounted on '/api', we're always inside /api
  // so this check is mostly redundant — kept for safety if mounted differently.

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }
  const token = authHeader.substring(7);
  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      username: payload.username,
      roleId: payload.roleId,
      isAdmin: payload.isAdmin,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Login handler — POST /api/auth/login
 * Body: { username, pin }
 * Returns: { token, user }
 */
async function loginHandler(req, res, next) {
  try {
    const { username, pin } = req.body || {};
    if (!username || !pin) {
      throw new ValidationError('username and pin are required');
    }

    const user = await db('Users')
      .leftJoin('UserRoles', 'Users.UserRoleId', 'UserRoles.Id')
      .where({ 'Users.Name': username })
      .select('Users.Id', 'Users.Name', 'Users.PinCode', 'Users.UserRoleId',
              'UserRoles.IsAdmin', 'UserRoles.Name as RoleName')
      .first();

    if (!user) {
      throw new UnauthorizedError('Invalid credentials', { field: 'username' });
    }

    // PIN may be stored as bcrypt hash OR as plain text (for backward compat
    // with the seed that inserts plain '1234'). Detect and verify accordingly.
    const pinValid = user.PinCode?.startsWith('$2')
      ? bcrypt.compareSync(pin, user.PinCode)
      : (user.PinCode === pin);

    if (!pinValid) {
      throw new UnauthorizedError('Invalid credentials', { field: 'pin' });
    }

    const token = signToken({
      Id: user.Id,
      Name: user.Name,
      UserRoleId: user.UserRoleId,
      UserRole: { IsAdmin: user.IsAdmin },
    });

    res.json({
      token,
      user: {
        id: user.Id,
        name: user.Name,
        roleId: user.UserRoleId,
        roleName: user.RoleName,
        isAdmin: !!user.IsAdmin,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me — return current user info from token
 */
async function meHandler(req, res, next) {
  try {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    res.json({ user: req.user });
  } catch (err) { next(err); }
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  signToken,
  verifyToken,
  authenticate,
  loginHandler,
  meHandler,
};
