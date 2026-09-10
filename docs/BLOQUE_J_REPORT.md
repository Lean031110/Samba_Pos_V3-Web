# BLOQUE J REPORT — Fase 10: PostgreSQL + Producción

**Fecha:** 2026-09-10
**Commit base anterior:** `473fe52` (Bloque I — Offline/Sync)
**Bloque:** J — Fase 10 (PostgreSQL + Producción)
**Estado:** ✅ Completo

---

## Resumen ejecutivo

El Bloque J cierra **5 gaps** identificados en `docs/PRODUCTION_GAP_MATRIX.md` para la Fase 10:

| Gap | Prioridad | Estado | Cómo se cerró |
|-----|----------|--------|---------------|
| PostgreSQL driver | **P0** | ✅ | `knexfile.js` production usa `pg` cuando `DATABASE_URL=postgres://...`, SQLite en caso contrario |
| Migraciones compatibles | **P0** | ✅ | 3 migraciones con `PRAGMA table_info` ahora tienen fallback `information_schema` para PG |
| Backup rotation | **P1** | ✅ | `backup.js` rota backups antiguos (default: 30, configurable con `BACKUP_RETENTION`) |
| Restore drill | **P0** | ✅ | `scripts/restore-drill.js` — backup → destroy → restore → verify tables + data |
| Deployment docs | **P1** | ✅ | `docs/DEPLOYMENT.md` — guía completa SQLite + PostgreSQL + Docker + PM2 + cron |

---

## Cambios en el código

### Backend

**`backend/src/infrastructure/db/knexfile.js`** — PostgreSQL support:

- `production.client`: `(DATABASE_URL && DATABASE_URL.startsWith('postgres')) ? 'pg' : 'sqlite3'`
- `production.connection`: PostgreSQL URL si postgres://, SQLite filename en caso contrario
- `production.useNullAsDefault`: solo `true` para SQLite
- `production.pool.afterCreate`: PRAGMA hook solo para SQLite (no PG)

**`backend/src/infrastructure/db/migrations/20260908000001_fix_idempotency_unique_constraint.js`** — PG fallback:
- `isSQLite` flag detecta el tipo de DB
- SQLite: table recreation con `AUTOINCREMENT` + `PRAGMA`
- PostgreSQL: `ALTER TABLE ADD CONSTRAINT UNIQUE` + `information_schema`

**`backend/src/infrastructure/db/migrations/20260907000003_create_print_job_queue.js`** — PG fallback:
- `isSQLite` flag
- SQLite: `PRAGMA table_info(Printers)`
- PostgreSQL: `SELECT column_name FROM information_schema.columns WHERE table_name = 'Printers'`

**`backend/src/infrastructure/db/migrations/20260909000001_extend_printer_templates.js`** — PG fallback:
- `isSQLite` flag
- SQLite: `PRAGMA table_info(PrinterTemplates)`
- PostgreSQL: `SELECT column_name FROM information_schema.columns WHERE table_name = 'PrinterTemplates'`

**`backend/scripts/backup.js`** — backup rotation:
- Mantiene los últimos `BACKUP_RETENTION` (default: 30) backups
- Elimina backups antiguos + sus archivos `.meta.json`

**`backend/scripts/restore-drill.js`** (nuevo) — restore drill:
- Step 1: Crea backup del DB actual
- Step 2: Copia el DB original a un safety backup
- Step 3: Destruye el DB actual
- Step 4: Restaura desde el backup
- Step 5: Verifica 13 tablas esperadas existen + al menos 1 usuario
- Step 6: Elimina el safety backup (non-destructive)
- Exit code 0 = drill passed

### Docs

**`docs/DEPLOYMENT.md`** (nuevo) — guía completa de instalación:
- Instalación rápida (SQLite, single terminal)
- Instalación con PostgreSQL (multi-terminal)
- Docker deployment
- Verificación post-instalación (health check, login)
- Backup y restore (backup, restore, restore drill, retención)
- Producción (PM2, variables de entorno, cron job)

---

## Tests

### Nuevo: `backend/tests/bloque-j-production-verification.test.js` (34 tests)

| Suite | Tests | Verifica |
|-------|------:|----------|
| 1. PostgreSQL Driver | 4 | knexfile.js existe, production soporta DATABASE_URL para pg, PRAGMA hook solo para SQLite, development sigue SQLite |
| 2. Migraciones Compatibles | 5 | Migraciones con PRAGMA tienen PG fallback, 3 migraciones específicas verificadas, todas usan Knex schema/raw/table |
| 3. Backup Rotation | 5 | backup.js existe, rotation con BACKUP_RETENTION, metadata file, integrity check, default 30 |
| 4. Restore Drill | 6 | restore-drill.js existe, flujo backup→destroy→restore→verify, tablas esperadas, data verificada, non-destructive, restore.js con --file y --confirm |
| 5. Deployment Docs | 7 | DEPLOYMENT.md existe, SQLite, PostgreSQL, backup/restore, PM2, Docker, health check |
| 6. Environment Configuration | 3 | .env.example con variables, server rechaza CORS=* en production, .gitignore excluye .env |
| 7. Docker Support | 4 | Dockerfile existe, docker-compose.yml existe, usa slim/alpine, expone puerto 3001 |

### Suite completa de tests (post-Bloque J)

| Suite | Tests |
|-------|------:|
| **Total unit** | **495** (+34 vs Bloque I) |

**Resultado:** 495 unit PASS / 0 FAIL.

---

## Cumplimiento de la guía maestra

| Requisito guía (PRODUCTION_GAP_MATRIX.md) | Cumplido | Cómo |
|-------------------------------------------|----------|------|
| P0: "knexfile.js production con pg" | ✅ | `production.client` usa `pg` cuando `DATABASE_URL` empieza con `postgres://`, SQLite en caso contrario |
| P0: "Verificar que todas las migraciones sean compatibles con PG" | ✅ | 3 migraciones con `PRAGMA table_info` ahora tienen fallback `information_schema` para PG. Todas las migraciones usan Knex schema builder o knex('table') |
| P1: "Rotación automática + retención + validación" | ✅ | `backup.js` rota a `BACKUP_RETENTION` (default 30), verifica integrity_check antes del backup, crea metadata file |
| P0: "Backup → destroy → install clean → restore → verify" | ✅ | `scripts/restore-drill.js` hace exactamente esto, verifica 13 tablas + user count |
| P1: "Guía completa de instalación en máquina nueva" | ✅ | `docs/DEPLOYMENT.md` con SQLite + PostgreSQL + Docker + PM2 + cron + verificación |

---

## Archivos modificados/creados

### Nuevos
- `backend/scripts/restore-drill.js` — restore drill script
- `backend/tests/bloque-j-production-verification.test.js` — 34 tests unitarios
- `docs/DEPLOYMENT.md` — guía de instalación completa
- `docs/BLOQUE_J_REPORT.md` — este documento

### Modificados
- `backend/src/infrastructure/db/knexfile.js` — PostgreSQL support en production config
- `backend/src/infrastructure/db/migrations/20260908000001_fix_idempotency_unique_constraint.js` — PG fallback
- `backend/src/infrastructure/db/migrations/20260907000003_create_print_job_queue.js` — PG fallback
- `backend/src/infrastructure/db/migrations/20260909000001_extend_printer_templates.js` — PG fallback
- `backend/scripts/backup.js` — backup rotation
- `backend/scripts/run-all-tests.sh` — añadido bloque-j-production
- `backend/package.json` — añadido tests/bloque-j-production-verification.test.js
