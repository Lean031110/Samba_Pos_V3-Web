// =====================================================================
// auth.js — Auth routes (/api/auth)
// =====================================================================
//   POST /api/auth/login       — { username, pin } → { token, user }
//   GET  /api/auth/me          — returns current user from token
//   POST /api/auth/logout     — revoke current session (JTI)
//   GET  /api/auth/sessions    — list active sessions for current user
//   POST /api/auth/revoke-all  — revoke all sessions for current user
// =====================================================================

const express = require('express');
const {
  loginHandler,
  meHandler,
  logoutHandler,
  listSessionsHandler,
  revokeAllHandler,
  loginLimiter,
} = require('../middleware/auth');

const router = express.Router();

// Public route (no auth required)
router.post('/login', loginLimiter, loginHandler);

// Authenticated routes
router.get('/me', meHandler);
router.post('/logout', logoutHandler);
router.get('/sessions', listSessionsHandler);
router.post('/revoke-all', revokeAllHandler);

module.exports = router;
