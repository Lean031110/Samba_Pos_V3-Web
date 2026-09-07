# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### En progreso — FASE 2: Dominio

- Agregados de dominio faltantes (clúster de *Ticket* y de *Inventory*).
- *Idempotency keys* formalizadas en operaciones críticas (pagos, cierres,
  splits, refunds).
- *State machine* formal para tickets (transiciones explícitas y validadas).
- Cobertura de tests visuales y de *failure modes*.
- Pendiente: limpieza de mocks legacy en `TicketService` (FASE 7).

---

## [0.4.0] - 2026-09-07 — FASE 1: Seguridad y Limpieza

### Added

- Job de **seguridad en CI** que corre `gitleaks-action@v2` (secret scan con
  `fetch-depth: 0`) + gate `npm audit --audit-level=low` antes de tests.
- **Validación de payload con Zod** en 9 *handlers* críticos (`auth.login` +
  8 endpoints de tickets: `POST /`, `/:id/payments`, `/:id/close`,
  `/:id/note`, `/:id/tags`, `/:id/split`, `/:id/refund`, `/merge`). Nuevo
  módulo `backend/src/api/middleware/schemas.js` con 17 schemas *strict*
  que rechazan claves desconocidas.
- **21 tests de seguridad** (`security-verification.test.js`): 3 de CORS
  *hardening*, 10 de *auth bypass*, 8 de *fuzzing* en login.
- Archivo `.env.example` documentado con todas las variables de la app
  (`PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`,
  `SAMBA_DB_PATH`, `ADMIN_PIN`, `BACKUP_DIR`).
- Middleware `requirePermission()` aplicado a **11 rutas** previamente sin
  RBAC (config: 5, products: 4, tables: 3, printers: 3, kitchen: 2).
- `auditLog()` agregado a `product.create` y `table.changeState`.
- Config `.gitleaks.toml` con *allowlist* para `.env.example`, *test
  secrets*, *bcrypt hashes* y *docs*.
- `data/backups/.gitkeep` para preservar el directorio en git.

### Changed

- **`sqlite3 5.1.7 → 6.0.1`** — resuelve 7 vulnerabilidades (1 crítica en
  `tar` por la cadena `sqlite3 → node-gyp → make-fetch-happen → tar`).
  `npm audit` reporta **0 vulnerabilidades** después del bump.
- **CORS endurecido**: si `NODE_ENV=production` y `CORS_ORIGIN='*'` o vacío,
  el servidor aborta el arranque con `process.exit(1)` y un mensaje claro.
- `data/backups/`, `data/snapshots/`, `backend/tests/e2e/report/` y
  `backend/tests/e2e/results.xml` agregados al `.gitignore`.

### Removed

- `data/samba.db` eliminado del control de versiones (`git rm --cached`).
- `data/backups/samba-backup-*.meta.json` eliminados del control de
  versiones.
- (Limpiado en este release, FASE *repo-cleanup*):
  `backend/test-results/.last-run.json` des-trackeado (artefacto de
  Playwright) y *gitlink* huérfano `source/` (submodule sin `.gitmodules`)
  eliminado del index.

### Tests

- Suite completa: **165/165 PASS** (138 unit + 27 E2E con Chromium 1243).
- Sin regresiones respecto a FASE 0 (144 tests) — los 21 tests nuevos son
  aditivos.

Ver [`docs/PHASE1_REPORT.md`](./docs/PHASE1_REPORT.md) para el detalle
completo.

---

## [0.3.0] - 2026-09-06 — Versión pública inicial (baseline pre-FASE 0)

### Added

- **POS completo**: tickets, órdenes, pagos, cálculos (con `decimal.js`),
  descuentos, regalos (*gifts*), *voids*, *refunds*, *splits* y *merges*.
- **KDS multi-estación** con *state machine* de órdenes, *routing* por
  estación y propagación de *voids*.
- **Inventario y recetas** con deducción transaccional al cerrar ticket.
- **RBAC con 26 permisos** granulares aplicados vía `requirePermission()`.
- **Impresión real ESC/POS** vía transporte TCP con *retry* y *fallback*.
- **WebSocket con auth JWT**, *rooms* por rol y *resync* tras reconexión.
- **Migraciones Knex** + *seed* transaccional (admin, 19 reglas de
  cálculo, 4 *payment types*, 3 *printers*, etc.).
- **Frontend Vanilla JS + Web Components**: Login, Dashboard (mapa de
  mesas), POS, Payment Editor, KDS.
- **Docker multi-stage** + `docker-compose.yml` con healthcheck.
- **CI en GitHub Actions**: install → lint → migrate → tests → docker build.
- **144 tests passing**: 47 integration + 49 KDS + 13 inventory + 8
  concurrency + 27 E2E (Playwright).

### Known issues (resueltos en 0.4.0)

- `data/samba.db` commiteado en el repo (corregido en FASE 1.2).
- `sqlite3@5.1.7` con 7 vulnerabilidades (corregido en FASE 1.3).
- CORS aceptando `*` en producción (corregido en FASE 1.5).
- 11 rutas sin `requirePermission()` (corregido en FASE 1.6).
- 9 *handlers* sin validación de schema (corregido en FASE 1.7).
- Sin secret scan automatizado (corregido en FASE 1.8).

Ver [`docs/BASELINE_REPORT.md`](./docs/BASELINE_REPORT.md) para el detalle
completo del baseline.

---

[Unreleased]: https://github.com/Lean031110/Samba_Pos_V3-Web/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Lean031110/Samba_Pos_V3-Web/releases/tag/v0.4.0
[0.3.0]: https://github.com/Lean031110/Samba_Pos_V3-Web/releases/tag/v0.3.0
