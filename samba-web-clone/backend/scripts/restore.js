#!/usr/bin/env node
// =====================================================================
// restore.js — SQLite restore script
// =====================================================================
// Usage:
//   npm run restore -- --file data/backups/samba-backup-2024-09-08T12-00-00.db
//   node scripts/restore.js --file <backup-file>
//
// Restores a backup file to the active database.
// SAFETY: requires --confirm flag to prevent accidental restores.
// =====================================================================

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.SAMBA_DB_PATH || path.join(__dirname, '..', '..', 'data', 'samba.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');

// Parse args
const args = process.argv.slice(2);
const fileArg = args.find(a => a.startsWith('--file='));
const confirmArg = args.includes('--confirm');

if (!fileArg) {
  console.error('[restore] ERROR: --file=<path> is required');
  console.error('[restore] Usage: node scripts/restore.js --file=<backup-file> --confirm');
  console.error('[restore] Available backups:');
  if (fs.existsSync(BACKUP_DIR)) {
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
    backups.forEach(b => console.error(`  ${path.join(BACKUP_DIR, b)}`));
  }
  process.exit(1);
}

const backupFile = fileArg.replace('--file=', '');
const backupPath = path.isAbsolute(backupFile) ? backupFile : path.join(BACKUP_DIR, backupFile);

if (!fs.existsSync(backupPath)) {
  console.error(`[restore] ERROR: Backup file not found: ${backupPath}`);
  process.exit(1);
}

if (!confirmArg) {
  console.error('[restore] ERROR: --confirm flag is required for safety');
  console.error('[restore] This will OVERWRITE the current database!');
  console.error('[restore] Run: node scripts/restore.js --file=<path> --confirm');
  process.exit(1);
}

console.log(`[restore] Source: ${backupPath}`);
console.log(`[restore] Target: ${DB_PATH}`);

// Backup current DB before overwriting
if (fs.existsSync(DB_PATH)) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const preRestoreBackup = `${DB_PATH}.pre-restore-${ts}`;
  console.log(`[restore] Backing up current DB to: ${preRestoreBackup}`);
  fs.copyFileSync(DB_PATH, preRestoreBackup);
  // Also copy WAL and SHM if they exist
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(DB_PATH + ext)) {
      fs.copyFileSync(DB_PATH + ext, preRestoreBackup + ext);
    }
  }
}

// Remove current DB files
console.log('[restore] Removing current database files...');
try { fs.unlinkSync(DB_PATH); } catch {}
try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}

// Copy backup to DB path
console.log('[restore] Copying backup to database path...');
fs.copyFileSync(backupPath, DB_PATH);

// Verify
const stats = fs.statSync(DB_PATH);
console.log(`[restore] Restored database size: ${(stats.size / 1024).toFixed(1)} KB`);
console.log('[restore] SUCCESS — database restored');
console.log('[restore] You may need to restart the server.');
