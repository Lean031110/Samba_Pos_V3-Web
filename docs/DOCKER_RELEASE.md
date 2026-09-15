# DOCKER_RELEASE.md — Deployment Guide

> Guía oficial para deployment de SambaPos_LBA vía Docker.

## Requisitos

- Docker 24+
- Docker Compose v2+
- Puerto 3001 disponible

## Build local

```bash
# Build image
docker build -t sambapos-lba:local .

# Run container
docker run -d \
  --name samba-pos \
  -p 3001:3001 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_PIN=your-pin \
  -e CORS_ORIGIN=https://pos.example.com \
  -e NODE_ENV=production \
  sambapos-lba:local
```

## docker-compose (recomendado)

```bash
# Set required env vars
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PIN=your-secure-pin
export CORS_ORIGIN=https://pos.example.com

# Build + start
docker compose up -d --build

# Check health
curl http://localhost:3001/ready
# Expected: {"status":"ready",...}

# First-time seed (only if DB is empty)
docker compose exec samba-pos npm run seed
```

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `JWT_SECRET` | ✅ SÍ | — | Secreto JWT, mínimo 32 chars |
| `ADMIN_PIN` | ✅ SÍ | — | PIN del usuario admin seed |
| `CORS_ORIGIN` | ✅ SÍ (prod) | — | Origins permitidos, comma-separated |
| `NODE_ENV` | ✅ SÍ | — | `production` |
| `PORT` | ❌ | `3001` | Puerto del server |
| `SAMBA_DB_PATH` | ❌ | `/app/data/samba.db` | Path SQLite DB |
| `JWT_EXPIRES_IN` | ❌ | `8h` | Expiración del token |
| `DATABASE_URL` | ❌ | — | Si se setea a `postgres://...` usa PG |

## Endpoints de salud

- `GET /health` — liveness (no checkea DB)
- `GET /ready` — readiness (checkea DB + WebSocket)

## Imagen publicada (GHCR)

Imagen oficial en GitHub Container Registry:

```bash
docker pull ghcr.io/lean031110/samba_pos_v3-web:latest
```

Tags disponibles:
- `:latest` — última release
- `:v0.6.1` — versión específica
- `:sha-<7chars>` — commit específico

## Multi-arch

Las imágenes publicadas soportan:
- `linux/amd64`
- `linux/arm64`

## Smoke test (CI)

El workflow `docker-release.yml` ejecuta automáticamente:

1. `docker build` multi-arch
2. `docker pull` de la imagen publicada
3. `docker run` con env vars de prueba
4. `curl /ready` — debe responder 200 con DB + WebSocket OK
5. `curl /health` — liveness check
6. Limpieza del contenedor

## Backup / Restore

### Backup SQLite

```bash
# Backup
docker compose exec samba-pos sqlite3 /app/data/samba.db .dump > backup.sql

# Restore
cat backup.sql | docker compose exec -T samba-pos sqlite3 /app/data/samba.db
```

### Backup volumen

```bash
# Backup
docker run --rm -v samba-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/samba-data-$(date +%Y%m%d).tar.gz /data

# Restore
docker run --rm -v samba-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/samba-data-YYYYMMDD.tar.gz -C /
```

## Estado PostgreSQL

**PostgreSQL es EXPERIMENTAL.** Ver `docs/POSTGRESQL_STATUS.md`.

Para deployment en producción, **usar SQLite**. PostgreSQL quedará habilitado en una versión futura cuando las migraciones estén validadas end-to-end.

## Troubleshooting

### Container no arranca

```bash
# Ver logs
docker compose logs samba-pos

# Errores comunes:
# - JWT_SECRET no seteado → server abort
# - CORS_ORIGIN='*' en prod → server abort
# - Puerto 3001 en uso → cambiar PORT
```

### /ready falla

```bash
# Verificar DB
docker compose exec samba-pos ls -la /app/data/
docker compose exec samba-pos sqlite3 /app/data/samba.db "SELECT COUNT(*) FROM Users;"
```

### Reset completo

```bash
docker compose down -v  # -v borra el volumen de datos
docker compose up -d --build
```
