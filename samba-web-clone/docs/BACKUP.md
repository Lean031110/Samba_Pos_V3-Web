# BACKUP.md — Backup and Restore

## Overview

The backup system uses SQLite's Online Backup API to create consistent snapshots of the database, even while the server is running in WAL mode.

## Backup

### Manual Backup

```bash
cd backend
npm run backup
```

Output:
```
[backup] Starting backup of data/samba.db
[backup] Target: data/backups/samba-backup-2026-09-08T12-00-00.db
[backup] Checking database integrity...
[backup] Integrity check: OK
[backup] Backup created: data/backups/samba-backup-2026-09-08T12-00-00.db
[backup] Size: 804.0 KB
[backup] SUCCESS
```

### Automated Backup (Cron)

```bash
# Daily backup at 2 AM
0 2 * * * cd /app && npm run backup >> /var/log/samba-backup.log 2>&1
```

### What Gets Backed Up

- Full database schema (all tables, indexes, constraints)
- All data (tickets, orders, payments, inventory, audit logs, etc.)
- SQLite WAL is checkpointed during backup

### Backup Files

Each backup creates two files:
- `samba-backup-<timestamp>.db` — the database file
- `samba-backup-<timestamp>.meta.json` — metadata (timestamp, size, version, integrity)

## Restore

### Restore from Backup

```bash
cd backend
npm run restore -- --file=samba-backup-2026-09-08T12-00-00.db --confirm
```

**Safety:** The `--confirm` flag is required to prevent accidental restores.

### What Happens During Restore

1. Current database is backed up to `samba.db.pre-restore-<timestamp>`
2. Current DB, WAL, and SHM files are deleted
3. Backup file is copied to the database path
4. Server needs to be restarted

### Restore in Docker

```bash
# Copy backup into container
docker cp samba-backup-*.db samba-pos:/app/data/backups/

# Restore
docker compose exec samba-pos node scripts/restore.js --file=samba-backup-*.db --confirm

# Restart
docker compose restart samba-pos
```

## Integrity Verification

The backup script runs `PRAGMA integrity_check` before creating the backup. If the check fails, the backup is aborted.

After restore, you can verify integrity:

```bash
node -e "const s=require('sqlite3');const d=new s.Database('data/samba.db');d.all('PRAGMA integrity_check',[],(e,r)=>{console.log(r);d.close()})"
```

Expected output: `{ integrity_check: 'ok' }`

## Backup Strategy Recommendations

| Frequency | Retention | Storage |
|-----------|-----------|--------|
| Daily (2 AM) | 7 days | Local (data/backups/) |
| Weekly (Sunday) | 4 weeks | External (copy to NAS/USB) |
| Monthly (1st) | 12 months | Offsite (cloud storage) |

## Disaster Recovery

1. Stop the server: `docker compose down`
2. Restore latest good backup: `npm run restore -- --file=<backup> --confirm`
3. Start the server: `docker compose up -d`
4. Verify: `curl http://localhost:3001/health`
5. Test login: `curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"Administrator","pin":"<pin>"}'`
