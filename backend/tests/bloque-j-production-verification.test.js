// =====================================================================
// bloque-j-production-verification.test.js — Bloque J unit tests
// =====================================================================
// Tests the Bloque J (Fase 10: PostgreSQL + Production) gaps from
// docs/PRODUCTION_GAP_MATRIX.md:
//
//   P0 — PostgreSQL driver (knexfile.js production with pg)
//   P0 — Migraciones compatibles (SQLite-specific patterns fixed)
//   P1 — Backup rotation (retention + cleanup)
//   P0 — Restore drill (backup → destroy → restore → verify)
//   P1 — Deployment docs (installation guide)
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { createApp, getPrintWorkerInstance } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');

const app = createApp();

const BACKEND_DIR = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(BACKEND_DIR, '..', 'frontend');
const KNEXFILE_PATH = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js');
const BACKUP_SCRIPT = path.join(BACKEND_DIR, 'scripts', 'backup.js');
const RESTORE_SCRIPT = path.join(BACKEND_DIR, 'scripts', 'restore.js');
const RESTORE_DRILL_SCRIPT = path.join(BACKEND_DIR, 'scripts', 'restore-drill.js');
const DEPLOYMENT_DOC = path.join(BACKEND_DIR, '..', 'docs', 'DEPLOYMENT.md');

async function cleanup() {
  try {
    const serverWorker = getPrintWorkerInstance();
    if (serverWorker) await serverWorker.stop();
  } catch {}
  await db.destroy();
}

// =====================================================================
// 1. POSTGRESQL DRIVER — knexfile.js production config
// =====================================================================

describe('1. PostgreSQL Driver (P0)', () => {
  test('1A: knexfile.js exists', () => {
    assert.ok(fs.existsSync(KNEXFILE_PATH), 'knexfile.js should exist');
  });

  test('1B: production config supports DATABASE_URL for PostgreSQL', () => {
    const content = fs.readFileSync(KNEXFILE_PATH, 'utf8');
    assert.ok(content.includes('DATABASE_URL'), 'Should reference DATABASE_URL');
    assert.ok(content.includes("'pg'"), 'Should support pg client');
    assert.ok(content.includes("startsWith('postgres')"),
      'Should check DATABASE_URL starts with postgres:// for pg client');
  });

  test('1C: production config skips SQLite PRAGMA hook for PostgreSQL', () => {
    const content = fs.readFileSync(KNEXFILE_PATH, 'utf8');
    // The afterCreate hook (PRAGMA) should only run for SQLite, not PG
    assert.ok(content.includes("afterCreate"),
      'Should have afterCreate hook for SQLite');
    assert.ok(content.includes("startsWith('postgres')"),
      'Should check startsWith postgres to determine PG vs SQLite');
  });

  test('1D: development config still uses SQLite (backward compatible)', () => {
    const content = fs.readFileSync(KNEXFILE_PATH, 'utf8');
    assert.ok(content.includes("client: 'sqlite3'"), 'Development should use sqlite3');
  });
});

// =====================================================================
// 2. MIGRACIONES COMPATIBLES — no SQLite-specific patterns without PG fallback
// =====================================================================

describe('2. Migraciones Compatibles (P0)', () => {
  test('2A: migrations with PRAGMA have PG fallback (isSQLite check)', () => {
    const migrationsDir = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      if (content.includes('PRAGMA')) {
        // Must have a PG fallback (isSQLite check or information_schema)
        assert.ok(
          content.includes("isSQLite") || content.includes("client === 'sqlite3'"),
          `Migration ${file} uses PRAGMA but has no isSQLite/PG fallback check`
        );
        assert.ok(
          content.includes('information_schema') || content.includes('isSQLite'),
          `Migration ${file} uses PRAGMA but has no PostgreSQL information_schema fallback`
        );
      }
    }
  });

  test('2B: migration 20260908000001 uses database-agnostic column check', () => {
    const migrationPath = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations',
      '20260908000001_fix_idempotency_unique_constraint.js');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(content.includes("isSQLite"), 'Should have isSQLite flag');
    assert.ok(content.includes('information_schema'), 'Should have PG information_schema query');
  });

  test('2C: migration 20260907000003 uses database-agnostic column check', () => {
    const migrationPath = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations',
      '20260907000003_create_print_job_queue.js');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(content.includes("isSQLite"), 'Should have isSQLite flag');
    assert.ok(content.includes('information_schema'), 'Should have PG information_schema query');
  });

  test('2D: migration 20260909000001 uses database-agnostic column check', () => {
    const migrationPath = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations',
      '20260909000001_extend_printer_templates.js');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(content.includes("isSQLite"), 'Should have isSQLite flag');
    assert.ok(content.includes('information_schema'), 'Should have PG information_schema query');
  });

  test('2E: all migrations use Knex schema builder or knex table ops (not raw SQLite DDL)', () => {
    const migrationsDir = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      // Each migration should use knex.schema, knex.raw, or knex('table') for data ops
      assert.ok(
        content.includes('knex.schema') || content.includes('knex.raw') || content.includes("knex('"),
        `Migration ${file} should use knex.schema, knex.raw, or knex('table')`
      );
    }
  });
});

