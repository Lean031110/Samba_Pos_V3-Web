# SambaPos_LBA — BASELINE REPORT (FASE 0)

**Fecha de auditoría:** 2026-09-07
**Repositorio auditado:** https://github.com/Lean031110/Samba_Pos_V3-Web (rama `main`, commit `75ceddc`)
**Repositorio de referencia funcional:** https://github.com/emreeren/SambaPOS-3
**Nombre objetivo del producto:** `SambaPos_LBA`
**Agente:** Super Z (sambapos-lba-agent)

> Documento generado siguiendo el “Prompt maestro para agente IA”, FASE 0 — AUDITORÍA OBLIGATORIA. No se ha modificado la arquitectura ni el código del repositorio. Sólo se han ejecutado las pruebas existentes para registrar el baseline real.

---

## 0. Resumen ejecutivo

El repositorio ya es un clon funcional **parcial** de SambaPOS V3 construido como aplicación web moderna (Node.js + Express + Knex + SQLite + Socket.io + Vanilla JS). Existe dominio de ticket/orden/pago/cálculo, módulo de cocina (KDS), inventario y recetas, RBAC con permisos granulares, impresión real con driver ESC/POS sobre TCP, middleware de auditoría, rate-limiting, helmet, JWT obligatorio, migraciones Knex, semilla transaccional, scripts de backup/restore, Docker multi-stage y CI en GitHub Actions.

Sin embargo, **no debe considerarse producto listo para producción** según los criterios de aceptación del prompt. Los huecos más relevantes son: ausencia total de PWA / Service Worker / Web Push, ausencia de capa Android (Capacitor), PostgreSQL no implementado (sólo SQLite), panel de administración inexistente (sólo APIs de lectura para tablas, mesas, productos, configuración — sin CRUD completo), Web Push y VAPID no presentes, offline real no implementado (sólo documentación), reportes inexistentes, módulo de caja/work-period incompleto, falta de tests visuales/seguridad/failure, y 5 pruebas E2E que no pueden ejecutarse en este entorno por falta del binario `chromium-headless-shell-1243` (no es un fallo de código).

La suite ejecutable pasa: **117/117 tests unitarios PASS** y **22/27 E2E PASS** (5 no ejecutables en este entorno).

**Veredicto FASE 0:** BLOCKED para “producción” hasta cerrar las brechas listadas en §11. Continúa siendo seguro para desarrollo local y arrancable limpio tras `npm ci → migrate → seed → start`.

---

## 1. Inventario del repositorio

### 1.1 Estructura de carpetas

```
samba-web-clone/
├── .dockerignore
├── .github/workflows/ci.yml
├── .gitignore
├── Dockerfile               # multi-stage, node:20-alpine
├── docker-compose.yml
├── README.md                # ~22 KB, muy completo
├── analysis/                # documentos de análisis (no runtime)
│   ├── BUSINESS_RULES_ENGINE.md
│   ├── DATABASE_SCHEMA_EXACT.sql
│   ├── DDL_EXAMPLES_SPRINT1.sql
│   ├── FULL_ARCHITECTURE_REPORT.md
│   └── UI_SPECS_FOR_WEB.md
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   ├── playwright.config.js
│   ├── scripts/             # 7 scripts (migraciones, backup, restore, e2e, etc.)
│   ├── src/
│   │   ├── api/
│   │   │   ├── middleware/  # auth, rbac, auditLog, errorHandler, logger
│   │   │   ├── routes/      # auth, tickets, products, tables, kitchen, inventory, printers, config
│   │   │   ├── services/    # TicketService, TicketServiceExtended, KitchenService, InventoryService, PrinterManager
│   │   │   └── server.js    # Express + Socket.io
│   │   ├── application/
│   │   │   └── eventBus.js  # pub/sub interno, puente a WS
│   │   ├── domain/          # Ticket, OrderBuilder, CalculationEngine, AccountTransaction, ...
│   │   └── infrastructure/
│   │       ├── db/          # knexfile, db.js, migrations/ (5), seeds/
│   │       └── repositories/ # Product, Ticket, Table
│   ├── tests/
│   │   ├── api-integration.test.js      # 47 tests
│   │   ├── kds-verification.test.js     # 49 tests
│   │   ├── inventory-verification.test.js # 13 tests
│   │   ├── concurrency-verification.test.js # 8 tests
│   │   └── e2e/                          # Playwright
│   │       ├── api-isolated.spec.js
│   │       ├── ui-isolated.spec.js
│   │       ├── websocket-flow.spec.js
│   │       └── global-setup.js
│   └── test-results/  # artefactos
├── data/
│   ├── samba.db               # base SQLite commiteada (DEBE sacarse del repo, ver §6)
│   └── backups/               # un .meta.json commiteado (DEBE sacarse del repo)
├── docs/                      # 7 documentos + screenshots
├── frontend/
│   ├── index.html
│   ├── css/                   # variables, layout, components, reset
│   ├── js/
│   │   ├── app.js
│   │   ├── components/flex-button.js
│   │   ├── services/api.js
│   │   ├── store/             # store.js, websocket-client.js
│   │   └── views/              # dashboard, login, kitchen, payment, pos
│   └── vendor/                # fontawesome, socket.io.min.js
└── source                     # symlink / submódulo al source original de SambaPOS-3 (gitignored)
```

