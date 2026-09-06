# PRODUCTION.md — Production Deployment Guide

## Prerequisites

- Docker 20+ and Docker Compose
- A LAN network (no internet required after build)
- Thermal printer(s) with TCP/IP connectivity (port 9100)

## Quick Start (Docker)

```bash
# 1. Generate secrets
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PIN=your-secure-pin

# 2. Build and start
docker compose up -d --build

# 3. Access
# → http://localhost:3001
# → Login: Administrator / $ADMIN_PIN

# 4. Seed the database (first time only)
docker compose exec samba-pos npm run seed
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **YES** | — | Secret for signing JWT tokens (min 32 chars) |
| `ADMIN_PIN` | **YES** (for seed) | — | Initial admin PIN (4+ digits) |
| `PORT` | No | 3001 | HTTP + WebSocket port |
| `NODE_ENV` | No | production | Environment |
| `SAMBA_DB_PATH` | No | /app/data/samba.db | SQLite database path |
| `CORS_ORIGIN` | No | * | Comma-separated allowed origins |
| `JWT_EXPIRES_IN` | No | 8h | Token expiration |

## Non-Docker Deployment

```bash
cd backend
npm ci --omit=dev
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PIN=your-pin

# Migrate + seed
npm run migrate
npm run seed

# Start
npm start
```

## Multi-Terminal Setup

1. Deploy the server on a dedicated machine (or Docker container)
2. Configure each POS terminal to point to the server IP
3. Each terminal opens a browser to `http://<server-ip>:3001`
4. WebSocket connects automatically with JWT authentication
5. Events are routed by role:
   - POS terminals: `role:pos` + `ticket:${id}`
   - Kitchen terminal: `role:kitchen`
   - Admin: `role:admin`

## Security Checklist

- [ ] JWT_SECRET set (not default)
- [ ] ADMIN_PIN changed from default
- [ ] CORS_ORIGIN set to specific origins (not *)
- [ ] Firewall: only expose port 3001
- [ ] Database file backed up regularly
- [ ] HTTPS configured (reverse proxy: nginx/caddy)
- [ ] Rate limiting active (5 login attempts / 15 min)

## Graceful Shutdown

The server handles SIGTERM/SIGINT:
1. Stops accepting new connections
2. Closes WebSocket server
3. Waits 1s for in-flight requests
4. Closes database connection
5. Exits with code 0

## Backup Strategy

```bash
# Manual backup
npm run backup

# Automated (cron)
0 2 * * * cd /app && npm run backup

# Restore
npm run restore -- --file=data/backups/samba-backup-YYYY-MM-DDTHH-MM-SS.db --confirm
```

Backups are stored in `data/backups/` with timestamp + metadata.
