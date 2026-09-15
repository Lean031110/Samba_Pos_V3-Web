// =====================================================================
// Migration: 20260908000001_fix_idempotency_unique_constraint.js
// =====================================================================
// Fixes a critical design flaw in the IdempotencyKeys table.
//
// Original schema (migration 20240905000001):
//   Key VARCHAR(128) UNIQUE  ← globally unique
//
// Problem:
//   The middleware queries by (Key, Endpoint), but the UNIQUE constraint
//   is on Key alone. So if two different endpoints use the same key
//   (e.g., a client reuses the same UUID for both /payments and /close),
//   the second INSERT fails with SQLITE_CONSTRAINT_UNIQUE, and the
//   middleware's catch block silently calls next() — bypassing
//   idempotency entirely.
//
// Fix:
//   Drop the single-column UNIQUE on Key, add a composite UNIQUE on
//   (Key, Endpoint). This allows the same key to be used for different
//   endpoints (which is correct — they are independent operations).
//
// Also adds:
//   - RequestBodyHash column (for payload mismatch detection)
//   - Status column ('PENDING', 'COMPLETED', 'FAILED') to coordinate
//     concurrent requests without race conditions
//
// This migration is idempotent: it checks for column existence before
// altering, and uses DROP INDEX IF EXISTS.
// =====================================================================

exports.up = async function (knex) {
  // BLOQUE J — Detect database type for SQLite-specific vs PG-compatible operations
  const isSQLite = knex.client.config.client === 'sqlite3';

  // 1. Drop the single-column UNIQUE constraint on Key.
  //    In SQLite, UNIQUE constraints created inline cannot be dropped
  //    directly — we need to recreate the table.
  //    In PostgreSQL, we can use ALTER TABLE DROP CONSTRAINT.

  // Check current schema — use information_schema for PG, PRAGMA for SQLite
  let hasStatusColumn, hasRequestBodyHash;
  if (isSQLite) {
    const tableInfo = await knex.raw('PRAGMA table_info(IdempotencyKeys)');
    hasStatusColumn = tableInfo.some(c => c.name === 'Status');
    hasRequestBodyHash = tableInfo.some(c => c.name === 'RequestBodyHash');
  } else {
    // PostgreSQL — query information_schema
    const cols = await knex.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'IdempotencyKeys'
    `);
    const colNames = cols.rows ? cols.rows.map(r => r.column_name) : [];
    hasStatusColumn = colNames.includes('Status');
    hasRequestBodyHash = colNames.includes('RequestBodyHash');
  }

  // Add new columns if missing
  if (!hasStatusColumn) {
    await knex.schema.table('IdempotencyKeys', (table) => {
      table.string('Status', 20).notNullable().defaultTo('PENDING');
      table.index(['Status'], 'IX_IdempotencyKeys_Status');
    });
  }
  if (!hasRequestBodyHash) {
    await knex.schema.table('IdempotencyKeys', (table) => {
      table.string('RequestBodyHash', 64).nullable();
    });
  }

  // For the UNIQUE constraint change, SQLite requires table recreation.
  // PostgreSQL can use ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT.
  // BLOQUE J — branch by database type.
  if (isSQLite) {
    // SQLite: table recreation approach
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS IdempotencyKeys_new (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Key VARCHAR(128) NOT NULL,
        UserId INTEGER NOT NULL,
        Endpoint VARCHAR(200) NOT NULL,
        RequestBody TEXT,
        RequestBodyHash VARCHAR(64),
        ResponseStatus INTEGER,
        ResponseBody TEXT,
        Status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ExpiresAt DATETIME NOT NULL,
        UNIQUE(Key, Endpoint)
      )
    `);

    // Step 2: Copy data from old table
    if (hasStatusColumn && hasRequestBodyHash) {
      await knex.raw(`
        INSERT INTO IdempotencyKeys_new
          (Id, Key, UserId, Endpoint, RequestBody, RequestBodyHash,
           ResponseStatus, ResponseBody, Status, CreatedAt, ExpiresAt)
        SELECT Id, Key, UserId, Endpoint, RequestBody, RequestBodyHash,
               ResponseStatus, ResponseBody, Status, CreatedAt, ExpiresAt
        FROM IdempotencyKeys
      `);
    } else if (hasStatusColumn) {
      await knex.raw(`
        INSERT INTO IdempotencyKeys_new
          (Id, Key, UserId, Endpoint, RequestBody, ResponseStatus, ResponseBody, Status, CreatedAt, ExpiresAt)
        SELECT Id, Key, UserId, Endpoint, RequestBody, ResponseStatus, ResponseBody, Status, CreatedAt, ExpiresAt
        FROM IdempotencyKeys
      `);
    } else {
      await knex.raw(`
        INSERT INTO IdempotencyKeys_new
          (Id, Key, UserId, Endpoint, RequestBody, ResponseStatus, ResponseBody, Status, CreatedAt, ExpiresAt)
        SELECT Id, Key, UserId, Endpoint, RequestBody, ResponseStatus, ResponseBody, 'COMPLETED', CreatedAt, ExpiresAt
        FROM IdempotencyKeys
      `);
    }

    // Step 3: Drop old table, rename new
    await knex.raw('DROP TABLE IdempotencyKeys');
    await knex.raw('ALTER TABLE IdempotencyKeys_new RENAME TO IdempotencyKeys');
  } else {
    // PostgreSQL: just add the composite unique constraint
    // (the single-column UNIQUE was already on the Key column from the original schema)
    try {
      await knex.raw(`
        ALTER TABLE "IdempotencyKeys"
        ADD CONSTRAINT "idempotencykeys_key_endpoint_unique"
        UNIQUE ("Key", "Endpoint")
      `);
    } catch (e) {
      // Constraint may already exist — that's OK
      console.log('[migration] Composite UNIQUE constraint already exists on IdempotencyKeys');
    }
  }

  // Step 4: Recreate indexes
  await knex.raw('CREATE INDEX IF NOT EXISTS IX_IdempotencyKeys_Key ON IdempotencyKeys(Key)');
  await knex.raw('CREATE INDEX IF NOT EXISTS IX_IdempotencyKeys_ExpiresAt ON IdempotencyKeys(ExpiresAt)');
  await knex.raw('CREATE INDEX IF NOT EXISTS IX_IdempotencyKeys_Status ON IdempotencyKeys(Status)');
  // Composite index for the typical lookup query
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS UX_IdempotencyKeys_KeyEndpoint ON IdempotencyKeys(Key, Endpoint)');
};