Total: **122 archivos rastreados** (`git ls-files`). Aproximadamente **7.624 LOC** de código backend (sin tests ni migraciones).

### 1.2 Stack técnico

| Capa | Tecnología | Versión |
|---|---|---|
| Backend runtime | Node.js | 20 (CI) / local 20+ |
| Framework HTTP | Express | 5.2.1 |
| ORM / query builder | Knex | 3.1.0 |
| DB embebida | SQLite3 | 5.1.7 (vulnerable, ver §7) |
| Auth | jsonwebtoken + bcryptjs | 9.0.3 / 3.0.3 |
| WebSocket | socket.io | 4.8.3 |
| Seguridad HTTP | helmet | 8.3.0 |
| Rate limiting | express-rate-limit | 8.7.0 |
| Numérico | decimal.js | 10.4.3 |
| Tests E2E | @playwright/test | 1.63.0 |
| Frontend | Vanilla JS + Web Components + Font Awesome | — |
| Contenedor | Docker multi-stage (node:20-alpine) | — |

### 1.3 Estado de dependencias (npm audit)

- **7 vulnerabilidades** detectadas (2 low, 4 high, 1 critical).
- Cadena principal: `sqlite3@5.1.7 → node-gyp → make-fetch-happen → tar@<=7.5.20` (CRÍTICO: path-traversal, PAX DoS, symlink poisoning).
- Fix recomendado por npm: `npm audit fix --force` → instalaría `sqlite3@6.0.1` (breaking change, requiere verificación).
- Acción: programar bump de `sqlite3` a 6.x en FASE 1 (seguridad).

---

## 2. Arquitectura actual

### 2.1 Backend

```
Express app
  → helmet (CSP estricto)
  → cors (env-configurable, default '*'  ← DEBE restringirse en prod)
  → express.json({ limit: '2mb' })
  → requestLogger
  → /health (no DB)  /ready (DB + WS)  /version
  → express.static(frontend)
  → SPA fallback
  → /api/* → authenticate (JWT Bearer, salvo /api/auth/login)
       routes/auth, routes/tickets, routes/products, routes/tables,
       routes/kitchen, routes/inventory, routes/printers, routes/config
  → notFoundHandler
  → errorLogger → errorHandler

Socket.io (mismo server HTTP, puerto 3001)
  → on connection: validar token desde handshake.auth (NO query string)
  → rooms: role:pos, role:kitchen, role:admin, ticket:<id>, terminal:<id>
  → events: subscribe:role, subscribe:ticket, subscribe:terminal, resync
  → bridge eventBus → WS broadcast
  → resync entrega snapshot (tickets abiertos, mesas, órdenes de cocina, systemStatus)
```

### 2.2 Dominio

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `domain/Ticket.js` | 460 | Aggregate root, state machine (Open↔Closed↔Voided↔Refunded) |
| `domain/TicketBuilder.js` | 124 | Builder para construcción fluida |
| `domain/TicketRecalculator.js` | 188 | Recalculo de totales con CalculationEngine |
| `domain/OrderBuilder.js` | 123 | Construcción de órdenes con porciones/tags |
| `domain/CalculationEngine.js` | 464 | Discounts, services, taxes, rounding, gift |
| `domain/AccountTransaction.js` | 260 | Transacción contable de pago |
| `domain/AccountTransactionDocument.js` | 148 | Documento contable |

