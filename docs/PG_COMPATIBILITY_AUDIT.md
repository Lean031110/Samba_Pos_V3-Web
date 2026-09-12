# PG_COMPATIBILITY_AUDIT.md — Auditoría estática de compatibilidad PostgreSQL

> Generado por `scripts/audit-pg-compat.js`
> Fecha: 2026-09-12T22:12:58.040Z
> Auditoría estática (sin ejecución contra PG real).

## Resumen

- Migraciones analizadas: 15
- Migraciones con knex.schema (portable): 14
- Migraciones con isSQLite guard: 7
- Migraciones con raw SQL: 5
- Migraciones con issues NO guardados: 0

## Detalle por migración

| Migración | knex.schema (portable) | isSQLite guard | Raw SQL count | Issues sin guardar | Estado |
|---|---|---|---|---|---|
| 0904000001_create_schema | ✅ | ✅ | 0 | 0 | ✅ PG-compatible |
| 0905000001_add_optimistic_locking | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0906000001_create_kitchen_module | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0907000001_create_inventory_module | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0908000001_create_rbac_module | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0907000001_create_cash_session_and_customers | ✅ | ✅ | 0 | 0 | ✅ PG-compatible |
| 0907000002_add_ticket_state_flags | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0907000003_create_print_job_queue | ✅ | ✅ | 2 | 0 | ✅ PG-compatible |
| 0908000001_fix_idempotency_unique_constraint | ✅ | ✅ | 21 | 0 | ✅ PG-compatible |
| 0908000002_create_push_tables | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0908000003_add_granular_permissions | ❌ | — | 0 | 0 | ✅ PG-compatible |
| 0908000004_create_bloque_d_inventory_extensions | ✅ | — | 0 | 0 | ✅ PG-compatible |
| 0909000001_extend_printer_templates | ✅ | ✅ | 2 | 0 | ✅ PG-compatible |
| 0912000001_create_stations_and_production_areas | ✅ | ✅ | 6 | 0 | ✅ PG-compatible |
| 0912000002_create_client_errors | ✅ | ✅ | 6 | 0 | ✅ PG-compatible |

## Issues sin guardar (potential PG incompatibility)

*No se encontraron issues sin guardar.*

## Conclusión

**Auditoría estática**: 15/15 migraciones son PG-compatible a nivel de código.

**Validación ejecutable pendiente**: instalar PostgreSQL y correr `knex migrate:latest --env production` para validar.

### Próximos pasos

1. Instalar PostgreSQL localmente (o usar Docker).
2. Setear `DATABASE_URL=postgres://user:pass@localhost:5432/sambapos`.
3. Correr `npx knex migrate:latest --knexfile backend/src/infrastructure/db/knexfile.js --env production`.
4. Resolver cualquier error que aparezca (puede haber issues de tipos, constraints, etc.).
5. Quitar `continue-on-error: true` del paso PG en CI.
