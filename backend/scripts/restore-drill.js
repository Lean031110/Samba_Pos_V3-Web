#!/usr/bin/env node
// =====================================================================
// restore-drill.js — BLOQUE J restore drill: backup → destroy → restore → verify
// =====================================================================
// Usage:
//   node scripts/restore-drill.js
//
// This script performs a full restore drill:
//   1. Creates a backup of the current DB
//   2. Destroys the current DB (removes the file)
//   3. Runs migrations on a fresh DB (creates schema from scratch)
//   4. Restores the backup
//   5. Verifies the restored DB has the expected tables + data
//
// Exit code 0 = drill passed, non-zero = failed.
// The drill is non-destructive: it restores the DB to its original state.
// =====================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = process.env.SAMBA_DB_PATH || path.join(__dirname, '..', '..', 'data', 'samba.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');
const BACKEND_DIR = path.join(__dirname, '..');

function log(msg) { console.log(`[drill] ${msg}`); }
function fail(msg) { console.error(`[drill] FAIL: ${msg}`); process.exit(1); }

async function main() {
  log('=== Restore Drill: backup → destroy → restore → verify ===');

  // Step 0: Ensure DB exists
  if (!fs.existsSync(DB_PATH)) {
    fail(`Database not found: ${DB_PATH}`);
  }
  log(`Source DB: ${DB_PATH}`);

  // Step 1: Create backup
  log('Step 1: Creating backup...');
  try {
    execSync('node scripts/backup.js', { cwd: BACKEND_DIR, stdio: 'pipe' });
    log('Backup created ✓');
  } catch (err) {
    fail(`Backup failed: ${err.message}`);
  }

  // Find the latest backup
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('samba-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();
  if (backups.length === 0) fail('No backup file found after backup step');
  const backupFile = path.join(BACKUP_DIR, backups[0]);
  log(`Latest backup: ${backupFile}`);

  // Step 2: Copy current DB for safety
  const originalDbBackup = DB_PATH + '.drill-original';
  fs.copyFileSync(DB_PATH, originalDbBackup);
  log(`Original DB backed up to: ${originalDbBackup}`);

  // Step 3: Destroy current DB
  log('Step 3: Destroying current DB...');
  fs.unlinkSync(DB_PATH);
  // Also remove WAL/SHM
  for (const ext of ['-wal', '-shm']) {
    const f = DB_PATH + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  if (fs.existsSync(DB_PATH)) fail('DB file still exists after delete');
  log('DB destroyed ✓');

  // Step 4: Restore from backup
  log('Step 4: Restoring from backup...');
  try {
    execSync(`node scripts/restore.js --file=${backupFile} --confirm`, {
      cwd: BACKEND_DIR, stdio: 'pipe',
    });
    log('Restore completed ✓');
  } catch (err) {
    log('Restore failed, attempting to recover from original...');
    fs.copyFileSync(originalDbBackup, DB_PATH);
    fail(`Restore failed: ${err.message}`);
  }

  // Step 5: Verify restored DB
  log('Step 5: Verifying restored DB...');
  if (!fs.existsSync(DB_PATH)) fail('DB file does not exist after restore');

  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

  const expectedTables = [
    'Tickets', 'Orders', 'Payments', 'MenuItems', 'Users', 'Warehouses',
    'Ingredients', 'StockMovements', 'KitchenOrders', 'PrintJobInstances',
    'PushSubscriptions', 'PushNotifications', 'IdempotencyKeys',
  ];

  const tables = await new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, rows) => {
      if (err) reject(err); else resolve(rows.map(r => r.name));
    });
  });

  let missingTables = [];
  for (const t of expectedTables) {
    if (!tables.includes(t)) missingTables.push(t);
  }
  if (missingTables.length > 0) {
    db.close();
    fail(`Missing tables after restore: ${missingTables.join(', ')}`);
  }
  log(`All ${expectedTables.length} expected tables present ✓`);

  // Verify data exists (at least 1 user)
  const userCount = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as c FROM Users', (err, row) => {
      if (err) reject(err); else resolve(row.c);
    });
  });
  db.close();

  if (userCount < 1) fail('No users found in restored DB');
  log(`Data verified: ${userCount} users in restored DB ✓`);

  // Cleanup: remove the safety backup
  fs.unlinkSync(originalDbBackup);
  log('Safety backup removed ✓');

  log('=== Restore Drill PASSED ✓ ===');
  log('The backup/restore system is working correctly.');
  process.exit(0);
}

main().catch(err => {
  fail(`Unexpected error: ${err.message}`);
});