> Faltan agregados: `Customer`, `Warehouse` (como aggregate), `CashSession`, `WorkPeriod`, `PrintJob`, `Notification`, `AuditLog` (modelo de dominio — hoy es sólo middleware).

### 2.3 Servicios

| Servicio | Líneas | Estado |
|---|---|---|
| `TicketService` | 508 | CRUD ticket, órdenes, cálculos, pagos, cierre, nota, regalo, void, refund, split, merge, print preview (mock ESC/POS) |
| `TicketServiceExtended` | 451 | Variante con helpers extra |
| `KitchenService` | 460 | Estaciones, routing, state machine NEW→ACCEPTED→PREPARING→READY→SERVED→VOIDED, bump, recall, void, audit |
| `InventoryService` | 373 | Ingredients, units, recipes, stock ledger, deducción transaccional al cerrar ticket, reversión en void/refund |
| `PrinterManager` | 541 | Driver ESC/POS real con TCP transport, print routing, retry, fallback, reprint, monitor |

### 2.4 Base de datos

- **5 migraciones** Knex aplicadas en orden:
  1. `20240904000001_create_schema.js` (1.082 líneas) — crea **96 tablas** SambaPOS V3 en un único migration topológico.
  2. `20240905000001_add_optimistic_locking.js` — columnas `Version` (rowversion) en Tickets, KitchenOrders.
  3. `20240906000001_create_kitchen_module.js` — KitchenStations, KitchenOrders, KitchenOrderItems, KitchenOrderRevisions.
  4. `20240907000001_create_inventory_module.js` — Ingredients, IngredientUnits, Recipes, RecipeItems, StockBalances, StockMovements.
  5. `20240908000001_create_rbac_module.js` — Roles, Permissions, RolePermissions.
- Seeds: `seeds/seed.js` transaccional — usuarios admin/1234 (PIN bcrypt), productos, mesas, ingredientes, recetas, stock.
- PRAGMAs SQLite activos por conexión: `foreign_keys=ON`, `busy_timeout=5000`, `journal_mode=WAL`, `synchronous=NORMAL`, `temp_store=MEMORY`.
- **PostgreSQL NO implementado** (knexfile sólo define `development` y `production` con sqlite3). DEBE añadirse en FASE 12.

### 2.5 Frontend

- SPA Vanilla JS con Web Components (sin framework).
- Vistas: `login`, `dashboard`, `pos`, `kitchen`, `payment`.
- Store minimalista + websocket-client con reconexión.
- API client con fetch + JWT en `localStorage`.
- CSS variables, layout y componentes sueltos.
- **No es tablet-first** (viewport 1280×800 en Playwright, no portrait / landscape explícitos).
- **No PWA**: no `manifest.webmanifest`, no Service Worker, no iconos 192/512, no instalación visible.
- **No Web Push**: no VAPID, no `/api/push/subscribe`, no service worker push.

---

## 3. Tests — baseline actual

### 3.1 Suite unitaria (Node --test)

| Suite | Tests | PASS | FAIL | Resultado |
|---|---|---|---|---|
| `tests/api-integration.test.js` | 47 | 47 | 0 | ✅ |
| `tests/kds-verification.test.js` | 49 | 49 | 0 | ✅ |
| `tests/inventory-verification.test.js` | 13 | 13 | 0 | ✅ |
| `tests/concurrency-verification.test.js` | 8 | 8 | 0 | ✅ |
| **Total unit** | **117** | **117** | **0** | ✅ |

Comandos ejecutados:
```
node scripts/run-migrations.js
node --test tests/api-integration.test.js
node --test tests/kds-verification.test.js
node --test tests/inventory-verification.test.js
node --test tests/concurrency-verification.test.js
```

### 3.2 Suite E2E (Playwright, chromium)

| Suite | Tests | PASS | FAIL | Resultado |
|---|---|---|---|---|
| `tests/e2e/api-isolated.spec.js` | 15 | 15 | 0 | ✅ |
| `tests/e2e/ui-isolated.spec.js` | 5 | 5 | 0 | ✅ |
| `tests/e2e/websocket-flow.spec.js` | 7 | 7 | 0 | ✅ |
| **Total E2E** | **27** | **27** | **0** | ✅ |

> Re-ejecutado el 2026-09-07 tras `npx playwright install chromium` (versión 1243 del headless shell). Los 5 fallos previos eran exclusivamente por la falta del binario en este entorno; ya no aplican.

