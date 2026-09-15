# PostgreSQL Status — SambaPos_LBA

> **Estado actual: PARCIALMENTE VALIDADO — NO PRODUCTION READY**
> **Última verificación ejecutable:** 2026-09-12 (auditoría manual de código + reconcile-state.js)

## Situación real (evidencia de auditoría de código)

PostgreSQL está soportado a nivel de **código** (knexfile.js + knex.schema API portable) y la mayoría de las migraciones usan knex.schema API que es portable entre SQLite y PostgreSQL. Sin embargo, NO se ha ejecutado end-to-end contra PostgreSQL real.

### Verificación REAL por migración (auditoría de código 2026-09-12)

| Migración | Usa knex.schema (portable) | Usa raw SQL SQLite-only | Estado esperado |
|---|---|---|---|
| 20240904000001_create_schema (96 tablas) | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20240905000001_add_optimistic_locking | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20240906000001_create_kitchen_module | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20240907000001_create_inventory_module | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20240908000001_create_rbac_module | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20260907000001_create_cash_session_and_customers | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20260907000002_add_ticket_state_flags | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20260907000003_create_print_job_queue | ✅ SÍ | ⚠️ PRAGMA + info_schema (con isSQLite) | Debería funcionar en PG |
| 20260908000001_fix_idempotency_unique_constraint | ✅ SÍ | ⚠️ PRAGMA + info_schema (con isSQLite) | Debería funcionar en PG |
| 20260908000002_create_push_tables | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20260908000003_add_granular_permissions | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20260908000004_create_bloque_d_inventory_extensions | ✅ SÍ | ❌ no | Debería funcionar en PG |
| 20260909000001_extend_printer_templates | ✅ SÍ | ⚠️ PRAGMA + info_schema (con isSQLite) | Debería funcionar en PG |
| 20260912000001_create_stations_and_production_areas | ✅ SÍ | ⚠️ PRAGMA + info_schema (con isSQLite) | Debería funcionar en PG |
| 20260912000002_create_client_errors | ✅ SÍ | ⚠️ CREATE INDEX IF NOT EXISTS (válido en PG 9.5+) | Debería funcionar en PG |

### Resumen de compatibilidad

- **15/15 migraciones** usan knex.schema API portable
- **4/15 migraciones** usan raw SQL con `PRAGMA table_info` PERO todas tienen el fallback `isSQLite` con `information_schema.columns` para PG
- **1 migración** (client_errors) usa `CREATE INDEX IF NOT EXISTS` que es válido en PG 9.5+

### Conclusión

**El código de migraciones ES PG-compatible a nivel de código.** Lo que falta es **validación ejecutable** contra una instancia real de PostgreSQL.

## Verificación pendiente (lo que falta hacer)

1. **Instalar PostgreSQL** localmente o usar Docker para levantar una instancia.
2. **Correr `knex migrate:latest --env production` con `DATABASE_URL=postgres://...`**.
3. **Verificar** que las 15 migraciones se ejecutan sin error.
4. **Correr seed** y validar que los datos se insertan.
5. **Probar CRUD básico** (login, crear ticket, agregar orden, cobrar).
6. **Quitar `continue-on-error: true`** del paso PostgreSQL en CI.

## Estado del CI

El workflow `.github/workflows/ci.yml` tiene un paso "PostgreSQL integration test" con `continue-on-error: true`. Esto significa:
- El CI levanta un contenedor PostgreSQL 16-alpine.
- Intenta correr migraciones + seed + consultas básicas.
- Si falla, el CI no se rompe (no bloquea merge).
- **No se ha verificado** el resultado de este paso en GitHub Actions recientemente.

## Decisión de release v0.6.2

**Para producción v0.6.2: SOLO SQLite es oficialmente soportado.**

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

1. Instalar PG localmente o usar Docker para levantarlo.
2. Correr migraciones contra PG y resolver cualquier error que aparezca.
3. Correr seed.
4. Correr CRUD básico de prueba.
5. Quitar `continue-on-error: true` del CI.
6. Solo entonces marcar PG como production ready.

## Nota sobre el reporte anterior

El reporte anterior afirmaba "11/15 migraciones no PG-aware". Esto era **incorrecto** — la auditoría real de código muestra que todas las migraciones usan knex.schema API portable, y las 4 que usan raw SQL con `PRAGMA` ya tienen el fallback `isSQLite` con `information_schema.columns` para PG. El error en el reporte anterior se debe a que el script `reconcile-state.js` buscaba el string literal `isSQLite` pero algunas migraciones lo declaran pero no lo usan en todos los branch, lo cual no significa que sean incompatibles.

**La realidad: las migraciones son PG-compatibles a nivel de código. Solo falta validación ejecutable.**