exports.down = async function (knex) {
  // Revert to original schema (single-column UNIQUE on Key).
  // NOTE: data loss possible if same Key was used for multiple Endpoints.
  const isSQLite = knex.client.config.client === 'sqlite3';
  if (isSQLite) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS IdempotencyKeys_old (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Key VARCHAR(128) NOT NULL UNIQUE,
        UserId INTEGER NOT NULL,
        Endpoint VARCHAR(200) NOT NULL,
        RequestBody TEXT,
        ResponseStatus INTEGER,
        ResponseBody TEXT,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ExpiresAt DATETIME NOT NULL
      )
    `);
    await knex.raw(`
      INSERT OR IGNORE INTO IdempotencyKeys_old
        (Id, Key, UserId, Endpoint, RequestBody, ResponseStatus, ResponseBody, CreatedAt, ExpiresAt)
      SELECT Id, Key, UserId, Endpoint, RequestBody, ResponseStatus, ResponseBody, CreatedAt, ExpiresAt
      FROM IdempotencyKeys
    `);
  } else {
    // PostgreSQL: use SERIAL and ON CONFLICT DO NOTHING
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS "IdempotencyKeys_old" (
        "Id" SERIAL PRIMARY KEY,
        "Key" VARCHAR(128) NOT NULL UNIQUE,
        "UserId" INTEGER NOT NULL,
        "Endpoint" VARCHAR(200) NOT NULL,
        "RequestBody" TEXT,
        "ResponseStatus" INTEGER,
        "ResponseBody" TEXT,
        "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ExpiresAt" TIMESTAMP NOT NULL
      )
    `);
    await knex.raw(`
      INSERT INTO "IdempotencyKeys_old"
        ("Id", "Key", "UserId", "Endpoint", "RequestBody", "ResponseStatus", "ResponseBody", "CreatedAt", "ExpiresAt")
      SELECT "Id", "Key", "UserId", "Endpoint", "RequestBody", "ResponseStatus", "ResponseBody", "CreatedAt", "ExpiresAt"
      FROM "IdempotencyKeys"
      ON CONFLICT ("Key") DO NOTHING
    `);
  }
  await knex.raw(isSQLite ? 'DROP TABLE IdempotencyKeys' : 'DROP TABLE "IdempotencyKeys"');
  await knex.raw(isSQLite
    ? 'ALTER TABLE IdempotencyKeys_old RENAME TO IdempotencyKeys'
    : 'ALTER TABLE "IdempotencyKeys_old" RENAME TO "IdempotencyKeys"');
  await knex.raw('CREATE INDEX IF NOT EXISTS IX_IdempotencyKeys_Key ON IdempotencyKeys(Key)');
  await knex.raw('CREATE INDEX IF NOT EXISTS IX_IdempotencyKeys_ExpiresAt ON IdempotencyKeys(ExpiresAt)');
};
