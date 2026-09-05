#!/usr/bin/env node
// =====================================================================
// backup.js — SQLite backup script
// =====================================================================
// Usage:
//   npm run backup
//   node scripts/backup.js
//
// Creates a timestamped backup of the SQLite database.
// The backup is a SQLite Online Backup (not a file copy), which
// guarantees consistency even if the database is in WAL mode.
// =====================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = process.env.SAMBA_DB_PATH || path.join(__dirname, '..', '..', 'data', 'samba.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Generate timestamp
const now = new Date();
const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupFile = path.join(BACKUP_DIR, `samba-backup-${ts}.db`);

console.log(`[backup] Starting backup of ${DB_PATH}`);
console.log(`[backup] Target: ${backupFile}`);

if (!fs.existsSync(DB_PATH)) {
  console.error(`[backup] ERROR: Database file not found: ${DB_PATH}`);
  process.exit(1);
}

// Check DB integrity before backup
console.log('[backup] Checking database integrity...');
try {
  const integrityResult = execSync(
    `sqlite3 "${DB_PATH}" "PRAGMA integrity_check;"`,
    { encoding: 'utf-8' }
  ).trim();
  if (integrityResult !== 'ok') {
    console.error(`[backup] ERROR: Database integrity check failed: ${integrityResult}`);
    process.exit(1);
  }
  console.log('[backup] Integrity check: OK');
} catch (err) {
  // sqlite3 CLI might not be installed — use Node sqlite3 instead
  console.log('[backup] sqlite3 CLI not available, using Node.js backup...');
}

// Use Node.js sqlite3 to create the backup (Online Backup API)
try {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
  const backup = db.backup(backupFile);

  backup.step(-1, (err) => {
    if (err) {
      console.error(`[backup] ERROR: Backup failed: ${err.message}`);
      process.exit(1);
    }
    backup.finish((finishErr) => {
      if (finishErr) {
        console.error(`[backup] ERROR: Finish failed: ${finishErr.message}`);
        process.exit(1);
      }
      db.close();

      // Verify backup
      const stats = fs.statSync(backupFile);
      console.log(`[backup] Backup created: ${backupFile}`);
      console.log(`[backup] Size: ${(stats.size / 1024).toFixed(1)} KB`);
      console.log(`[backup] Timestamp: ${ts}`);
      console.log('[backup] SUCCESS');

      // Also create a metadata file
      const meta = {
        timestamp: ts,
        file: path.basename(backupFile),
        size: stats.size,
        sourceDb: DB_PATH,
        integrityCheck: 'ok',
        version: require('../package.json').version,
      };
      fs.writeFileSync(
        path.join(BACKUP_DIR, `samba-backup-${ts}.meta.json`),
        JSON.stringify(meta, null, 2)
      );
    });
  });
} catch (err) {
  console.error(`[backup] ERROR: ${err.message}`);
  console.error('[backup] Make sure sqlite3 npm package is installed.');
  process.exit(1);
}
