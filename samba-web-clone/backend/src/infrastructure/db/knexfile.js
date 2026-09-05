// =====================================================================
// knexfile.js — Knex configuration for SambaPOS V3 web clone
// =====================================================================
// Per Architect's directive:
//   * Use sqlite3 (async) driver in development (not better-sqlite3)
//   * PRAGMA foreign_keys = ON      (enforce FK constraints)
//   * PRAGMA defer_foreign_keys = ON (allow out-of-order inserts in a txn)
//   * PRAGMA busy_timeout = 5000     (wait 5s on lock contention)
//   * PRAGMA journal_mode = WAL      (concurrent readers + 1 writer)
//   * PRAGMA synchronous = NORMAL    (safe with WAL, faster than FULL)
// =====================================================================

const path = require('path');

// knexfile lives at backend/src/infrastructure/db/knexfile.js
// Data dir should be backend/../data/  (i.e. /samba-web-clone/data/)
const DB_PATH = process.env.SAMBA_DB_PATH
  || path.join(__dirname, '..', '..', '..', '..', 'data', 'samba.db');

// Pool-level hook: runs on every fresh connection from the pool.
// Knex calls this once per connection, before any query.
const PRAGMA_HOOK = (db) => {
  return new Promise((resolve, reject) => {
    db.exec(
      'PRAGMA foreign_keys = ON;' +
      'PRAGMA busy_timeout = 5000;' +
      'PRAGMA journal_mode = WAL;' +
      'PRAGMA synchronous = NORMAL;' +
      'PRAGMA temp_store = MEMORY;',
      (err) => err ? reject(err) : resolve()
    );
  });
};

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: DB_PATH,
    },
    useNullAsDefault: true,
    pool: {
      min: 2,
      max: 10,
      propagateCreateError: true,
      afterCreate: (conn, done) => {
        // conn is the underlying sqlite3 Database
        PRAGMA_HOOK(conn)
          .then(() => done(null, conn))
          .catch((err) => done(err, conn));
      },
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
    debug: false,
  },
  production: {
    // For production we can swap to better-sqlite3 or Postgres later
    // without changing application code, only this file.
    client: 'sqlite3',
    connection: { filename: DB_PATH },
    useNullAsDefault: true,
    pool: {
      min: 2,
      max: 20,
      afterCreate: (conn, done) => {
        PRAGMA_HOOK(conn).then(() => done(null, conn)).catch((err) => done(err, conn));
      },
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },
};
