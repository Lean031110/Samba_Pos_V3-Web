// =====================================================================
// knexfile.js — Knex configuration for SambaPos_LBA
// =====================================================================
// PRAGMAs activated (verified by Fase 12 audit):
//   * PRAGMA foreign_keys = ON      (enforce FK constraints)
//   * PRAGMA busy_timeout = 5000    (wait 5s on lock contention)
//   * PRAGMA journal_mode = WAL      (concurrent readers + 1 writer)
//   * PRAGMA synchronous = NORMAL    (safe with WAL, faster than FULL)
//   * PRAGMA temp_store = MEMORY     (temp tables in RAM, not disk)
//
// NOTE on defer_foreign_keys:
//   The original comment claimed `PRAGMA defer_foreign_keys = ON` was
//   active, but it was NOT in the exec() call below. This is a SQLite
//   pragma that, when set inside a transaction, allows out-of-order
//   inserts (children before parents) without FK violations. It is
//   only meaningful inside a BEGIN...COMMIT block.
//
//   We do NOT enable it globally here because:
//     1. It has no effect outside a transaction.
//     2. Setting it in afterCreate (connection pool level) would
//        apply it to the connection, but it's reset on COMMIT/ROLLBACK.
//     3. Our code always inserts parent-then-child, so it's not needed.
//
//   If a future feature requires out-of-order inserts, the caller
//   should run `db.raw('PRAGMA defer_foreign_keys = ON')` inside its
//   transaction explicitly.
// =====================================================================

const path = require('path');

// knexfile lives at backend/src/infrastructure/db/knexfile.js
// To reach <repo-root>/data/samba.db we go up 4 levels:
//   db → infrastructure → src → backend → <repo-root>
// (Same depth as before reorganization — `samba-web-clone/` was a sibling of `data/`,
//  so removing the wrapper did not change the depth of `data/` relative to this file.)
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
    // BLOQUE J — Fase 10: PostgreSQL support for production.
    // Set DATABASE_URL=postgres://user:pass@host:5432/dbname to use PostgreSQL.
    // Falls back to SQLite if DATABASE_URL is not set or doesn't start with 'postgres'.
    client: (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) ? 'pg' : 'sqlite3',
    connection: (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres'))
      ? process.env.DATABASE_URL
      : { filename: DB_PATH },
    useNullAsDefault: !(process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')),
    pool: {
      min: 2,
      max: 20,
      // SQLite PRAGMA hook — only runs for SQLite, not PG
      ...(!(process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) ? {
        afterCreate: (conn, done) => {
          PRAGMA_HOOK(conn).then(() => done(null, conn)).catch((err) => done(err, conn));
        },
      } : {}),
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