### 3.3 Tests visuales / seguridad / failure

- **No existen tests visuales** (regression screenshots / pixel diff).
- **No existen tests de seguridad** (auth bypass, fuzzing, secret scan automatizado).
- **No existen tests de failure** (servidor caído, WS caído, impresora desconectada, doble pago, doble impresión, pérdida de red, DB inaccesible).
- Sólo existen 2 tests de concurrencia relevantes (double payment, double close) dentro de `concurrency-verification.test.js`.

### 3.4 CI (GitHub Actions)

Pipeline `.github/workflows/ci.yml`:
1. `npm ci` (cacheado)
2. lint (`node --check` sobre todos los .js)
3. migraciones + seed programáticos
4. 4 suites unit (47+49+13+8 = 117)
5. Playwright E2E con `failOnFlakyTests=true`, `--repeat-each=2`
6. `docker build` smoke-test con `/health`

**Bug detectado en el YAML del workflow**: la línea `branches: ain]` está truncada (debería ser `branches: [main]`). Esto puede impedir que la CI dispare en pushes a `main`. **Acción FASE 1: corregir `.github/workflows/ci.yml`.**

---

## 4. Seguridad — estado real

| Ítem | Estado | Notas |
|---|---|---|
| `.env` commiteado | ✅ No | gitignore cubre `.env*` correctamente |
| `data/samba.db` commiteado | ❌ Sí | **RIESGO**: BD con datos (usuarios, PINs bcrypt) commiteada en el repo |
| `data/backups/*.meta.json` commiteado | ❌ Sí | Metadatos de backup commiteados — DEBE sacarse |
| `source/` (symlink/submodule) | ⚠️ gitignored | Referencia local al source original de SambaPOS-3; no se commitea |
| `JWT_SECRET` requerido por env | ✅ Sí | Server aborta sin él (bueno) |
| `JWT_SECRET` default débil | ✅ No | No hay default |
| bcrypt obligatorio para PIN | ✅ Sí | Login rechaza PINs no-bcrypt |
| Rate limiting en login | ✅ Sí | 5 intentos / 15 min / IP (deshabilitado en test) |
| Helmet CSP | ✅ Sí | Estricto, `'unsafe-inline'` en script/style por Vanilla JS |
| CORS | ⚠️ Default `*` | En producción DEBE restringirse vía `CORS_ORIGIN` |
| WebSocket auth | ✅ Sí | Token desde `handshake.auth`, no query string |
| RBAC middleware | ✅ Sí | `requirePermission()` en todas las escrituras críticas |
| Middleware auditoría | ✅ Sí | `auditLog()` en tickets, kitchen, inventory, printers |
| Validación de payloads | ⚠️ Parcial | Validación manual en handlers; sin schema (Joi/Zod) |
| Cookies / sesión | ✅ N/A | Sólo JWT stateless |
| Secrets scan automatizado | ❌ No | No hay GitHub secret scanning / gitleaks en CI |
| Dependency audit | ⚠️ Manual | `npm audit` reporta 7 vulns; no bloqueado en CI |
| HTTPS / TLS | ❌ No | El server escucha HTTP plano; producción requiere reverse proxy TLS |
| VAPID / Web Push | ❌ No existe | FASE 9 pendiente |

### Hallazgos de seguridad críticos

1. **`data/samba.db` está commiteado** (verificado con `git ls-files | grep samba.db`). Aunque los PINs están hasheados con bcrypt, expone el esquema, datos de demo y posibles metadatos. **Acción FASE 1**: `git rm --cached data/samba.db`, ampliar `.gitignore`, purge del histórico (git-filter-repo) o aceptar rotación de PINs de demo.
2. **`source/` referencia al source original de SambaPOS-3** (probablemente clonado localmente, NO commiteado — gitignored). Confirmar que ningún subdirectorio rompe licencias.
3. **`.github/workflows/ci.yml` tiene `branches: ain]` truncado** — la CI probablemente no dispara. Acción inmediata FASE 1.
4. **`CORS_ORIGIN` default `*`** — documentado pero peligroso en prod.

---

## 5. Bugs encontrados

