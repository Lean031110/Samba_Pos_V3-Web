// =====================================================================
// auth.js — Auth routes (/api/auth)
// =====================================================================
//   POST /api/auth/login   — { username, pin } → { token, user }
//   GET  /api/auth/me      — returns current user from token
// =====================================================================

const express = require('express');
const { loginHandler, meHandler, loginLimiter } = require('../middleware/auth');

const router = express.Router();

router.post('/login', loginLimiter, loginHandler);
router.get('/me', meHandler);

module.exports = router;
