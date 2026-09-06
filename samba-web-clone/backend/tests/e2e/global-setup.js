// =====================================================================
// global-setup.js — Runs before all Playwright tests
// =====================================================================
// Waits for the server to be ready, then runs the seed.
// =====================================================================

module.exports = async function globalSetup() {
  const BASE = 'http://localhost:3001';

  // Wait for server to be ready
  let retries = 30;
  while (retries > 0) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
    retries--;
  }

  if (retries === 0) {
    throw new Error('Server did not start within 15 seconds');
  }

  // Run seed (idempotent — skips if data already exists)
  try {
    const { seed } = require('../../src/infrastructure/db/seeds/seed');
    const knex = require('knex');
    const config = require('../../src/infrastructure/db/knexfile');
    const env = process.env.NODE_ENV || 'development';
    const db = knex(config[env]);
    await seed(db);
    await db.destroy();
    console.log('[global-setup] Seed completed');
  } catch (err) {
    console.log('[global-setup] Seed skipped:', err.message);
  }
};