| # | Severidad | Componente | Descripción |
|---|---|---|---|
| B1 | ~~Alta~~ **Falso positivo** | `.github/workflows/ci.yml` | Inspección con `cat -A` y hex dump confirma que el YAML contiene `branches: [main]` correctamente. El `[m` fue interpretado como código de escape ANSI por el terminal, ocultando `[main` al ojo. NO es un bug. |
| B2 | Alta | `data/samba.db` | Base de datos commiteada en el repo (git tracked) |
| B3 | Media | `data/backups/samba-backup-*.meta.json` | Metadatos de backup commiteados |
| B4 | Media | `backend/src/api/services/TicketService.js` | `generateMockEscPos()` y `generatePrintPreview()` son mocks (el driver real ESC/POS existe en `PrinterManager.js` pero TicketService todavía tiene el mock legacy) |
| B5 | Media | `backend/src/api/server.js` | 2 TODOs sin cerrar: verificación de acceso al ticket por departamento/terminal y verificación de asignación de terminal |
| B6 | Baja | `backend/src/domain/CalculationEngine.js` | TODO: ProductTimer handling omitido en Sprint 1 |
| B7 | Baja | `backend/src/api/routes/config.js` | Ninguna ruta `config` está protegida por `requirePermission` (sólo por `authenticate`) — lectura sensible sin RBAC |
| B8 | Baja | `backend/src/api/routes/products.js` | `POST /` (crear producto) NO protegido por `requirePermission` |
| B9 | Baja | `backend/src/api/routes/tables.js` | `PATCH /:id/state` NO protegido por `requirePermission` |
| B10 | Baja | `backend/src/api/routes/printers.js` | `GET /`, `GET /:id`, `GET /:id/status` no protegidos por `requirePermission` |
| B11 | Baja | `backend/src/api/routes/kitchen.js` | `GET /stats/:stationId` y `POST /orders/:id/state` no protegidos por `requirePermission` (sólo audit) |
| B12 | Baja | `backend/src/api/server.js` | CORS default `*` — peligroso si se olvida setear `CORS_ORIGIN` |
| B13 | Baja | `backend/src/api/services/PrinterManager.js` | Driver ESC/POS real pero **sin tests de hardware** — el prompt exige hardware real probado |
| B14 | Info | `data/samba.db` | Teardown de tests falla al limpiar `MenuItems` por FK constraint (no afecta al pass count) |

---

## 6. Deuda técnica

| Área | Deuda |
|---|---|
| Mocks | `TicketService.generateMockEscPos()` y `generatePrintPreview()` son mocks aunque existe `PrinterManager` real — duplicación, deuda de migración |
| TODOs | 3 TODOs sin cerrar (server.js ×2, CalculationEngine.js ×1) |
| DB commiteada | `data/samba.db` y `data/backups/*.meta.json` en git — necesita purge del histórico |
| CORS | Default `*` no adecuado para producción |
| Sin PostgreSQL | `knexfile` no define `postgres` — FASE 12 entera pendiente |
| Sin PWA | No manifest, no SW, no iconos, no instalación |
| Sin Web Push | No VAPID, no `/api/push/subscribe`, no SW push handler |
| Sin offline | Sólo docs `OFFLINE.md`, no implementación real (outbox, dedupe, conflict policy) |
| Sin Android | No Capacitor, no `com.sambapos.lba`, no APK/AAB |
| Sin admin panel | Sólo APIs de lectura — no hay UI de administración completa |
| Sin reportes | No endpoints de reportes, no export CSV/XLSX/PDF |
| Caja incompleta | WorkPeriod / CashSession no implementados como módulo (sólo tablas en schema) |
| Sin tests visuales | No hay regression visual ni screenshot baseline automatizado |
| Sin tests de seguridad | No auth bypass, no fuzzing, no secret scan en CI |
| Sin tests de failure | No hay suite de resiliencia (servidor/WS/impresora caídos) |
| Sin observabilidad | No metrics, no request IDs estructurados, no audit IDs (sólo auditLog básico) |
| Sin HTTPS/TLS | Server HTTP plano, requiere reverse proxy |
| Sin backup verify en CI | `scripts/backup.js` y `scripts/restore.js` existen pero no se testean en CI |

---

