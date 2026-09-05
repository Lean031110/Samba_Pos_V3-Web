// =====================================================================
// auth.js — JWT authentication middleware (production-ready)
// =====================================================================
// Per Sprint 5 audit:
//   - bcrypt REQUIRED (no plaintext PIN acceptance)
//   - JWT secret MUST be set via env (no insecure defaults)
//   - Rate limiting on login endpoint (brute force protection)
//   - req.user populated on every authenticated request
// =====================================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../../infrastructure/db/db');
const { UnauthorizedError, ValidationError } = require('./errorHandler');

// JWT secret MUST be set via environment variable. No insecure defaults.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required. Refusing to start.');
  console.error('Set it with: export JWT_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Rate limiter for login endpoint — prevents brute force on 4-digit PINs.
 * 5 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 5,                      // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

/**
 * Generate a JWT for a user.
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
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired token', { reason: err.message });
  }
}

/**
 * Express middleware: extract Bearer token, verify it, attach req.user.
 * Skips /auth/login (public) and non-/api routes (static files).
 */
async function authenticate(req, res, next) {
  // Skip auth for login route
  const publicPaths = ['/auth/login'];
  if (publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }

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
 *
 * SECURITY: bcrypt is REQUIRED. Plaintext PINs are rejected.
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
      throw new UnauthorizedError('Invalid credentials');
    }

    // SECURITY: PinCode MUST be a bcrypt hash (starts with $2).
    // Plaintext PINs are rejected — no backward-compat backdoor.
    if (!user.PinCode || !user.PinCode.startsWith('$2')) {
      console.error(`[SECURITY] User "${username}" has a non-bcrypt PinCode. Refusing login. Run the bcrypt migration.`);
      throw new UnauthorizedError('Invalid credentials');
    }

    // Use async compare to avoid blocking the event loop
    const pinValid = await bcrypt.compare(pin, user.PinCode);
    if (!pinValid) {
      throw new UnauthorizedError('Invalid credentials');
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
  loginLimiter,
};
