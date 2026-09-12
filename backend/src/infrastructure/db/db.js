// =====================================================================
// db.js — Knex instance + transaction helpers
// =====================================================================
// Singleton: every repository imports `db` from here, never creates
// its own knex instance.
//
// Per Architect's directive: defer_foreign_keys = ON must be set inside
// every transaction (not just at connection time) because SQLite resets
// it per-transaction. The `withTransaction` helper below does that.
// =====================================================================

const knex = require('knex');
const config = require('./knexfile.js');

const environment = process.env.NODE_ENV || 'development';
// Fallback: if the environment is not in the config (e.g., 'test'), use 'development'
const activeConfig = config[environment] || config.development;
const db = knex(activeConfig);

// Force-create the data directory if missing (so first `migrate` works)
const path = require('path');
const fs = require('fs');
const dataDir = path.dirname(activeConfig.connection.filename);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Run `fn` inside a Knex transaction.
 * Inside the txn, `PRAGMA defer_foreign_keys = ON` is set so that
 * out-of-order inserts (e.g. child before parent) succeed.
 *
 * @param {(trx: Knex.Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  return db.transaction(async (trx) => {
    // SQLite: defer FK checks until COMMIT within this txn
    await trx.raw('PRAGMA defer_foreign_keys = ON');
    return fn(trx);
  });
}

/**
 * Helper to execute PRAGMA on the current connection (rarely needed).
 */
async function execPragma(pragma) {
  return db.raw(pragma);
}

module.exports = {
  db,
  withTransaction,
  execPragma,
};