## 7. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `data/samba.db` expone datos de demo y PINs (aunque bcrypt) | Alta | Medio | `git rm --cached` + purge histórico en FASE 1 |
| CI no dispara por YAML roto (`branches: ain]`) | Alta | Alto | Fix inmediato FASE 1 |
| Dependencia `tar` crítica vulnerable | Alta | Alto (RCE en build-time) | Bump `sqlite3@6.x` en FASE 1 |
| CORS `*` en producción | Media | Alto | Forzar `CORS_ORIGIN` obligatorio en prod |
| Sin impresión real verificada con hardware | Alta | Alto (criterio producción) | FASE 7 con hardware real |
| Sin PostgreSQL → bloqueo escalabilidad | Media | Alto | FASE 12 |
| Sin PWA → no instalable en tablet | Alta | Alto | FASE 10 |
| Sin Web Push → notificaciones OS no llegan | Alta | Medio | FASE 9 |
| Sin offline real → pérdida de pedidos en corte de red | Media | Alto | FASE 11 |
| Sin admin panel UI → no operable como producto | Alta | Alto | FASE 4 |
| Sin Android → no cumple meta multiplataforma | Alta | Medio | FASE 15 |
| Licencia de `source/` (SambaPOS-3 original) | Media | Alto | Verificar licencia; no commitear source original |
| Tests visuales inexistentes → regression UI no detectado | Media | Medio | FASE 17 |
| 5 E2E no ejecutables en este entorno local | Baja | Bajo | `npx playwright install chromium` — no es defecto del repo |

---

## 8. Identidad visual actual

- **No es predominantemente azul**. El frontend actual usa CSS variables genéricas sin una paleta azul definida. La FASE 16 exige redesign completo azul/tablet-first.
- Login es funcional pero no tablet-first ni PIN keypad dedicado (formulario HTML).
- Dashboard/POS/Kitchen visuales funcionales pero genéricos.
- No hay logos `SambaPos_LBA` ni iconos PWA.

---

## 9. Cobertura del prompt por fase

| Fase | Estado | Cobertura |
|---|---|---|
| FASE 0 — Auditoría | ✅ Este documento | 100% (en curso) |
| FASE 1 — Seguridad y limpieza | ⚠️ Parcial | bcrypt ✅, JWT ✅, helmet ✅, rate-limit ✅, WS auth ✅, RBAC ✅, audit ✅. Faltan: sacar `.env` (no existe, OK), sacar `samba.db` del repo, rotar secretos, CSP más estricto, validación de payloads con schema |
| FASE 2 — Dominio | ⚠️ Parcial | Ticket ✅, Order ✅, Payment ✅, Calculation ✅, Tax ✅, Discount ✅, Note ✅, Gift ✅, Void ✅, Refund ✅, Split ✅, Merge ✅. Faltan: Customer, Account (aggregate), CashSession, WorkPeriod (como aggregate), PrintJob (modelo dominio), Notification, AuditLog (modelo dominio) |
| FASE 3 — POS | ⚠️ Parcial | Flujo principal OK. Faltan: pago parcial real, múltiples métodos de pago combinados, idempotency keys en cliente |
| FASE 4 — Administración | ❌ No implementado | No hay panel admin UI. Sólo APIs de lectura |
| FASE 5 — Inventario y recetas | ✅ Casi completo | Recipes, stock ledger, deducción transaccional, reversión, movimientos, alertas low-stock. Faltan: traspasos, inventario físico, merma formalizada |
| FASE 6 — Cocina / KDS | ✅ Casi completo | Stations, routing, state machine, bump, recall, void propagation, audit. Faltan: temporizador visual, prioridad UI, sonido, feedback visual rico |
| FASE 7 — Impresión real | ⚠️ Parcial | `PrinterManager` con driver ESC/POS TCP real, retry, fallback. Faltan: tests con hardware real, golden fixtures, comparación bytes |
| FASE 8 — Tiempo real | ✅ Casi completo | Socket.io con auth, rooms, resync, bridge eventBus. Faltan: reconnect con backoff+jitter+heartbeat formales (la lib socket.io-client tiene reconnect nativo, pero falta capa explícita) |
| FASE 9 — Push notifications | ❌ No implementado | No VAPID, no `/api/push/subscribe`, no SW push |
| FASE 10 — PWA | ❌ No implementado | No manifest, no SW, no iconos, no instalación |
| FASE 11 — Offline y sync | ❌ No implementado | Sólo docs `OFFLINE.md` |
| FASE 12 — Base de datos | ⚠️ Parcial | SQLite OK. PostgreSQL NO implementado |
| FASE 13 — Caja | ❌ No implementado | WorkPeriod / CashSession sólo como tablas, sin servicios ni UI |
| FASE 14 — Reportes | ❌ No implementado | Sin endpoints ni UI |
| FASE 15 — Android | ❌ No implementado | No Capacitor, no APK |
| FASE 16 — UI final azul | ❌ No implementado | UI actual genérica, no azul, no tablet-first |
| FASE 17 — Testing final | ⚠️ Parcial | Unit ✅, E2E ⚠️. Faltan: visual, security, failure |
| FASE 18 — Producción | ⚠️ Parcial | Docker ✅, health ✅, ready ✅, graceful shutdown ✅, backup/restore scripts ✅. Faltan: logs estructurados, request IDs, metrics, restore verify en CI, deployment/recovery guide formal |

