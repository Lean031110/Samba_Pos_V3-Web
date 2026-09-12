# PostgreSQL Status — SambaPos_LBA

> **Estado actual: EXPERIMENTAL — NO PRODUCTION READY**
> **Última verificación ejecutable:** 2026-09-12 (por `scripts/reconcile-state.js`)

## Situación real (evidencia ejecutable)

PostgreSQL está soportado a nivel de **código** (knexfile.js) pero NO está validado end-to-end. La siguiente tabla muestra la evidencia:

| Verificación | Resultado | Evidencia |
|---|---|---|
| PostgreSQL server disponible localmente | ❌ NO | `pg.connect()` falló en el entorno de auditoría |
| Knexfile soporta PG | ✅ SÍ | `client: 'pg'` cuando `DATABASE_URL=postgres://...` |
| Migraciones PG-aware | **4/15 (26.7%)** | Solo 4 migraciones usan patrón `isSQLite`; las 11 restantes NO son PG-compatibles |
| CI valida PG end-to-end | ❌ NO | `.github/workflows/ci.yml` línea 158: `continue-on-error: true` |
| CI bloquea si PG falla | ❌ NO | mismo flag — el fallo de PG no rompe CI |
| Backup drill contra PG | ❌ NO | No se ejecutó |
| Restore drill contra PG | ❌ NO | No se ejecutó |
| Smoke test Docker con PG | ❌ NO | Docker no disponible en entorno de auditoría |

### Migraciones que NO son PG-aware (fallarían al correrlas contra PostgreSQL)

1. `20240905000001_add_optimistic_locking.js`
2. `20240906000001_create_kitchen_module.js`
3. `20240907000001_create_inventory_module.js`
4. `20240908000001_create_rbac_module.js`
5. `20260907000002_add_ticket_state_flags.js`
6. `20260908000002_create_push_tables.js`
7. `20260908000003_add_granular_permissions.js`
8. `20260908000004_create_bloque_d_inventory_extensions.js`
9. `20260904000001_create_schema.js` (la más crítica — 96 tablas)
10. Otras 2 migraciones sin el patrón

### Migraciones PG-aware (correctas)

1. `20260912000001_create_stations_and_production_areas.js` ✅
2. `20260912000002_create_client_errors.js` ✅
3. `20260908000001_fix_idempotency_unique_constraint.js` ✅
4. `20260909000001_extend_printer_templates.js` ✅

## Por qué PG no funciona hoy

1. **Migraciones antiguas** (las 11 originales de 2024-2026) no tienen el patrón `isSQLite`:
   - Usan `PRAGMA table_info()` (solo SQLite) en vez de `information_schema.columns`.
   - Algunas usan tipos SQLite específicos (ej. `INTEGER PRIMARY KEY AUTOINCREMENT`).
   - Constraints con `ON DELETE NO ACTION` vs `CASCADE` pueden diferir.
2. **No hay PostgreSQL instalado** en el entorno de desarrollo actual.
3. **CI no bloquea** fallos de PG — el flag `continue-on-error: true` permite que CI pase aunque PG rompa.
4. **No hay tests de integración** que corran exclusivamente contra PostgreSQL.
5. **No hay smoke test** Docker con PG.

## Cómo PG debería arreglarse (trabajo pendiente)

1. **Auditar las 11 migraciones no-PG-aware** y agregar el patrón `isSQLite` a cada una:
   - Reemplazar `PRAGMA table_info(X)` con `SELECT column_name FROM information_schema.columns WHERE table_name = 'X'`.
   - Reemplazar `CREATE INDEX IF NOT EXISTS` con `CREATE INDEX IF NOT EXISTS` (compatible en ambos).
   - Reemplazar tipos SQLite-only con tipos SQL estándar (TEXT, INTEGER, NUMERIC).
2. **Instalar PostgreSQL localmente** para probar.
3. **Quitar `continue-on-error: true`** del paso PG en CI.
4. **Agregar tests de integración** que corran exclusivamente contra PostgreSQL (separados de SQLite).
5. **Smoke test Docker con DATABASE_URL=postgres://...**.

## Decisión de release

**Para producción v0.6.1: SOLO SQLite es oficialmente soportado.**

PostgreSQL queda como trabajo futuro. **No se debe ocultar este estado en el release gate.**

### Lo que SÍ funciona con SQLite (production ready)

- ✅ 533 unit tests corren contra SQLite (suite original).
- ✅ 33 tests nuevos (Bloque 4-11) corren contra SQLite.
- ✅ Migraciones funcionan.
- ✅ Seed funciona.
- ✅ Docker image usa SQLite por defecto (`SAMBA_DB_PATH=/app/data/samba.db`).
- ✅ docker-compose.yml listo para producción con SQLite.
- ✅ Backup rotation y restore drill validados contra SQLite.

### Plan para v0.7.0

1. Instalar PG localmente.
2. Auditar las 11 migraciones no-PG-aware.
3. Hacer migrar PG end-to-end.
4. Quitar `continue-on-error: true` del CI.
5. Solo entonces marcar PG como production ready.

