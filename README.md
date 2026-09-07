<div align="center">

# SambaPos_LBA

**Sistema POS web moderno, táctil, instalable y offline-capable para restaurantes**  
Construido con Node.js + Express + Knex + SQLite + Socket.io + Vanilla JS

[![CI](https://img.shields.io/github/actions/workflow/status/Lean031110/Samba_Pos_V3-Web/ci.yml?branch=main&label=CI)](https://github.com/Lean031110/Samba_Pos_V3-Web/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-320%2F320-brightgreen.svg)](#pruebas)
[![Vulnerabilities](https://img.shields.io/badge/vulnerabilities-0-brightgreen.svg)](#seguridad)
[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](./CHANGELOG.md)
[![PWA](https://img.shields.io/badge/PWA-installable-blue.svg)](#pwa--android)

</div>

---

SambaPos_LBA es un **POS web profesional** construido sobre la referencia
funcional de **SambaPOS V3** (la versión de escritorio WPF/C# original de
*emreeren*), pero con una arquitectura web moderna superior: **mobile-first**,
**PWA instalable**, **tiempo real**, **offline tolerante**, **impresión
real ESC/POS**, **inventario con recetas**, **KDS multi-estación**, **RBAC**
y **auditoría completa**.

> **No es un fork del código WPF.** El código fuente original de SambaPOS V3
> se usó únicamente como referencia funcional para reimplementar las reglas
> de negocio en una arquitectura web moderna. Ver [Créditos](#créditos).

### Identidad visual

La interfaz utiliza una **familia de tonalidades azules** como color de
marca (azul oscuro, azul profundo, azul medio, azul brillante, azul claro),
con colores neutros para equilibrio y colores semánticos exclusivamente
para estados (error, alerta, éxito, bloqueo). La UI está diseñada **primero
para tablets Android y pantallas táctiles**, con botones grandes y
tolerancia a pérdida de red temporal.

---

## Capturas de pantalla

| Login | Dashboard |
|:---:|:---:|
| <img src="docs/screenshots/01-login-filled.png" alt="Login" width="400"> | <img src="docs/screenshots/02-dashboard.png" alt="Dashboard" width="400"> |

| POS — vista vacía | POS — con barra de comandos |
|:---:|:---:|
| <img src="docs/screenshots/03-pos-empty.png" alt="POS vacío" width="400"> | <img src="docs/screenshots/04-pos-cmdbar.png" alt="POS con barra de comandos" width="400"> |

| Modal de nota | Kitchen Display System (KDS) |
|:---:|:---:|
| <img src="docs/screenshots/05-note-modal.png" alt="Nota" width="400"> | <img src="docs/screenshots/e2e-04-kitchen-view.png" alt="KDS" width="400"> |

| WebSocket conectado | Error de login |
|:---:|:---:|
| <img src="docs/screenshots/09-ws-connected.png" alt="WS" width="400"> | <img src="docs/screenshots/08-login-error.png" alt="Login error" width="400"> |

---

## Tabla de contenidos

- [Características](#características)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación rápida](#instalación-rápida)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Pruebas](#pruebas)
- [Seguridad](#seguridad)
- [PWA / Android](#pwa--android)
- [Despliegue con Docker](#despliegue-con-docker)
- [Roadmap](#roadmap)
- [Documentación](#documentación)
- [Contribuir](#contribuir)
- [Licencia](#licencia)
- [Créditos](#créditos)
- [Estado del proyecto](#estado-del-proyecto)

---

## Características

- **POS completo** — tickets, órdenes, pagos, cálculos, descuentos, regalos,
  *voids*, *refunds*, *splits* y *merges*.
- **Mobile-first** — diseñado primero para tablets Android (7"–10"+),
  teléfonos y pantallas táctiles. Soporta portrait y landscape.
- **KDS multi-estación** con routing, *state machine* de órdenes y propagación
  de *voids* entre estaciones.
- **Inventario y recetas** con deducción transaccional al cerrar el ticket,
  costo de receta, margen y precio sugerido.
- **Impresión real ESC/POS** con transporte TCP, *retry* exponencial y
  *fallback*. Cola persistente con idempotency keys.
- **WebSocket** con autenticación JWT, *rooms* por rol, *reconnect* con
  *exponential backoff* + *heartbeat* y *resync* tras reconexión.
- **RBAC granular** con 26 permisos y *audit log* en acciones sensibles.
- **Idempotency protection** en operaciones críticas (pago, void, refund,
  cierre, payout).
- **PWA instalable** — `manifest.webmanifest`, *service worker* y soporte
  *offline shell* para sobrevivir pérdida temporal de red.
- **Migraciones Knex** + *seed* transaccional.
- **Docker multi-stage** con endpoints de *health* y *readiness*.
- **CI/CD** con *gitleaks* (secret scan) + *npm audit* gate antes de correr
  los tests.
- **Suite de pruebas: 320 tests** (293 unit + 27 E2E).
- **Seguridad**: JWT obligatorio (sin *defaults*), bcrypt, *rate-limiting* en
  login, CSP estricto con *helmet*, CORS estricto en producción.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| **Backend** | Node.js 20 + Express 5 + Helmet + express-rate-limit |
| **Frontend** | Vanilla JS + Web Components (sin framework, sin virtual DOM) |
| **Base de datos** | SQLite 3.44 (modo WAL) + Knex 3 (migraciones + query builder) |
| **WebSocket** | Socket.io 4 (multi-terminal sync) |
| **Tests** | `node --test` (unit/integration) + Playwright 1.63 (E2E) |
| **DevOps** | Docker multi-stage + GitHub Actions + gitleaks |

---

## Arquitectura

Arquitectura **DDD-lite en capas**: el dominio no tiene dependencias (puro),
la infraestructura lo persiste, la capa de aplicación lo orquesta, y la API
REST lo expone. El `eventBus` (pub/sub interno) reproduce el patrón
`EventAggregator` de PRISM usado en el WPF original, y un puente de
Socket.io lo publica a los clientes conectados por rol.

```mermaid
flowchart TD
    subgraph Client["Frontend (Navegador)"]
        UI["Vanilla JS + Web Components<br/>Store Observable"]
    end

    subgraph Server["Servidor Express"]
        API["API REST<br/>(auth, tickets, products, tables,<br/>kitchen, inventory, printers, config)"]
        MW["Middleware:<br/>helmet · cors · rate-limit<br/>authenticate · requirePermission<br/>auditLog · schemas (Zod) · errorHandler"]
        APP["Application Services<br/>TicketService · KitchenService<br/>InventoryService · PrinterManager"]
        EB["eventBus (pub/sub)"]
        WS["Socket.io bridge<br/>rooms por rol + resync"]
    end

    subgraph Domain["Dominio (puro, sin deps)"]
        DOM["Ticket · OrderBuilder · TicketBuilder<br/>CalculationEngine (decimal.js)<br/>AccountTransaction · AccountTransactionDocument<br/>TicketRecalculator"]
    end

    subgraph Infra["Infraestructura"]
        KNEX["Knex 3<br/>(migraciones + query builder)"]
        REPO["Repositories:<br/>TicketRepository<br/>ProductRepository<br/>TableRepository"]
        DB[("SQLite (WAL mode)")]
    end

    UI <-->|"HTTP + JWT"| API
    API --> MW --> APP
    APP --> EB
    EB --> WS
    WS <-->|"WebSocket + JWT"| UI
    APP --> DOM
    APP --> REPO
    REPO --> KNEX
    KNEX --> DB
```

**Decisiones de diseño clave**:

1. **`CalculationEngine` es el único punto de entrada a `decimal.js`** — ningún
   otro módulo toca la librería directamente. Esto garantiza paridad monetaria
   *byte-a-byte* con el C# original (incluida la mezcla de modos de redondeo
   `ToEven` y `AwayFromZero`).
2. **Ledger de doble entrada** — cada operación monetaria (venta, impuesto,
   descuento, pago, cambio, reembolso) crea o actualiza un
   `AccountTransaction` dentro del `AccountTransactionDocument` del ticket.
3. **Auto-reversal** — `AccountTransaction.UpdateAmount(-amount)` intercambia
   *Source* ↔ *Target* automáticamente (usado para reembolsos).
4. **JSON short DataMember names** — `Ticket.TicketTags`, `Order.Taxes` y
   `Order.OrderStates` se persisten como JSON strings (igual que en el
   SQL CE original).
5. **PRAGMAs SQLite obligatorios** — `foreign_keys=ON`, `defer_foreign_keys=ON`
   en transacciones, `journal_mode=WAL`, `busy_timeout=5000`,
   `synchronous=NORMAL`.

---

## Requisitos

- **Node.js** 20 o superior
- **npm** 10 o superior
- (Opcional) **Docker** + **Docker Compose** para despliegue con un comando

---

## Instalación rápida

```bash
# 1. Clonar el repositorio
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web/backend

# 2. Instalar dependencias (reproducible desde package-lock.json)
npm ci

# 3. Copiar variables de entorno y editarlas
cp ../.env.example ../.env
# edit .env — set JWT_SECRET, CORS_ORIGIN, ADMIN_PIN
#   JWT_SECRET=$(openssl rand -hex 32)

# 4. Migraciones (crean data/samba.db con todas las tablas)
npm run migrate

# 5. Seed transaccional (admin user + 19 reglas de cálculo + 4 payment types + ...)
npm run seed

# 6. Levantar el servidor
npm start
```

| URL | Servicio |
|-----|----------|
| http://localhost:3001/ | Frontend (servido como SPA por Express) |
| http://localhost:3001/api | API REST |
| ws://localhost:3001 | WebSocket (multi-terminal sync) |
| http://localhost:3001/health | Healthcheck (HTTP + DB) |

**Login admin:** usuario `Administrator`, PIN = valor de `ADMIN_PIN` en `.env`
(por defecto `1234`).

---

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores. **En producción** todos
los marcados como *requerido* son obligatorios.

| Variable | Requerido | Default | Descripción |
|----------|:---:|---------|-------------|
| `NODE_ENV` | no | `development` | `development`, `production` o `test` |
| `PORT` | no | `3001` | Puerto HTTP + WebSocket |
| `JWT_SECRET` | **sí** | — | Secret para firmar JWT. Mínimo 32 caracteres. Genera con `openssl rand -hex 32`. |
| `JWT_EXPIRES_IN` | no | `8h` | Expiración del token (formato `ms`) |
| `CORS_ORIGIN` | **sí en prod** | `*` (solo dev) | Lista separada por comas de orígenes permitidos. **`*` es rechazado en producción** — el servidor aborta el arranque. |
| `SAMBA_DB_PATH` | no | `data/samba.db` | Ruta de la BD SQLite (relativa al backend o absoluta) |
| `ADMIN_PIN` | **sí (seed)** | `1234` | PIN del admin inicial. *Solo se usa en `npm run seed`*. Se almacena como *bcrypt hash*. |
| `BACKUP_DIR` | no | `data/backups` | Directorio donde se guardan los *snapshots* de backup |

> **Importante:** nunca confirmes `.env` en git. El archivo está en
> `.gitignore` y el CI ejecuta *gitleaks* en cada push.

---

## Scripts disponibles

Ejecutar desde el directorio `backend/`:

| Script | Descripción |
|--------|-------------|
| `npm start` | Inicia el servidor Express + Socket.io |
| `npm run dev` | Modo *watch* (reinicia al guardar) |
| `npm run migrate` | Aplica las migraciones pendientes de Knex |
| `npm run migrate:rollback` | Deshace la última migración |
| `npm run seed` | Ejecuta el *seed* transaccional (admin + datos demo) |
| `npm test` | Tests de integración HTTP (`api-integration.test.js`) |
| `npm run test:sprint2` | Acceptance test del motor de negocio |
| `npm run test:e2e` | E2E del flujo completo (HTTP + WebSocket) |
| `npm run test:playwright` | E2E con navegador real (Playwright + Chromium) |
| `npm run test:print` | Test de checksum ESC/POS (buffer determinista) |
| `npm run backup` | Crea un *snapshot* de la BD |
| `npm run restore` | Restaura el *snapshot* más reciente |

Para correr **toda la suite de un solo comando**:

```bash
bash scripts/run-all-tests.sh
```

---

## Estructura del proyecto

```
Samba_Pos_V3-Web/               # Repo root (no samba-web-clone/ wrapper)
├── .env.example                # Template de variables de entorno
├── .gitleaks.toml              # Config de secret scan en CI
├── .github/workflows/ci.yml   # Pipeline: gitleaks + npm audit + tests + docker
├── Dockerfile                  # Imagen multi-stage (Node 20 slim)
├── docker-compose.yml          # Servicio + volumen + healthcheck
├── LICENSE                     # MIT
├── README.md                   # Este archivo
├── CONTRIBUTING.md             # Guía para contribuidores
├── CODE_OF_CONDUCT.md          # Contributor Covenant 2.1
├── CHANGELOG.md                # Historial de versiones
│
├── analysis/                   # Análisis forense del SambaPOS V3 original
│   ├── FULL_ARCHITECTURE_REPORT.md   # 30+ proyectos C# descompuestos
│   ├── DATABASE_SCHEMA_EXACT.sql    # 96 tablas + ER Mermaid
│   ├── UI_SPECS_FOR_WEB.md          # Paleta, tipografía, layouts
│   ├── BUSINESS_RULES_ENGINE.md     # Pseudocódigo 1:1 de los calculadores
│   └── DDL_EXAMPLES_SPRINT1.sql
│
├── backend/
│   ├── package.json
│   ├── playwright.config.js
│   ├── src/
│   │   ├── api/                # Capa de presentación (Express)
│   │   │   ├── server.js
│   │   │   ├── routes/         # auth, tickets, products, tables, kitchen,
│   │   │   │                    # inventory, printers, config, customers,
│   │   │   │                    # cash-sessions, work-periods
│   │   │   ├── services/       # TicketService, KitchenService,
│   │   │   │                    # InventoryService, PrinterManager,
│   │   │   │                    # CashSessionService, CustomerService
│   │   │   └── middleware/     # auth, rbac, auditLog, schemas (Zod),
│   │   │                        # idempotency, logger, errorHandler
│   │   ├── application/
│   │   │   └── eventBus.js     # Pub/sub interno (emula PRISM EventAggregator)
│   │   ├── domain/            # Puro, sin dependencias externas
│   │   │   ├── Ticket.js
│   │   │   ├── TicketStateMachine.js   # Transiciones formales (open→closed→void)
│   │   │   ├── OrderBuilder.js
│   │   │   ├── TicketBuilder.js
│   │   │   ├── TicketRecalculator.js
│   │   │   ├── CalculationEngine.js   # Único punto de entrada a decimal.js
│   │   │   ├── AccountTransaction.js
│   │   │   ├── AccountTransactionDocument.js
│   │   │   ├── CashSession.js         # Sesión de caja (open/close/payout)
│   │   │   ├── WorkPeriod.js          # Jornada de trabajo
│   │   │   ├── Customer.js
│   │   │   ├── PrintJob.js            # Idempotent print job abstraction
│   │   │   └── Notification.js
│   │   └── infrastructure/
│   │       ├── db/             # Knex config + db.js + migraciones + seeds
│   │       └── repositories/   # TicketRepository, ProductRepository, TableRepository
│   ├── scripts/                # backup, restore, run-migrations, run-all-tests.sh
│   └── tests/
│       ├── api-integration.test.js       # 47 tests
│       ├── kds-verification.test.js       # 49 tests
│       ├── inventory-verification.test.js # 13 tests
│       ├── concurrency-verification.test.js # 8 tests
│       ├── idempotency-verification.test.js # 7 tests
│       ├── domain-verification.test.js   # 72 tests (state machine, ledger)
│       ├── security-verification.test.js # 21 tests (CORS, auth bypass, fuzzing)
│       └── e2e/                           # Playwright (27 tests)
│           ├── api-isolated.spec.js
│           ├── ui-isolated.spec.js
│           ├── websocket-flow.spec.js
│           └── global-setup.js
│
├── docs/                       # Documentación por módulo
│   ├── BASELINE_REPORT.md
│   ├── PHASE1_REPORT.md
│   ├── PHASE2_REPORT.md
│   ├── PHASE3_REPORT.md
│   ├── PRODUCTION.md
│   ├── KITCHEN.md
│   ├── INVENTORY.md
│   ├── PRINTING.md
│   ├── RBAC.md
│   ├── BACKUP.md
│   ├── OFFLINE.md
│   ├── worklog-history.md     # Worklog histórico de auditoría forense
│   └── screenshots/            # Capturas de pantalla referenciadas arriba
│
├── frontend/
│   ├── index.html
│   ├── manifest.webmanifest    # PWA manifest (display: standalone, azul)
│   ├── sw.js                   # Service Worker (offline shell)
│   ├── css/                    # variables (azul), reset, layout, components
│   ├── js/
│   │   ├── app.js
│   │   ├── views/              # login, dashboard, pos, payment, kitchen
│   │   ├── services/           # api.js
│   │   ├── store/              # store.js, websocket-client.js (reconnect)
│   │   └── components/         # flex-button.js (Web Component)
│   └── vendor/                 # Font Awesome 6 + socket.io client
│
└── data/                       # SQLite db (NO se commitea — ver .gitignore)
    └── backups/                # Snapshots (también gitignored)
```

---

## Pruebas

El proyecto mantiene **320 tests passing** distribuidos en múltiples capas:

| Capa | Suite | # Tests | Cómo correrla |
|------|-------|:---:|---------------|
| **Unit / Integration** | `api-integration.test.js` | 47 | `npm test` |
| Unit / Integration | `kds-verification.test.js` | 49 | `node --test tests/kds-verification.test.js` |
| Unit / Integration | `inventory-verification.test.js` | 13 | `node --test tests/inventory-verification.test.js` |
| Unit / Integration | `concurrency-verification.test.js` | 8 | `node --test tests/concurrency-verification.test.js` |
| Unit / Integration | `idempotency-verification.test.js` | 7 | `node --test tests/idempotency-verification.test.js` |
| **Concurrency** | `idempotency-concurrency.test.js` | 7 | `node --test tests/idempotency-concurrency.test.js` |
| Unit / Integration | `domain-verification.test.js` | 72 | `node --test tests/domain-verification.test.js` |
| **Security** | `security-verification.test.js` | 21 | `node --test tests/security-verification.test.js` |
| **Printing** | `printing-verification.test.js` | 24 | `node --test tests/printing-verification.test.js` |
| **Recipes** | `recipes-verification.test.js` | 25 | `node --test tests/recipes-verification.test.js` |
| **Refund** | `refund-verification.test.js` | 6 | `node --test tests/refund-verification.test.js` |
| **Unit conversion** | `unit-conversion-verification.test.js` | 14 | `node --test tests/unit-conversion-verification.test.js` |
| **E2E (Playwright)** | `api-isolated.spec.js` + `ui-isolated.spec.js` + `websocket-flow.spec.js` | 27 | `npm run test:playwright` |
| **Total** | | **320** | |

**Comandos unificados:**
- `npm test` — solo api-integration (partial, para dev rápido).
- `npm run test:unit` — todos los 10 archivos de tests unitarios.
- `npm run test:all` — unit + E2E completo (vía `run-all-tests.sh`).
- `npm run test:playwright` — solo Playwright E2E.

### Estrategia de tests

- **Unit tests (`node --test`)** — 293 tests en 12 suites. Cubren el dominio
  (cálculos, ledger de doble entrada, auto-reversal, state machine), los
  servicios de aplicación, las rutas REST, la concurrencia, la idempotencia
  (incluyendo concurrencia real), la impresión (con golden fixtures), el
  refund (con IsRefunded + reversal idempotente) y la conversión de
  unidades (kg↔gr, L↔ml, con tests matemáticos que verifican 200 gr = 0.2 kg).
- **E2E tests (Playwright + Chromium)** — 27 tests en 3 suites. Cubren los
  flujos completos de UI (login → dashboard → POS → nota → pago → cierre),
  la API aislada y los flujos de WebSocket multi-cliente (incluye
  reconexión).
- **Security tests** — 21 tests específicos de *hardening*:
  - CORS *hardening* (3): verifica que el server aborta en producción si
    `CORS_ORIGIN='*'`.
  - *Auth bypass* (10): verifica que todas las rutas `/api/*` (excepto
    `/auth/login`) rechazan requests sin JWT válido.
  - *Fuzzing* en login (8): envía payloads maliciosos/malformados al endpoint
    de login para verificar que Zod los rechaza.

### Cómo correr todo

```bash
bash scripts/run-all-tests.sh
```

Este *script* resetea la BD entre suites y reporta el resultado final. El CI
lo replica en cada push a `main` y en cada PR.

---

## Seguridad

La postura de seguridad sigue el principio **fail-secure**:

- **JWT obligatorio** — no hay *defaults* para `JWT_SECRET`. La app aborta el
  arranque si falta o es menor a 32 caracteres.
- **bcrypt obligatorio para PINs** — los PINs nunca se almacenan en texto
  plano; el *seed* los hashea con bcrypt antes de insertarlos.
- **Rate limiting en login** — 5 intentos cada 15 minutos por IP, con
  respuesta 429 estándar.
- **Helmet con CSP estricto** — `Content-Security-Policy`, `X-Content-Type-
  Options`, `X-Frame-Options: DENY`, etc.
- **CORS estricto en producción** — `CORS_ORIGIN='*'` o vacío es rechazado:
  el servidor llama `process.exit(1)` con un mensaje claro antes de abrir
  el socket.
- **RBAC granular** — 26 permisos discretos (`tickets.create`, `tickets.close`,
  `products.edit`, `kitchen.route`, etc.) aplicados vía `requirePermission()`
  en 11 rutas previamente sin RBAC.
- **Auditoría** — cada acción sensible (crear/editar producto, cambiar estado
  de mesa, cerrar ticket, etc.) escribe en `audit_log` con usuario, IP,
  payload y timestamp.
- **Validación de payload con Zod** — 9 *handlers* críticos (`auth.login` +
  8 endpoints de tickets) validan el body con schemas *strict* que rechazan
  claves desconocidas.
- **Idempotency protection** — las operaciones críticas usan claves de
  idempotencia para evitar duplicados por reintento.
- **gitleaks + npm audit gate en CI** — el job `security` corre antes que
  el job `test`. Si gitleaks detecta un secret o `npm audit --audit-level=low`
  reporta vulnerabilidades, el build falla.

> **Estado actual:** 0 vulnerabilidades (`npm audit`), 0 *leaks* (`gitleaks`
> en 31 commits escaneados).

Ver [`docs/PHASE1_REPORT.md`](./docs/PHASE1_REPORT.md) para el detalle
completo del endurecimiento de FASE 1.

---

## PWA / Android

SambaPos_LBA es una **PWA instalable**. En Android, desktop y tablets
compatibles, el usuario puede "Agregar a pantalla de inicio" y obtener una
experiencia tipo aplicación nativa (sin barra de navegador, standalone,
orientación controlada).

La instalación requiere:
- `manifest.webmanifest` con `display: standalone` y `theme_color: #044392`.
- *Service Worker* registrado para el *offline shell*.
- Íconos 192/512 (y variantes `maskable` para Android).
- HTTPS en producción (requisito del navegador).

> **Android nativo (futuro):** cuando se requiera acceso a hardware que el
> navegador no controla (impresoras USB, escáneres, etc.), el plan es envolver
> la PWA con **Capacitor**, conservando la misma API y reglas de dominio. Sin
> duplicar lógica de negocio.

Ver [`docs/PWA.md`](./docs/PWA.md) para la guía de instalación y el estado
de implementación.

---

## Despliegue con Docker

El `Dockerfile` es **multi-stage** (builder con Python + make + g++ para
compilar `sqlite3` nativo; runtime slim con solo `libsqlite3-0`), corre
como usuario no-root, y expone un endpoint `/health` que verifica HTTP + DB.

```bash
# 1. Definir los secrets requeridos
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PIN=1234

# 2. Levantar
docker compose up -d --build

# 3. Verificar
curl http://localhost:3001/health

# 4. (Primer arranque) Sembrar la BD
docker compose exec samba-pos npm run seed

# 5. Detener
docker compose down        # detiene containers (conserva el volumen)
docker compose down -v     # detiene + borra el volumen (¡pierde la BD!)
```

El volumen `samba-data` persiste `/app/data/samba.db` entre reinicios.

---

## Roadmap

El proyecto sigue un plan de fases definido en el *prompt maestro*.
Estado actual:

| Fase | Estado | Descripción |
|------|:---:|-------------|
| FASE 0 | ✅ | Auditoría forense del repositorio original |
| FASE 1 | ✅ | Seguridad y limpieza (RBAC, Zod, gitleaks, CORS hardening) |
| FASE 2 | ✅ | Dominio: agregados, *idempotency keys*, *state machine* formal |
| FASE 3 | ✅ | WorkPeriod, CashSession, Customer, idempotency middleware |
| FASE 4 | 🚧 | Reorganización repositorio + identidad azul + PWA + mobile-first |
| FASE 5 | ⏳ | Recetas admin + costo/margen + integración inventario |
| FASE 6 | ⏳ | KDS: sonido, prioridad, filtros, reconexión automática |
| FASE 7 | ⏳ | Impresión: cola persistente, fallback printer, monitor |
| FASE 8 | ⏳ | WebSocket: reconnect con backoff + heartbeat + resync |
| FASE 9 | ⏳ | Web Push + Service Worker notifications |
| FASE 10 | ⏳ | PWA completa + install prompt + offline shell |
| FASE 11 | ⏳ | Offline + outbox + conflict policy |
| FASE 12 | ⏳ | PostgreSQL production target |
| FASE 13 | ⏳ | Caja: work period + cash session completo |
| FASE 14 | ⏳ | Reportes (ventas, productos, categorías, cajas, auditoría) |
| FASE 15 | ⏳ | Android (Capacitor wrapper) |
| FASE 16 | ⏳ | UI final azul + tablet first + touch first |
| FASE 17 | ⏳ | Testing final (visual, failure, security) |
| FASE 18 | ⏳ | Producción: backups, restore, observabilidad, deployment guide |

Ver [`docs/BASELINE_REPORT.md`](./docs/BASELINE_REPORT.md),
[`docs/PHASE1_REPORT.md`](./docs/PHASE1_REPORT.md),
[`docs/PHASE2_REPORT.md`](./docs/PHASE2_REPORT.md) y
[`docs/PHASE3_REPORT.md`](./docs/PHASE3_REPORT.md) para el detalle de cada fase.

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/BASELINE_REPORT.md`](./docs/BASELINE_REPORT.md) | Auditoría inicial del repo (FASE 0): estructura, stack, bugs, deuda técnica |
| [`docs/PHASE1_REPORT.md`](./docs/PHASE1_REPORT.md) | Endurecimiento de seguridad (FASE 1): CORS, RBAC, Zod, gitleaks |
| [`docs/PRODUCTION.md`](./docs/PRODUCTION.md) | Guía de despliegue en producción |
| [`docs/KITCHEN.md`](./docs/KITCHEN.md) | KDS: state machine, routing, void propagation |
| [`docs/INVENTORY.md`](./docs/INVENTORY.md) | Inventario y recetas, deducción transaccional |
| [`docs/PRINTING.md`](./docs/PRINTING.md) | Impresión ESC/POS: transporte TCP, retry, fallback |
| [`docs/RBAC.md`](./docs/RBAC.md) | Los 26 permisos y su mapeo a roles |
| [`docs/BACKUP.md`](./docs/BACKUP.md) | Estrategia de backup/restore |
| [`docs/OFFLINE.md`](./docs/OFFLINE.md) | Modo offline y resync |

---

## Contribuir

¡Las contribuciones son bienvenidas! Por favor leé
[`CONTRIBUTING.md`](./CONTRIBUTING.md) antes de abrir un PR.

En resumen:

1. Haz *fork* del repositorio.
2. Crea una rama (`feat/...`, `fix/...`, `phase-N/...`).
3. Asegúrate de que `bash scripts/run-all-tests.sh` pase y que `npm audit`
   reporte 0 vulnerabilidades.
4. Usa **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`,
   `refactor:`, `security:`).
5. Abre un PR contra `main`.

Por favor respeta el [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Licencia

Este proyecto está licenciado bajo la licencia **MIT**. Ver el archivo
[`LICENSE`](./LICENSE) para el texto completo.

---

## Créditos

**SambaPOS V3** por [emreeren](https://github.com/emreeren/SambaPOS-3) —
el código fuente original (WPF/C#) se usó como referencia funcional para
derivar las reglas de negocio, el esquema de base de datos y el modelo de
dominio.

> **Aclaración importante:** SambaPos_LBA **no es un fork** del código WPF.
> Es una reimplementación web independiente escrita desde cero en
> Node.js + Vanilla JS. No comparte código fuente con el original; sólo
> replica su comportamiento funcional. El nombre "SambaPOS" pertenece a sus
   autores; este proyecto lo usa únicamente con fines de atribución.

---

## Estado del proyecto

**En desarrollo activo.**

- ✅ **FASE 0** — Auditoría forense (completa)
- ✅ **FASE 1** — Seguridad y limpieza (completa, 0 vulns, 0 leaks)
- ✅ **FASE 2** — Dominio: agregados + state machine formal (completa, 237/237 tests)
- ✅ **FASE 3** — WorkPeriod, CashSession, Customer, idempotency middleware (completa)
- 🚧 **FASE 4** — Reorganización repositorio + identidad azul + PWA + mobile-first (en progreso)

Última actualización: 2026-09-07 ·
[v0.4.0](./CHANGELOG.md#v040)