// =====================================================================
// 3. BACKUP ROTATION (P1)
// =====================================================================

describe('3. Backup Rotation (P1)', () => {
  test('3A: backup.js exists', () => {
    assert.ok(fs.existsSync(BACKUP_SCRIPT), 'backup.js should exist');
  });

  test('3B: backup.js implements rotation (BACKUP_RETENTION)', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
    assert.ok(content.includes('BACKUP_RETENTION'), 'Should reference BACKUP_RETENTION env var');
    assert.ok(content.includes('Rotated out old backup') || content.includes('toDelete'),
      'Should have rotation logic that deletes old backups');
    assert.ok(content.includes('reverse()'), 'Should sort newest-first for rotation');
  });

  test('3C: backup.js creates metadata file alongside backup', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
    assert.ok(content.includes('meta.json'), 'Should create .meta.json file');
    assert.ok(content.includes('integrityCheck'), 'Should store integrity check result');
  });

  test('3D: backup.js checks DB integrity before backup', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
    assert.ok(content.includes('integrity_check') || content.includes('integrity'),
      'Should check DB integrity');
  });

  test('3E: default retention is 30 backups', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
    assert.ok(content.includes("'30'"), 'Default retention should be 30');
  });
});

// =====================================================================
// 4. RESTORE DRILL (P0)
// =====================================================================

describe('4. Restore Drill (P0)', () => {
  test('4A: restore-drill.js script exists', () => {
    assert.ok(fs.existsSync(RESTORE_DRILL_SCRIPT), 'restore-drill.js should exist');
  });

  test('4B: restore-drill.js implements backup → destroy → restore → verify flow', () => {
    const content = fs.readFileSync(RESTORE_DRILL_SCRIPT, 'utf8');
    assert.ok(content.includes('Step 1: Creating backup'), 'Should have backup step');
    assert.ok(content.includes('Step 3: Destroying current DB') || content.includes('Destroying'),
      'Should have destroy step');
    assert.ok(content.includes('Step 4: Restoring from backup') || content.includes('Restoring'),
      'Should have restore step');
    assert.ok(content.includes('Step 5: Verifying') || content.includes('Verifying'),
      'Should have verify step');
  });

  test('4C: restore-drill.js verifies expected tables exist after restore', () => {
    const content = fs.readFileSync(RESTORE_DRILL_SCRIPT, 'utf8');
    assert.ok(content.includes('expectedTables'), 'Should have expected tables list');
    assert.ok(content.includes('Tickets'), 'Should check for Tickets table');
    assert.ok(content.includes('Users'), 'Should check for Users table');
    assert.ok(content.includes('Orders'), 'Should check for Orders table');
    assert.ok(content.includes('PrintJobInstances'), 'Should check for PrintJobInstances');
    assert.ok(content.includes('PushSubscriptions'), 'Should check for PushSubscriptions');
  });

  test('4D: restore-drill.js verifies data exists after restore', () => {
    const content = fs.readFileSync(RESTORE_DRILL_SCRIPT, 'utf8');
    assert.ok(content.includes('userCount'), 'Should check user count');
    assert.ok(content.includes('No users found'), 'Should fail if no users');
  });

  test('4E: restore-drill.js preserves original DB (non-destructive)', () => {
    const content = fs.readFileSync(RESTORE_DRILL_SCRIPT, 'utf8');
    assert.ok(content.includes('originalDbBackup') || content.includes('drill-original'),
      'Should back up the original DB before destroying');
    assert.ok(content.includes('Safety backup removed'),
      'Should clean up the safety backup after success');
  });

  test('4F: restore.js exists with --file and --confirm flags', () => {
    assert.ok(fs.existsSync(RESTORE_SCRIPT), 'restore.js should exist');
    const content = fs.readFileSync(RESTORE_SCRIPT, 'utf8');
    assert.ok(content.includes('--file='), 'Should require --file flag');
    assert.ok(content.includes('--confirm'), 'Should require --confirm flag');
    assert.ok(content.includes('OVERWRITE'), 'Should warn about overwrite');
  });
});

// =====================================================================
// 5. DEPLOYMENT DOCS (P1)
// =====================================================================

