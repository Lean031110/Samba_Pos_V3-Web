<div align="center">

<img src="docs/screenshots/01-login.png" alt="SambaPos_LBA" width="600">

# 🍽️ SambaPos_LBA

### Sistema POS web moderno, táctil, instalable y offline-capable para restaurantes

Construido con **Node.js · Express · Knex · Socket.io · Vanilla JS**

[![CI](https://img.shields.io/github/actions/workflow/status/Lean031110/Samba_Pos_V3-Web/ci.yml?branch=main&label=CI&style=for-the-badge)](https://github.com/Lean031110/Samba_Pos_V3-Web/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-528%2F528-brightgreen?style=for-the-badge)](#-pruebas)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-green?style=for-the-badge)](https://nodejs.org/)
[![PWA](https://img.shields.io/badge/PWA-installable-blue?style=for-the-badge)](#-pwa--android)
[![Security](https://img.shields.io/badge/vulnerabilities-0-brightgreen?style=for-the-badge)](#-seguridad)
[![Version](https://img.shields.io/badge/version-0.4.0-blue?style=for-the-badge)](./CHANGELOG.md)

</div>

---

## ✨ Características

| Categoría | Descripción |
|-----------|-------------|
| 🛒 **POS completo** | Tickets, órdenes, pagos, descuentos, regalos, voids, refunds, splits y merges |
| 📱 **Mobile-first** | Diseñado para tablets Android (7"–10"+), pantallas táctiles, portrait y landscape |
| 🍳 **KDS multi-estación** | Routing por estación, state machine de órdenes, propagación de voids en tiempo real |
| 📦 **Inventario + recetas** | Deducción transaccional al cerrar ticket, costo de receta, margen y precio sugerido |
| 🖨️ **Impresión ESC/POS real** | Transporte TCP, retry exponencial, fallback, cola persistente con idempotency keys |
| 🔄 **WebSocket tiempo real** | Auth JWT, rooms por rol, reconnect con exponential backoff + heartbeat + resync |
| 🔒 **RBAC granular** | 27 permisos discretos + audit log en acciones sensibles |
| 📡 **Push notifications** | Web Push real con VAPID, subscribe/unsubscribe, polling fallback |
| 🔌 **Offline tolerant** | IndexedDB outbox con orden garantizado (ticket→orders→payment→close), JWT expiry detection |
| 💰 **Caja (Cash sessions)** | Apertura/cierre de caja, work periods, payout tracking |
| 📊 **Reportes** | Ventas, productos top, tickets cerrados/anulados/reembolsados, selector por fechas |
| 🏗️ **PWA instalable** | manifest.webmanifest, service worker, offline shell, install prompt visible |
| 📋 **Templates editables** | CRUD completo de plantillas de recibo/cocina con preview ESC/POS |
| 🗄️ **PostgreSQL ready** | Soporte dual SQLite/PostgreSQL en migraciones (information_schema fallback) |
| 📱 **Android (Capacitor)** | capacitor.config.json + guía APK/AAB para Play Store |

---

## 📸 Capturas de pantalla

<table>
<tr>
<td align="center"><b>Login</b></td>
<td align="center"><b>Dashboard (mapa de mesas)</b></td>
</tr>
<tr>
<td><img src="docs/screenshots/01-login.png" alt="Login" width="400"></td>
<td><img src="docs/screenshots/02-dashboard.png" alt="Dashboard" width="400"></td>
</tr>
<tr>
<td align="center"><b>POS con productos</b></td>
<td align="center"><b>Kitchen Display System</b></td>
</tr>
<tr>
<td><img src="docs/screenshots/04-pos-with-products.png" alt="POS" width="400"></td>
<td><img src="docs/screenshots/10-kds.png" alt="KDS" width="400"></td>
</tr>
<tr>
<td align="center"><b>Pago con numpad</b></td>
<td align="center"><b>WebSocket + Offline indicator</b></td>
</tr>
<tr>
<td><img src="docs/screenshots/08-payment.png" alt="Pago" width="400"></td>
<td><img src="docs/screenshots/16-websocket-status.png" alt="WebSocket" width="400"></td>
</tr>
</table>

---

## 📑 Tabla de contenidos

- [Características](#-características)
- [Stack tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Instalación rápida](#-instalación-rápida)
- [Variables de entorno](#-variables-de-entorno)
- [Scripts disponibles](#-scripts-disponibles)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Pruebas](#-pruebas)
- [Seguridad](#-seguridad)
- [PWA / Android](#-pwa--android)
- [Docker](#-despliegue-con-docker)
- [PostgreSQL](#-postgresql-production)
- [Backup y restore](#-backup-y-restore)
- [Roadmap](#-roadmap)
- [Documentación](#-documentación)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)
- [Créditos](#-créditos)

---

## 🛠️ Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Backend** | Node.js + Express + Helmet + express-rate-limit | Node 20+, Express 5 |
| **Frontend** | Vanilla JS + Web Components (sin framework) | — |
| **Base de datos** | SQLite (WAL) o PostgreSQL | SQLite 3.44+ / PG 14+ |
| **ORM** | Knex 3 (migraciones + query builder) | 3.x |
| **WebSocket** | Socket.io (multi-terminal sync) | 4.x |
| **Push** | web-push (VAPID + AES128GCM) | 3.x |
| **Validación** | Zod (schemas strict) | 4.x |
| **Moneda** | decimal.js (paridad byte-a-byte con C# original) | 10.x |
| **Tests** | `node --test` (unit) + Playwright (E2E) | 1.63 |
| **DevOps** | Docker multi-stage + GitHub Actions + gitleaks | — |

---

## 🏛️ Arquitectura

Arquitectura **DDD-lite en capas**: el dominio no tiene dependencias (puro), la infraestructura lo persiste, la capa de aplicación lo orquesta, y la API REST lo expone. El `eventBus` (pub/sub interno) reproduce el patrón `EventAggregator` de PRISM usado en el WPF original, y un puente de Socket.io lo publica a los clientes conectados por rol.

```mermaid
flowchart TD
    subgraph Client["🌐 Frontend (Navegador / PWA / Android)"]
        UI["Vanilla JS + Web Components<br/>Store Observable · OfflineQueue · PWA"]
    end

    subgraph Server["🖥️ Servidor Express"]
        API["API REST<br/>auth · tickets · products · tables<br/>kitchen · inventory · printers · combos<br/>push · cash · reports · admin"]
        MW["Middleware<br/>helmet · cors · rate-limit · JWT<br/>rbac · auditLog · Zod · idempotency"]
        APP["Application Services<br/>TicketService · KitchenService<br/>InventoryService · ComboService<br/>PrinterManager · pushService"]
        EB["eventBus (pub/sub)"]
        WS["Socket.io bridge<br/>rooms por rol + resync"]
        PW["PrintWorker (background)"]
    end

    subgraph Domain["📋 Dominio (puro, sin deps)"]
        DOM["Ticket · OrderBuilder · CalculationEngine<br/>TicketStateMachine · AccountTransaction<br/>CashSession · WorkPeriod · PrintJob"]
    end

    subgraph Infra["💾 Infraestructura"]
        KNEX["Knex 3"]
        DB[("SQLite / PostgreSQL")]
    end

    UI <-->|"HTTP + JWT"| API
    UI <-->|"WebSocket + JWT"| WS
    API --> MW --> APP
    APP --> EB --> WS
    APP --> DOM
    APP --> KNEX --> DB
    PW --> DB
```

**Decisiones de diseño clave:**

1. **`CalculationEngine` es el único punto de entrada a `decimal.js`** — garantiza paridad monetaria *byte-a-byte* con el C# original
2. **Ledger de doble entrada** — cada operación monetaria crea un `AccountTransaction` dentro del `AccountTransactionDocument` del ticket
3. **Auto-reversal** — `AccountTransaction.UpdateAmount(-amount)` intercambia Source ↔ Target automáticamente
4. **Idempotency protection** — payment, close, void, refund usan `X-Idempotency-Key` header para deduplicar
5. **Offline sync ordenado** — `_getPriority()` asegura ticket→orders→payment→close, detección de JWT expirado con pausa + notificación

---

## 🚀 Instalación rápida

```bash
# 1. Clonar
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web/backend

# 2. Instalar dependencias
npm ci

# 3. Configurar entorno
cp ../.env.example ../.env
# Editar .env:
#   JWT_SECRET=$(openssl rand -hex 32)
#   ADMIN_PIN=1234
#   CORS_ORIGIN=http://localhost:3001

# 4. Migraciones + seed
npm run migrate
npm run seed

# 5. ¡Listo!
npm start
```

| URL | Servicio |
|-----|----------|
| `http://localhost:3001/` | Frontend SPA |
| `http://localhost:3001/api` | API REST |
| `ws://localhost:3001` | WebSocket |
| `http://localhost:3001/health` | Healthcheck |
| `http://localhost:3001/ready` | Readiness (DB + WebSocket) |
| `http://localhost:3001/version` | Info de versión |

**Login admin:** usuario `Administrator`, PIN = `ADMIN_PIN` (default: `1234`)

---

## 🔧 Variables de entorno

| Variable | Requerido | Default | Descripción |
|----------|:---------:|---------|-------------|
| `NODE_ENV` | no | `development` | `development` / `production` / `test` |
| `PORT` | no | `3001` | Puerto HTTP + WebSocket |
| `JWT_SECRET` | **sí** | — | Secret para JWT (mín. 32 chars). Genera con `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | no | `8h` | Expiración del token |
| `CORS_ORIGIN` | **prod** | `*` (dev only) | Orígenes permitidos. **`*` es rechazado en producción** |
| `SAMBA_DB_PATH` | no | `data/samba.db` | Ruta SQLite (ignorado si `DATABASE_URL` es postgres) |
| `DATABASE_URL` | no | — | `postgres://user:pass@host:5432/db` para usar PostgreSQL |
| `ADMIN_PIN` | **seed** | `1234` | PIN del admin inicial (solo `npm run seed`, hasheado con bcrypt) |
| `BACKUP_RETENTION` | no | `30` | Número máximo de backups a conservar |
| `VAPID_SUBJECT` | no | `mailto:admin@...` | VAPID subject para Web Push |
| `VAPID_PUBLIC_KEY` | no | auto-gen | VAPID public key (auto-generada si no se setea) |
| `VAPID_PRIVATE_KEY` | no | auto-gen | VAPID private key |

> ⚠️ **Nunca confirmes `.env` en git.** Está en `.gitignore` y el CI ejecuta gitleaks en cada push.

---

## 📜 Scripts disponibles

Ejecutar desde `backend/`:

| Script | Descripción |
|--------|-------------|
| `npm start` | Inicia servidor Express + Socket.io + PrintWorker |
| `npm run dev` | Modo watch (auto-restart) |
| `npm run migrate` | Aplica migraciones Knex pendientes |
| `npm run seed` | Seed transaccional (admin + datos demo) |
| `npm test` | Tests de integración API |
| `npm run test:unit` | Todos los tests unitarios (528 tests) |
| `npm run test:all` | Suite completa: unit + E2E (via `run-all-tests.sh`) |
| `npm run test:e2e` | E2E con Playwright + Chromium |
| `npm run backup` | Crea snapshot de BD con integrity check + rotation |
| `npm run restore` | Restaura desde backup (`--file=<path> --confirm`) |
| `node scripts/restore-drill.js` | Drill completo: backup → destroy → restore → verify |
| `node scripts/load-test.js` | Stress test con usuarios concurrentes |

---

## 📁 Estructura del proyecto

```
Samba_Pos_V3-Web/
├── capacitor.config.json        # Android (Capacitor) config
├── Dockerfile                   # Multi-stage (Node slim + sqlite3 native)
├── docker-compose.yml           # Servicio + volumen + healthcheck
│
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── server.js        # Express app + Socket.io + PrintWorker
│   │   │   ├── routes/          # 13 route files (auth, tickets, kitchen, inventory,
│   │   │   │                    #   printers, combos, push, cash, reports, admin, etc.)
│   │   │   ├── services/        # TicketService, KitchenService, InventoryService,
│   │   │   │                    #   ComboService, PrinterManager, MockTcpServer, pushService
│   │   │   └── middleware/      # auth (JWT+bcrypt), rbac (27 perms), idempotency,
│   │   │                        #   auditLog, schemas (Zod), logger, errorHandler
│   │   ├── application/
│   │   │   └── eventBus.js      # Pub/sub (emula PRISM EventAggregator)
│   │   ├── domain/              # Puro, sin dependencias
│   │   │   ├── Ticket.js · TicketStateMachine.js · OrderBuilder.js
│   │   │   ├── CalculationEngine.js (decimal.js) · TicketRecalculator.js
│   │   │   ├── AccountTransaction.js · AccountTransactionDocument.js
│   │   │   ├── CashSession.js · WorkPeriod.js · Customer.js
│   │   │   ├── PrintJob.js · Notification.js
│   │   └── infrastructure/
│   │       ├── db/               # Knex config, migraciones (13), seeds
│   │       └── repositories/    # TicketRepository, ProductRepository, TableRepository
│   ├── scripts/                 # backup, restore, restore-drill, load-test, run-all-tests
│   └── tests/                   # 528 unit tests + E2E (Playwright)
│
├── frontend/
│   ├── index.html               # SPA shell
│   ├── manifest.webmanifest     # PWA manifest (standalone, azul)
│   ├── sw.js                    # Service Worker (offline shell + update)
│   ├── css/                     # variables (azul), reset, layout, components, mobile
│   ├── js/
│   │   ├── app.js               # Navigation + offline auth-expired handling
│   │   ├── views/               # login, dashboard, pos, payment, kitchen, admin
│   │   ├── services/            # api.js (offline integration), pwa.js, push.js
│   │   └── store/               # store.js, websocket-client.js, offlineQueue.js
│   └── vendor/                  # Font Awesome 6 + socket.io client
│
├── docs/                        # 20+ documentos de módulo + reportes de bloque
├── analysis/                    # Auditoría forense del SambaPOS V3 original
└── data/                        # SQLite db + backups (gitignored)
```

---

## 🧪 Pruebas

El proyecto mantiene **528 tests unitarios + E2E** distribuidos en 20 suites:

| Suite | Tests | Categoría |
|-------|------:|-----------|
| `api-integration` | 47 | API REST + tickets + pagos + cierre + void |
| `kds-verification` | 49 | KDS states, routing, bump, serve, recall |
| `inventory-verification` | 13 | Stock deduction, reversal, low stock alerts |
| `concurrency-verification` | 8 | Concurrencia de pagos |
| `idempotency-verification` | 7 | Idempotency keys en payment/close/void |
| `idempotency-concurrency` | 7 | Concurrencia real con mismas keys |
| `domain-verification` | 72 | State machine, cálculos, ledger doble entrada |
| `security-verification` | 21 | CORS hardening, auth bypass, fuzzing |
| `printing-verification` | 24 | PrintQueue, PrintRouter, EscPosRenderer |
| `recipes-verification` | 25 | RecipeService, costos, márgenes |
| `refund-verification` | 6 | Refund idempotente, IsRefunded |
| `unit-conversion-verification` | 14 | Conversión kg↔gr, L↔ml |
| `domain-extended` | 12 | moveOrders, reopenTicket, addChangePayment |
| `bloque-d-verification` | 34 | Traspasos, inventario físico, kardex, recetas versionadas, combos |
| `bloque-e-kds` | 14 | Event payloads backend, reimpresión KDS, state machine API |
| `bloque-f-printer` | 19 | MockTcpServer, pipeline completo, templates CRUD, preview |
| `bloque-g-pwa` | 31 | Manifest, SW, install prompt, admin card |
| `bloque-h-push` | 33 | VAPID, subscribe/unsubscribe, send, expire, polling, admin endpoints |
| `bloque-i-offline` | 25 | Idempotency, operation order, JWT expiration, frontend analysis |
| `bloque-j-production` | 34 | PostgreSQL driver, migraciones compatibles, backup rotation, restore drill |
| `bloque-klm` | 33 | Capacitor config, UI caja/reportes, load test, failure injection |
| **Total unit** | **528** | **100% pass** |
| E2E (Playwright) | 27+ | Login→POS→Kitchen→WebSocket + Bloque E/F/G/H E2E |

```bash
# Correr toda la suite
bash scripts/run-all-tests.sh

# Solo unit
npm run test:unit

# Solo E2E
npm run test:e2e
```

---

## 🔒 Seguridad

Postura de seguridad **fail-secure**:

| Medida | Implementación |
|--------|---------------|
| **JWT obligatorio** | No hay defaults para `JWT_SECRET`. Aborta si falta o es < 32 chars |
| **bcrypt para PINs** | PINs nunca en texto plano; seed los hashea antes de insertar |
| **Rate limiting** | 5 intentos cada 15 min por IP en login (429) |
| **Helmet CSP** | `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options: DENY` |
| **CORS estricto** | `*` es rechazado en producción — `process.exit(1)` antes de abrir socket |
| **RBAC granular** | 27 permisos discretos aplicados via `requirePermission()` |
| **Audit log** | Acciones sensibles registran usuario, IP, payload y timestamp |
| **Zod validation** | Schemas strict que rechazan claves desconocidas |
| **Idempotency** | Payment, close, void, refund usan `X-Idempotency-Key` |
| **gitleaks + npm audit** | CI gate antes de tests — 0 vulns, 0 leaks |

> **Estado actual:** 0 vulnerabilidades (`npm audit`), 0 leaks (`gitleaks`)

---

## 📱 PWA / Android

SambaPos_LBA es una **PWA instalable** con soporte Android nativo via Capacitor:

### PWA (instalación desde navegador)

- `manifest.webmanifest` con `display: standalone` y `theme_color: #044392`
- Service Worker con offline shell + update banner
- Íconos 192/512 + maskable para Android
- **Botón "Instalar app" visible** en Admin → Configuración → Aplicación (PWA)
- Detección de modo standalone (ya instalada)

### Android nativo (Capacitor)

```bash
# Configurado con capacitor.config.json
# Ver docs/ANDROID.md para guía completa de build APK/AAB
cd backend
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap copy
npx cap open android  # Abre Android Studio
```

---

## 🐳 Despliegue con Docker

```bash
# 1. Secrets
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PIN=1234

# 2. Levantar
docker compose up -d --build

# 3. Verificar
curl http://localhost:3001/health

# 4. Seed (primer arranque)
docker compose exec samba-pos npm run seed
```

El `Dockerfile` es **multi-stage** (builder con Python + make + g++ para compilar `sqlite3` nativo; runtime slim con `libsqlite3-0`), corre como usuario no-root, y expone `/health` que verifica HTTP + DB.

El volumen `samba-data` persiste `/app/data/samba.db` entre reinicios.

---

## 🗄️ PostgreSQL (Production)

Para despliegue multi-terminal con PostgreSQL:

```bash
# 1. Crear base de datos
psql -U postgres -c "CREATE DATABASE sambapos_lba;"

# 2. Configurar .env
echo 'DATABASE_URL=postgres://user:pass@localhost:5432/sambapos_lba' >> .env

# 3. Instalar driver
npm install pg

# 4. Migrar + seed
npm run migrate
npm run seed
```

El `knexfile.js` detecta automáticamente si `DATABASE_URL` empieza con `postgres://` y usa el driver `pg`. Las migraciones usan `information_schema` (PostgreSQL) o `PRAGMA` (SQLite) según corresponda.

---

## 💾 Backup y restore

```bash
# Crear backup (con integrity check + rotation automática)
npm run backup

# Restaurar (requiere --confirm por seguridad)
npm run restore -- --file=data/backups/samba-backup-2024-09-08T12-00-00.db --confirm

# Restore drill completo (backup → destroy → restore → verify 13 tablas + users)
node scripts/restore-drill.js

# Configurar retención (default: 30 backups)
export BACKUP_RETENTION=60
```

### Cron job para backups automáticos

```bash
# Backup diario a las 2 AM
0 2 * * * cd /path/to/Samba_Pos_V3-Web/backend && npm run backup >> /var/log/sambapos-backup.log 2>&1
```

Ver [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) para la guía completa de instalación.

---

## 🗺️ Roadmap

| Fase | Estado | Descripción |
|------|:------:|-------------|
| 0 — Auditoría forense | ✅ | Análisis completo del SambaPOS V3 original |
| 1 — Seguridad | ✅ | RBAC, Zod, gitleaks, CORS hardening, rate-limit |
| 2 — Dominio | ✅ | Agregados, state machine, idempotency, ledger doble entrada |
| 3 — Administración | ✅ | WorkPeriod, CashSession, Customer, admin CRUD completo |
| 4 — Inventario + recetas | ✅ | Traspasos, inventario físico, kardex, recetas versionadas, combos |
| 5 — Cocina/KDS | ✅ | Tiempo real POS→KDS, reimpresión, void propagation |
| 6 — Printer Gateway | ✅ | MockTcpServer, template editor, ESC/POS preview |
| 7 — PWA | ✅ | Install prompt visible, manifest, SW, offline shell |
| 8 — Push notifications | ✅ | VAPID, subscribe/unsubscribe, admin send, test push |
| 9 — Offline/Sync | ✅ | Orden garantizado, JWT expiry detection, resume after re-login |
| 10 — PostgreSQL + producción | ✅ | Driver pg, migraciones compatibles, backup rotation, restore drill |
| 11 — Android | ✅ | Capacitor config + guía APK/AAB |
| 12 — UI final | ✅ | Caja (apertura/cierre) + Reportes (selector fechas + stats) |
| 13 — Release hardening | ✅ | Load test, failure injection, security audits |

**Todas las 13 fases completas.** 528 tests unitarios, 0 vulnerabilidades, 0 leaks.

---

## 📚 Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Guía completa de instalación (SQLite + PostgreSQL + Docker + PM2) |
| [`docs/ANDROID.md`](./docs/ANDROID.md) | Build APK/AAB con Capacitor |
| [`docs/BLOQUE_D_REPORT.md`](./docs/BLOQUE_D_REPORT.md) | Inventario: traspasos, kardex, recetas versionadas, combos |
| [`docs/BLOQUE_E_REPORT.md`](./docs/BLOQUE_E_REPORT.md) | KDS tiempo real + reimpresión |
| [`docs/BLOQUE_F_REPORT.md`](./docs/BLOQUE_F_REPORT.md) | Printer Gateway: MockTcpServer, templates, preview |
| [`docs/BLOQUE_G_REPORT.md`](./docs/BLOQUE_G_REPORT.md) | PWA: install prompt visible |
| [`docs/BLOQUE_H_REPORT.md`](./docs/BLOQUE_H_REPORT.md) | Push: UX activación + tests + E2E gate |
| [`docs/BLOQUE_I_REPORT.md`](./docs/BLOQUE_I_REPORT.md) | Offline/Sync: orden + JWT + tests |
| [`docs/BLOQUE_J_REPORT.md`](./docs/BLOQUE_J_REPORT.md) | PostgreSQL + producción |
| [`docs/KITCHEN.md`](./docs/KITCHEN.md) | KDS: state machine, routing, void propagation |
| [`docs/INVENTORY.md`](./docs/INVENTORY.md) | Inventario y recetas, deducción transaccional |
| [`docs/PRINTING.md`](./docs/PRINTING.md) | Impresión ESC/POS: transporte TCP, retry, fallback |
| [`docs/RBAC.md`](./docs/RBAC.md) | Los 27 permisos y su mapeo a roles |
| [`docs/BACKUP.md`](./docs/BACKUP.md) | Estrategia de backup/restore |
| [`docs/OFFLINE.md`](./docs/OFFLINE.md) | Modo offline y resync |
| [`docs/PWA.md`](./docs/PWA.md) | PWA: manifest, SW, install |
| [`docs/PRODUCTION_GAP_MATRIX.md`](./docs/PRODUCTION_GAP_MATRIX.md) | Matriz completa de gaps cerrados |

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor leé [`CONTRIBUTING.md`](./CONTRIBUTING.md) antes de abrir un PR.

1. Haz *fork* del repositorio
2. Crea una rama (`feat/...`, `fix/...`, `bloque-x/...`)
3. Asegúrate de que `bash scripts/run-all-tests.sh` pase (528/528)
4. Usa **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
5. Abre un PR contra `main`

Por favor respeta el [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 📄 Licencia

Este proyecto está licenciado bajo la licencia **MIT**. Ver [`LICENSE`](./LICENSE) para el texto completo.

---

## 🙏 Créditos

**SambaPOS V3** por [emreeren](https://github.com/emreeren/SambaPOS-3) — el código fuente original (WPF/C#) se usó como referencia funcional para derivar las reglas de negocio, el esquema de base de datos y el modelo de dominio.

> **Aclaración importante:** SambaPos_LBA **no es un fork** del código WPF. Es una reimplementación web independiente escrita desde cero en Node.js + Vanilla JS. No comparte código fuente con el original; sólo replica su comportamiento funcional. El nombre "SambaPOS" pertenece a sus autores; este proyecto lo usa únicamente con fines de atribución.

---

<div align="center">

**[⬆ Volver arriba](#️-sambapos_lba)**

Hecho con ❤️ para la comunidad de restaurantes

</div>