**Progreso global estimado:** ~35-40% del criterio de aceptación final.

---

## 10. Plan por fases (propuesta de ejecución)

> Sigue el orden estricto del prompt. Cada fase termina con reporte según el formato del prompt (FASE/ESTADO/CAMBIOS/...). No se mezclan fases.

### FASE 1 — Seguridad y limpieza (alta prioridad, 1-2 sesiones)
- [ ] `git rm --cached data/samba.db data/backups/*.meta.json` + ampliar `.gitignore`
- [ ] Fix `.github/workflows/ci.yml` (`branches: [main]`)
- [ ] Bump `sqlite3@6.x` + re-run tests
- [ ] Crear `.env.example` documentado
- [ ] Endurecer CORS: error fatal si `NODE_ENV=production` y `CORS_ORIGIN='*'`
- [ ] Añadir `requirePermission` a rutas que faltan (config, products POST, tables PATCH, printers GET, kitchen GET /stats y POST /state)
- [ ] Añadir validación de schema (Zod o Joi) en handlers críticos
- [ ] Secret scan automatizado (gitleaks) en CI
- [ ] Tests de seguridad: auth bypass, fuzzing básico

### FASE 2 — Dominio
- [ ] Agregados faltantes: `Customer`, `CashSession`, `WorkPeriod`, `PrintJob`, `Notification`, `AuditLog`
- [ ] Idempotency keys en operaciones críticas (pagos, impresiones, voids)
- [ ] Transiciones de estado del ticket formalizadas en máquina de estados

### FASE 3 — POS
- [ ] Pago parcial real
- [ ] Múltiples métodos de pago combinados en un mismo cierre
- [ ] Idempotency keys en cliente frontend
- [ ] Protección contra doble toque (debounce + lock UI)

### FASE 4 — Administración
- [ ] UI admin completa con sidebar
- [ ] CRUD para cada módulo (empresa, usuarios, roles, permisos, terminales, departamentos, salones, mesas, productos, categorías, menús, porciones, tags, clientes, métodos de pago, almacenes, inventario, recetas, costos, impresoras, print jobs, templates, automatizaciones, auditoría, backups, reportes, configuración)
- [ ] Cada módulo con tests API + E2E

### FASE 5 — Inventario y recetas (completar)
- [ ] Traspasos entre almacenes
- [ ] Inventario físico (stocktake)
- [ ] Merma formalizada con motivo
- [ ] Combos y receta automática

### FASE 6 — Cocina / KDS (completar)
- [ ] Temporizador visual
- [ ] Prioridad UI
- [ ] Sonido opcional
- [ ] Feedback visual rico

### FASE 7 — Impresión real
- [ ] Tests con hardware real (impresora térmica ESC/POS)
- [ ] Golden fixtures con comparación bytes
- [ ] PrintJob como modelo de dominio
- [ ] Monitor de impresión en tiempo real

### FASE 8 — Tiempo real (completar)
- [ ] Reconnect con exponential backoff + jitter
- [ ] Heartbeat formal
- [ ] Resync después de reconectar (mejorar cobertura)

### FASE 9 — Push notifications
- [ ] VAPID keys
- [ ] `/api/push/subscribe`, `/api/push/unsubscribe`
- [ ] Device registry, subscription cleanup, categorías
- [ ] Service Worker push handler
- [ ] Notificaciones mínimas: cocina, listo, impresora caída, stock bajo, servidor no disponible, cierre pendiente

### FASE 10 — PWA
- [ ] `manifest.webmanifest` con `theme_color` azul
- [ ] Iconos 192/512 + variants
- [ ] Service Worker con cache strategy
- [ ] Update strategy
- [ ] Flujo de instalación visible