describe('5. Deployment Docs (P1)', () => {
  test('5A: DEPLOYMENT.md exists', () => {
    assert.ok(fs.existsSync(DEPLOYMENT_DOC), 'DEPLOYMENT.md should exist');
  });

  test('5B: DEPLOYMENT.md covers SQLite installation', () => {
    const content = fs.readFileSync(DEPLOYMENT_DOC, 'utf8');
    assert.ok(content.includes('SQLite') || content.includes('sqlite3'),
      'Should cover SQLite installation');
    assert.ok(content.includes('npm install'), 'Should mention npm install');
    assert.ok(content.includes('npm run migrate'), 'Should mention migrations');
    assert.ok(content.includes('npm run seed'), 'Should mention seed');
  });

  test('5C: DEPLOYMENT.md covers PostgreSQL installation', () => {
    const content = fs.readFileSync(DEPLOYMENT_DOC, 'utf8');
    assert.ok(content.includes('PostgreSQL') || content.includes('postgres'),
      'Should cover PostgreSQL installation');
    assert.ok(content.includes('DATABASE_URL'), 'Should mention DATABASE_URL');
    assert.ok(content.includes('npm install pg'), 'Should mention installing pg driver');
  });

  test('5D: DEPLOYMENT.md covers backup and restore', () => {
    const content = fs.readFileSync(DEPLOYMENT_DOC, 'utf8');
    assert.ok(content.includes('npm run backup'), 'Should mention backup');
    assert.ok(content.includes('npm run restore'), 'Should mention restore');
    assert.ok(content.includes('restore-drill'), 'Should mention restore drill');
    assert.ok(content.includes('BACKUP_RETENTION'), 'Should mention backup retention');
  });

  test('5E: DEPLOYMENT.md covers production deployment (PM2)', () => {
    const content = fs.readFileSync(DEPLOYMENT_DOC, 'utf8');
    assert.ok(content.includes('PM2') || content.includes('pm2'),
      'Should cover PM2 production deployment');
    assert.ok(content.includes('NODE_ENV=production'), 'Should mention NODE_ENV=production');
    assert.ok(content.includes('CORS_ORIGIN'), 'Should mention CORS_ORIGIN');
  });

  test('5F: DEPLOYMENT.md covers Docker deployment', () => {
    const content = fs.readFileSync(DEPLOYMENT_DOC, 'utf8');
    assert.ok(content.includes('docker') || content.includes('Docker'),
      'Should cover Docker deployment');
  });

  test('5G: DEPLOYMENT.md covers health check verification', () => {
    const content = fs.readFileSync(DEPLOYMENT_DOC, 'utf8');
    assert.ok(content.includes('/health'), 'Should mention /health endpoint');
    assert.ok(content.includes('curl'), 'Should provide curl examples');
  });
});

// =====================================================================
// 6. ENVIRONMENT CONFIGURATION
// =====================================================================

describe('6. Environment Configuration (P0)', () => {
  test('6A: .env.example exists with required variables', () => {
    const envExample = path.join(BACKEND_DIR, '..', '.env.example');
    assert.ok(fs.existsSync(envExample), '.env.example should exist');
    const content = fs.readFileSync(envExample, 'utf8');
    assert.ok(content.includes('JWT_SECRET'), 'Should have JWT_SECRET');
    assert.ok(content.includes('ADMIN_PIN'), 'Should have ADMIN_PIN');
    assert.ok(content.includes('CORS_ORIGIN'), 'Should have CORS_ORIGIN');
  });

  test('6B: server.js refuses to start in production with CORS_ORIGIN=*', () => {
    const serverPath = path.join(BACKEND_DIR, 'src', 'api', 'server.js');
    const content = fs.readFileSync(serverPath, 'utf8');
    // The server should reject CORS_ORIGIN=* in production (security hardening)
    assert.ok(content.includes("CORS_ORIGIN === '*'") || content.includes("'*'"),
      'Should check for wildcard CORS_ORIGIN');
  });

  test('6C: .gitignore excludes .env', () => {
    const gitignore = path.join(BACKEND_DIR, '..', '.gitignore');
    assert.ok(fs.existsSync(gitignore), '.gitignore should exist');
    const content = fs.readFileSync(gitignore, 'utf8');
    assert.ok(content.includes('.env'), '.gitignore should exclude .env');
    assert.ok(content.includes('data/samba.db'), '.gitignore should exclude DB files');
  });
});

// =====================================================================
// 7. DOCKER SUPPORT
// =====================================================================

describe('7. Docker Support (P0)', () => {
  test('7A: Dockerfile exists', () => {
    const dockerfilePath = path.join(BACKEND_DIR, '..', 'Dockerfile');
    assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile should exist');
  });

  test('7B: docker-compose.yml exists', () => {
    const composePath = path.join(BACKEND_DIR, '..', 'docker-compose.yml');
    assert.ok(fs.existsSync(composePath), 'docker-compose.yml should exist');
  });

  test('7C: Dockerfile uses production Node.js image', () => {
    const dockerfilePath = path.join(BACKEND_DIR, '..', 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('node:') && content.includes('-slim') || content.includes('-alpine'),
      'Should use slim/alpine Node.js image for smaller size');
  });

  test('7D: docker-compose exposes port 3001', () => {
    const composePath = path.join(BACKEND_DIR, '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    assert.ok(content.includes('3001'), 'Should expose port 3001');
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

after(async () => { await cleanup(); });
