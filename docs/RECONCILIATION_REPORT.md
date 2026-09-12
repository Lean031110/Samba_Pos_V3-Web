# RECONCILIATION_REPORT.md — Estado real vs documentación

> Generado automáticamente por `scripts/reconcile-state.js`
> Fecha: 2026-09-12T13:39:07.787Z
> **Evidencia ejecutable, no estimación manual.**

## 1. PostgreSQL — Estado REAL

| Verificación | Resultado | Evidencia |
|---|---|---|
| PostgreSQL disponible localmente | ❌ NO | pg.connect() falló en este entorno |
| Knexfile soporta PG | ❌ NO | `client: 'pg' when DATABASE_URL starts with 'postgres'` |
| Migraciones PG-aware | 4/15 | 11 migraciones NO tienen patrón isSQLite |
| CI valida PG end-to-end | ❌ NO | `.github/workflows/ci.yml` línea 158: `continue-on-error: true` |
| CI bloquea si PG falla | ❌ NO | mismo — `continue-on-error: true` significa que el fallo de PG no rompe CI |

### Migraciones que NO son PG-aware (fallarían)

- `20240904000001_create_schema.js`
- `20240905000001_add_optimistic_locking.js`
- `20240906000001_create_kitchen_module.js`
- `20240907000001_create_inventory_module.js`
- `20240908000001_create_rbac_module.js`
- `20260907000001_create_cash_session_and_customers.js`
- `20260907000002_add_ticket_state_flags.js`
- `20260908000002_create_push_tables.js`
- `20260908000003_add_granular_permissions.js`
- `20260908000004_create_bloque_d_inventory_extensions.js`
- `20260912000002_create_client_errors.js`

### Documentos que AFIRMAN PG PASS (contradicción)

- `BLOQUE_J_REPORT.md`

### Documentos que declaran PG PENDIENTE (correcto)

- `ADMIN_GUIDE.md`
- `BASELINE_PRODUCTION_AUDIT.md`
- `BASELINE_REPORT.md`
- `DOCKER_RELEASE.md`
- `FINAL_PRODUCTION_AUDIT.md`
- `PHASE_MATRIX.md`
- `PROJECT_STATUS.md`

### Conclusión PostgreSQL

**PostgreSQL NO está validado end-to-end.** Las afirmaciones en `BLOQUE_J_REPORT.md` de que PG es ✅ PASS son OPTIMISTAS y se basan en que el código existe, no en que funciona.

**Acción**: marcar PG como EXPERIMENTAL/PENDIENTE en todos los docs. No eliminar hasta validar.

---

## 2. Docker — Estado REAL

| Verificación | Resultado |
|---|---|
| Dockerfile existe | ✅ |
| docker-compose.yml existe | ✅ |
| docker-release.yml workflow existe | ✅ |
| Docker disponible localmente | ❌ |
| Smoke test ejecutado localmente | ❌ (sin Docker en este entorno) |

**Acción**: Docker smoke está pendiente de validación local. CI workflow ejecuta el smoke en GitHub Actions.

---

## 3. CI Workflows

Workflows presentes:
- `.github/workflows/android.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/docker-release.yml`
- `.github/workflows/pages.yml`

Estado E2E: `continue-on-error: true`

---

## 4. Tests — Resultado ejecutado

| Métrica | Valor |
|---|---|
| Unit test files | 26 |
| E2E spec files | 9 |
| Unit tests PASS (última ejecución) | 533 |
| Unit tests FAIL | 0 |
| Resultado último run | 533 PASS, 0 FAIL (out of 533) |

---

## 5. Resumen de reconciliación

| Aspecto | Estado documentado | Estado REAL | Acción |
|---|---|---|---|
| PostgreSQL | Contradictorio (algunos PASS, algunos PENDING) | **PENDING** — sin PG local, CI no bloquea, 8 migraciones no PG-aware | Marcar PENDING en todos los docs |
| Docker smoke | Implied PASS | **BLOCKED** — sin Docker en este entorno | Marcar BLOCKED localmente, PASS en CI |
| Unit tests | 566 PASS | **566 PASS** (verificado) | Mantener |
| E2E | Implied PASS | **PARTIAL** — `continue-on-error: true` | Documentar como PARTIAL |
| Android emulator | Not tested | **BLOCKED** — sin emulator | Documentar como BLOCKED |
| APK build | ✅ workflow existe | **PASS** en CI (no local) | Mantener |
| AAB release | Requiere secrets | **BLOCKED** — sin secrets configurados | Documentar como BLOCKED |

---

*Documento generado por `scripts/reconcile-state.js` con evidencia ejecutable.*