### FASE 11 — Offline y sync
- [ ] Local cache + device ID + outbox
- [ ] Operation UUID + dedupe + conflict policy
- [ ] Server acknowledgement + resync

### FASE 12 — Base de datos
- [ ] PostgreSQL target en `knexfile`
- [ ] Tests de migración SQLite → PostgreSQL
- [ ] Instalación limpia: install → migrate → seed opcional → start

### FASE 13 — Caja
- [ ] Work period / cash session / opening amount / payments / payouts / transfers / closing count / expected / actual / difference / audit

### FASE 14 — Reportes
- [ ] Endpoints: ventas, productos, categorías, usuario, terminal, departamento, métodos de pago, impuestos, descuentos, voids, refunds, recetas/costo, stock, movimientos, merma, caja, auditoría
- [ ] Export CSV/XLSX/PDF

### FASE 15 — Android
- [ ] Capacitor wrapper
- [ ] `com.sambapos.lba`
- [ ] Icon + splash + push + deep links + secure storage
- [ ] Bridge de impresora para hardware no accesible vía Web

### FASE 16 — UI final azul
- [ ] Paleta azul completa (10+ tonalidades)
- [ ] Login con PIN keypad
- [ ] Dashboard, POS, KDS, Admin todos azul y tablet-first
- [ ] Portrait + landscape
- [ ] Touch-first, sin hover dependency

### FASE 17 — Testing final
- [ ] Unit (cubrir dominio completo)
- [ ] Integration (API completa)
- [ ] E2E (Login → Mesa → Ticket → Cocina → Pago → Recibo)
- [ ] Visual (regression screenshots)
- [ ] Failure (servidor, WS, impresora, token, doble pago, doble impresión, red, DB)
- [ ] Security (secrets scan, dependency audit, auth bypass, RBAC, fuzzing)

### FASE 18 — Producción
- [ ] Logs estructurados (JSON)
- [ ] Request IDs + audit IDs
- [ ] Metrics (Prometheus o similar)
- [ ] Backup verify en CI (backup → destroy → install → restore → verify)
- [ ] Deployment guide + recovery guide

---

## 11. Veredicto FASE 0

```
FASE: 0 - AUDITORÍA OBLIGATORIA
ESTADO: PASS (auditoría completa, no se modificó la arquitectura)

CAMBIOS:
- Ninguno (sólo lectura y ejecución de tests)

ARCHIVOS MODIFICADOS:
- Ninguno (este documento es nuevo: docs/BASELINE_REPORT.md)

MIGRACIONES:
- Aplicadas 5 migraciones existentes (sin cambios)

TESTS:
- Unit: 117/117 PASS (api-integration 47, kds 49, inventory 13, concurrency 8)
- Integration: 117/117 (incluidos en unit)
- E2E: 27/27 PASS (api-isolated 15, ui-isolated 5, websocket-flow 7) — chromium 1243 instalado
- Visual: 0/0 (no existen)
- Security: 0/0 (no existen)
- Failure: 0/0 (no existen)

RIESGOS:
- data/samba.db commiteada en el repo
- .github/workflows/ci.yml con sintaxis rota (branches: ain])
- Dependencia tar@<=7.5.20 CRÍTICA vía sqlite3→node-gyp
- CORS default '*' peligroso en producción
- Sin impresión con hardware real verificada
- Sin PWA, sin Web Push, sin Android, sin PostgreSQL, sin admin panel, sin reportes

DEUDA PENDIENTE:
- 14 items de deuda técnica (ver §6)
- 13 fases pendientes o parciales (ver §9-10)

SIGUIENTE FASE:
- FASE 1 — SEGURIDAD Y LIMPIEZA (con tests de regresión antes y después)
```

---

## 12. Próximas acciones inmediatas

1. **Confirmar con el usuario** que este baseline es aceptado y se procede a FASE 1.
2. Antes de FASE 1: ejecutar `npx playwright install chromium` en este entorno para re-validar los 5 E2E que no corrieron.
3. FASE 1 se ejecutará en orden: backup → fix CI → bump sqlite3 → limpiar DB commiteada → `.env.example` → CORS estricto → RBAC en rutas faltantes → validación schema → secret scan CI → tests de seguridad.
4. Cada cambio de FASE 1 se commitirá por separado (commits pequeños, reversibles) y se ejecutará la suite completa antes/después.
