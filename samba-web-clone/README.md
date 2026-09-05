# SambaPOS V3 — Web Clone

Réplica web fiel (pixel-perfect + logic-perfect) de **SambaPOS V3** (https://github.com/josephwambura/SambaPOS-3), migrando la aplicación WPF original a una arquitectura moderna Node.js + Vanilla JS + Web Components.

> Estado del proyecto: **Sprint 5 completado** (JWT auth + flujos avanzados + Playwright + Docker)

---

## 📋 Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Análisis forense (Fase 0)](#análisis-forense-fase-0)
- [Sprints completados](#sprints-completados)
- [API REST](#api-rest)
- [Testing](#testing)
- [Licencia](#licencia)

---

## 🏗 Arquitectura

El proyecto replica la **arquitectura en capas DDD-lite** del original:

```
┌──────────────────────────────────────────────────────────┐
│ FRONTEND (Sprint 4) — Vanilla JS + Web Components         │
│   - PosView, TicketView, PaymentEditor, TableMap          │
│   - Store Singleton Observable (emula PRISM EventAggregator)│
└──────────────────────────────────────────────────────────┘
                            ↕ HTTP + WebSocket
┌──────────────────────────────────────────────────────────┐
│ API LAYER (Sprint 3) — Express + Socket.io                │
│   - /api/tickets, /api/products, /api/tables              │
│   - Middleware: logging, errores 400/404/409, validación  │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ APPLICATION SERVICES — Coordina el dominio                │
│   - TicketService, PaymentEditor, CacheService            │
│   - eventBus (PubSub emulando EventAggregator)            │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ DOMAIN (pure POCO, no deps) — Samba.Domain                │
│   - Ticket, Order, Calculation, TaxValue                  │
│   - AccountTransaction (doble entrada + auto-reversal)    │
│   - TicketBuilder, OrderBuilder (fluent)                  │
│   - CalculationEngine (único punto de entrada a decimal.js)│
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE — Knex + SQLite                            │
│   - Migraciones (96 tablas + índices compuestos)          │
│   - Repositorios (TicketRepository, ProductRepository,    │
│     TableRepository)                                      │
│   - Seed transaccional (admin/1234, 19 reglas, etc.)      │
└──────────────────────────────────────────────────────────┘
                            ↓
                    📦 data/samba.db (SQLite, WAL mode)
```

### Decisiones críticas preservadas del original

1. **Doble modo de redondeo**: El C# original mezcla `MidpointRounding.ToEven` (banker's) y `MidpointRounding.AwayFromZero` (schoolbook) en distintos code paths. El web clone preserva esta inconsistencia vía `decimal.js` para mantener paridad monetaria byte-a-byte.
2. **Ledger de doble entrada**: Cada operación monetaria (venta, impuesto, descuento, pago, cambio, reembolso) crea o actualiza un `AccountTransaction` dentro del `TransactionDocument` del ticket.
3. **Auto-reversal**: `AccountTransaction.UpdateAmount(-amount)` intercambia Source ↔ Target automáticamente cuando el monto es negativo (para reembolsos).
4. **JSON short DataMember names**: `Ticket.TicketTags`, `Order.Taxes`, `Order.OrderStates` se persisten como JSON strings (igual que en el original SQL CE).

---

## 🛠 Stack tecnológico

| Capa | Tecnología | Versión | Justificación |
|------|-----------|---------|---------------|
| Backend | Node.js + Express | Express 4.x | Estándar minimalista para REST APIs |
| DB Driver | sqlite3 (async) | 3.44.x | No bloquea el event loop en desarrollo |
| ORM/QueryBuilder | Knex.js | 3.3.x | Migraciones + query builder fluido |
| DB | SQLite | 3.44.x | Réplica de la ligereza del `.sdf` original |
| Decimals | decimal.js | 10.4.x | Único con soporte explícito para `ROUND_HALF_EVEN` y `ROUND_HALF_UP` |
| WebSocket | Socket.io | 4.x | Multi-terminal sync (reemplaza TCP messaging server) |
| Testing | supertest + node:assert | latest | Tests de integración HTTP |
| Frontend | Vanilla JS + Web Components | — | Control total del DOM táctil (Sprint 4) |

**PRAGMAs SQLite obligatorios** (aplicados en cada conexión):
```sql
PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;  -- dentro de transacciones
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

---

## 📁 Estructura de carpetas

```
/samba-web-clone/
├── analysis/                          # Fase 0 — Análisis forense
│   ├── FULL_ARCHITECTURE_REPORT.md    # 30+ proyectos C#, grafo de dependencias
│   ├── DATABASE_SCHEMA_EXACT.sql      # 96 tablas + ER Mermaid + seed
│   ├── UI_SPECS_FOR_WEB.md            # Paleta, tipografía, layouts XAML
│   ├── BUSINESS_RULES_ENGINE.md       # Pseudocódigo 1:1 de los calculadores
│   └── DDL_EXAMPLES_SPRINT1.sql       # 3 ejemplos (Tickets, Orders, Payments)
│
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── api/                       # Sprint 3 — Express routes + middleware
│   │   │   ├── server.js
│   │   │   ├── routes/
│   │   │   │   ├── tickets.js
│   │   │   │   ├── products.js
│   │   │   │   └── tables.js
│   │   │   └── middleware/
│   │   │       ├── errorHandler.js
│   │   │       └── logger.js
│   │   ├── application/
│   │   │   ├── eventBus.js            # PubSub (emula PRISM EventAggregator)
│   │   │   └── services/              # Sprint 3 — Application services
│   │   ├── domain/                    # Sprint 2 — Pure domain (no deps)
│   │   │   ├── CalculationEngine.js   # Único punto de entrada a decimal.js
│   │   │   ├── Ticket.js              # Entidad + addOrder/addPayment/etc.
│   │   │   ├── TicketRecalculator.js  # Ticket.Recalculate() completo
│   │   │   ├── AccountTransaction.js  # Doble entrada + auto-reversal
│   │   │   ├── AccountTransactionDocument.js
│   │   │   ├── TicketBuilder.js       # Fluent API
│   │   │   └── OrderBuilder.js
│   │   └── infrastructure/
│   │       ├── db/
│   │       │   ├── knexfile.js        # PRAGMAs + pool config
│   │       │   ├── db.js              # Singleton + withTransaction()
│   │       │   ├── migrations/        # 96 tablas en 1 migración topológica
│   │       │   └── seeds/             # Seed transaccional completo
│   │       └── repositories/
│   │           ├── TicketRepository.js
│   │           ├── ProductRepository.js
│   │           └── TableRepository.js
│   ├── scripts/
│   │   ├── insert-ticket-demo.js      # Sprint 1 acceptance test
│   │   └── sprint2-acceptance-test.js # Sprint 2 acceptance test (5 escenarios)
│   └── tests/
│       └── api-integration.test.js    # Sprint 3 — supertest
│
├── docs/                              # Guías futuras (Sprint 5)
├── data/                              # SQLite db (NO se commitea)
└── .gitignore
```

---

## 🚀 Instalación y ejecución

### Prerrequisitos
- Node.js 18+ (probado con Node 24)
- npm 8+

### Setup

```bash
# 1. Clonar el repositorio
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web/backend

# 2. Instalar dependencias
npm install

# 3. Ejecutar migraciones (crea data/samba.db con las 96 tablas)
npm run migrate

# 4. Ejecutar seed (admin/1234, 19 reglas, 4 payment types, etc.)
npm run seed

# 5. (Opcional) Ejecutar tests de aceptación de Sprint 1 y 2
node scripts/insert-ticket-demo.js
node scripts/sprint2-acceptance-test.js

# 6. (Sprint 3+4) Iniciar el servidor API + frontend (sirve ambos en el mismo puerto)
npm start
# → API escuchando en http://localhost:3001/api
# → Frontend escuchando en http://localhost:3001/
# → WebSocket escuchando en ws://localhost:3001

# 7. (Sprint 3) Ejecutar tests de integración HTTP (supertest)
npm test

# 8. (Sprint 4) Ejecutar test E2E del flujo completo (requiere server corriendo)
npm run test:e2e
```

### Scripts npm disponibles

```bash
npm run migrate       # Ejecuta migraciones Knex
npm run seed          # Ejecuta seed transaccional
npm start             # Inicia Express + Socket.io server
npm test              # Tests de integración con supertest
npm run test:ticket   # Sprint 1 acceptance test
npm run test:sprint2  # Sprint 2 acceptance test (5 escenarios)
```

---

## 🔍 Análisis forense (Fase 0)

Los 4 entregables de la Fase 0 están en `/analysis/`:

| Documento | Líneas | Contenido |
|-----------|--------|-----------|
| `FULL_ARCHITECTURE_REPORT.md` | 360 | 30+ proyectos C# descompuestos, grafo Mermaid de dependencias, mapeo carpeta-origen → destino-web |
| `DATABASE_SCHEMA_EXACT.sql` | 1543 | 96 tablas CREATE TABLE + índices + ER Mermaid + historia 24 migraciones FluentMigrator + seed completo |
| `UI_SPECS_FOR_WEB.md` | 703 | Paleta completa (50+ colores), tipografía, layout por pantalla, mapeo MaterialDesignIcons → FA6 Free |
| `BUSINESS_RULES_ENGINE.md` | 1991 | Pseudocódigo 1:1 de `calculateTicketTotals`, `applyDiscount`, `applyTax`, `processPayment`, `splitTicket`, `voidTicketItem`, `closeTicket` + motor ESC/POS + tests de humo |

---

## ✅ Sprints completados

### Sprint 1 — Capa de Datos y Repositorios ✅
- 96 tablas creadas con Knex migration (topológicamente ordenadas)
- PK simple `INTEGER PRIMARY KEY AUTOINCREMENT` + `UNIQUE(Id, ParentId)` (criterio del Arquitecto)
- PRAGMAs SQLite: `foreign_keys=ON`, `defer_foreign_keys=ON` en cada transacción, WAL mode, busy_timeout 5000ms
- 3 repositorios: `TicketRepository`, `ProductRepository`, `TableRepository`
- Seed transaccional completo: 1 admin/1234, 5 AccountTypes, 7 Accounts, 7 AccountTransactionTypes, 2 Numerators, 2 CalculationTypes, 4 PaymentTypes, 3 Printers, 3 PrinterTemplates, 19 AppRules, 13 AppActions, 9 AutomationCommands
- **Acceptance test**: ticket con 2 productos, cálculos byte-identical al C# original, modos de redondeo preservados

### Sprint 2 — Motor de Reglas de Negocio ✅
- `AccountTransaction` + `AccountTransactionValue`: doble entrada con auto-reversal en montos negativos
- `AccountTransactionDocument`: `addNewTransaction`, `addSingletonTransaction` (idempotente), `updateSingletonTransactionAmount`
- `TicketRecalculator`: sincroniza AccountTransactions con totales (venta + impuestos + descuentos)
- `Ticket` entidad con métodos mutadores: `addOrder`, `addPayment`, `addChangePayment`, `addCalculation`, `removeOrder`, `lockTicket`, `close`
- `TicketBuilder` + `OrderBuilder`: fluent API para tests
- `CalculationEngine` es el **único punto de entrada** a decimal.js (ningún otro módulo toca la librería directamente)
- Cada mutación dispara recálculo + publica evento en eventBus (`TicketTotalChanged`, `OrderAdded`, `PaymentProcessed`)
- **Acceptance test**: 5 escenarios (4 cálculo + 1 auto-reversal), 35 assertions, ledger balanceado en todos

### Sprint 3 — APIs RESTful + WebSockets ✅
- Express server con middleware (logging, errores 400/404/409, validación)
- 14 endpoints REST: `/api/tickets` (8), `/api/products` (3), `/api/tables` (3)
- Socket.io para multi-terminal sync (`TicketTotalChanged`, `TicketClosed`, `OrderAdded`, `PaymentProcessed`)
- Mock de impresión ESC/POS en base64 (inicia con `0x1B 0x40` — ESC @ init)
- Tests de integración con supertest: 32/32 passed

### Sprint 4 — Interfaz de Usuario Táctil (Pixel Perfect) ✅
- **Vanilla JS + Web Components** (sin framework, sin virtual DOM)
- `<flex-button>` Web Component replicando FlexButton de WPF:
  - Auto-contrast de foreground (luminance < 128 → blanco)
  - Border = Lerp(bgColor, black, 30%)
  - Press feedback <100ms (CSS transition + transform + bg flash)
  - Glow on hover
- **CSS Grid layout** replicando el Shell del original (header 50px / main 1fr / footer 30px)
- **Paleta exacta** extraída del XAML: 50+ colores WPF named + hex hardcoded (variables.css)
- **Font Awesome 6 Free** para todos los iconos (mapeo del `UI_SPECS_FOR_WEB.md`)
- **4 pantallas prioritarias** implementadas:
  1. **LoginView** — teclado numérico 4×3 (60×60 keys), botón Login con gradiente verde `#FFB9EFA9→#FF288D09`
  2. **EntityDashboardView** (mapa de mesas) — grid 7 columnas, tiles con colores por estado:
     - Available → `#90EE90` (LightGreen)
     - New Orders → `#00008B` (DarkBlue, texto blanco)
     - Bill Requested → `#FFA500` (Orange)
     - Locked → `#808080` (Gray)
  3. **PosView** — 4 zonas (CSS Grid): ticket info + open tickets strip + main (orders 60% / products 40%) + command bar (Gift/Void/Note/Tags/Discount/Print/Pay)
  4. **PaymentEditorView** — orders list + numeric keypad + summary (tendered/remaining/change/total) + payment type buttons (Cash/Card/Voucher/Account)
- **Store Singleton Observable** (EventTarget-based) — single source of truth, emula PRISM EventAggregator
- **WebSocket client** con reconexión automática y backoff exponencial (1s → 30s cap, 30% jitter)
- **Static serving**: Express sirve `/frontend` como SPA (fallback a `index.html`)
- **E2E test**: 23/23 passed — verifica flujo completo login → mesa → productos → descuento → pago → cierre → print + 5 eventos WebSocket broadcast

### Sprint 5 — Flujo Transaccional Completo + JWT + Playwright + Docker ✅
- **Autenticación JWT** real (reemplaza el mock admin/1234):
  - `POST /api/auth/login` devuelve `{ token, user }` con expiración 8h
  - Middleware `authenticate` valida `Authorization: Bearer <token>` en todas las rutas `/api/*` (excepto `/api/auth/login`)
  - Frontend almacena token en `localStorage`, auto-logout en 401
  - PIN soporta tanto bcrypt hash como texto plano (backward compat con seed)
- **7 endpoints avanzados** del `BUSINESS_RULES_ENGINE.md`:
  - `POST /api/tickets/:id/note` — setea nota del ticket
  - `POST /api/tickets/:id/gift` — marca órdenes como Gift (`CalculatePrice=false`)
  - `POST /api/tickets/:id/void` — anula ticket (revierte AccountTransactions, marca `Status=Void`)
  - `POST /api/tickets/:id/tags` — actualiza `TicketTags` JSON
  - `POST /api/tickets/:id/split` — divide ticket moviendo órdenes a uno nuevo
  - `POST /api/tickets/:id/refund` — crea ticket de devolución con monto negativo (auto-reversal)
  - `POST /api/tickets/merge` — combina 2+ tickets en uno nuevo, cierra los originales
- **Mock de impresión ESC/POS verificado**:
  - Test de checksum SHA-256: buffer determinista, same ticket → same buffer
  - Buffer empieza con `0x1B 0x40` (ESC @ — printer init)
  - Contiene `ESC a` (align), `GS V 66 0` (cut), `ESC d 1` (feed), `ESC p 0 25 250` (cash drawer)
  - Sin bytes inválidos — seguro para enviar a impresora térmica real
- **Tests de Playwright** (3 tests, 9 capturas de pantalla):
  - `tests/e2e/flow.spec.js`: login → dashboard → POS → note modal → logout
  - Login con PIN incorrecto muestra error
  - Indicator de WebSocket muestra "Connected"
  - Capturas en `/docs/screenshots/01-login-filled.png` … `09-ws-connected.png`
- **Docker**:
  - `Dockerfile` multi-stage: Node 20 slim + sqlite3 build deps
  - `docker-compose.yml`: un solo comando `docker compose up -d --build`
  - Volume `samba-data` persiste la BD SQLite
  - Healthcheck en `/health`
  - Variables de entorno: `JWT_SECRET`, `JWT_EXPIRES_IN`, `SAMBA_DB_PATH`
- **47/47 tests de integración** pasan (incluyendo 12 nuevos de Sprint 5: JWT + extended endpoints + split/refund/merge)

---

## 🌐 API REST

### Tickets

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/tickets` | Lista tickets abiertos |
| `GET` | `/api/tickets/:id` | Obtiene un ticket por ID |
| `POST` | `/api/tickets` | Crea un nuevo ticket |
| `POST` | `/api/tickets/:id/orders` | Añade una orden al ticket |
| `POST` | `/api/tickets/:id/calculations` | Aplica descuento/service/rounding |
| `POST` | `/api/tickets/:id/payments` | Procesa un pago |
| `POST` | `/api/tickets/:id/close` | Cierra el ticket |
| `GET` | `/api/tickets/:id/print` | Genera mock ESC/POS en base64 |

### Products

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/products` | Lista todos los menu items |
| `GET` | `/api/products/:id` | Obtiene un menu item por ID |
| `GET` | `/api/products/group/:code` | Filtra por GroupCode |

### Tables

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/tables` | Lista todas las mesas |
| `GET` | `/api/tables/:id` | Obtiene una mesa por ID |
| `PATCH` | `/api/tables/:id/state` | Actualiza el estado de la mesa |

### Códigos de error

| Code | Cuándo |
|------|--------|
| `400` | Validación de input fallida (body malformado, campos requeridos faltantes) |
| `404` | Recurso no encontrado (ticket/product/table inexistente) |
| `409` | Conflicto de estado (mesa ya ocupada al intentar abrirla) |
| `500` | Error interno del servidor |

---

## 🧪 Testing

### Sprint 1 — Aceptación de capa de datos
```bash
node scripts/insert-ticket-demo.js
```

### Sprint 2 — Aceptación del motor de negocio
```bash
node scripts/sprint2-acceptance-test.js
```

### Sprint 3 — Integración HTTP (supertest)
```bash
npm test    # 47 tests: health, products, tables, tickets lifecycle, JWT auth, split/refund/merge
```

### Sprint 4 — E2E flow test
```bash
npm run test:e2e    # 23 tests: full flow via HTTP + WebSocket events
```

### Sprint 5 — Playwright (browser automation)
```bash
cd backend
npx playwright test --reporter=line          # headless (CI)
npx playwright test --headed                  # show browser
npx playwright test --debug                   # step-by-step
npx playwright show-report tests/e2e/report   # open HTML report
```
Capturas de pantalla se guardan en `/docs/screenshots/`.

### Sprint 5 — ESC/POS buffer checksum
```bash
npm run test:print    # 7 tests: SHA-256 checksum, ESC/POS structure validation
```

---

## 🐳 Docker

### Levantar con un solo comando
```bash
docker compose up -d --build
# → http://localhost:3001
# → Login: Administrator / 1234
```

### Variables de entorno
| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3001` | Puerto HTTP + WebSocket |
| `NODE_ENV` | `production` | Modo de ejecución |
| `JWT_SECRET` | `change-this-in-production` | Secret para firmar JWT |
| `JWT_EXPIRES_IN` | `8h` | Expiración del token |
| `SAMBA_DB_PATH` | `/app/data/samba.db` | Ruta de la BD SQLite |

### Volúmenes
- `samba-data` → persiste `/app/data/samba.db` entre reinicios del container

### Healthcheck
El container incluye un healthcheck que verifica `GET /health` cada 30s.

### Detener y limpiar
```bash
docker compose down              # detiene containers
docker compose down -v           # detiene + borra volumen (¡pierde la BD!)
```

---

## 🖨 Impresión ESC/POS

### Mock (actual)
El endpoint `GET /api/tickets/:id/print` devuelve:
```json
{
  "data": {
    "ticket": { /* full ticket object */ },
    "formatted": "<L00>Ticket: 1\n<L00>Date: ...\n<F>\n<J00>Burger x2|15.00\n...",
    "escposBase64": "G0AxMjM0NT...",
    "escposBytesCount": 305
  }
}
```

El buffer ESC/POS generado:
- Empieza con `0x1B 0x40` (ESC @ — init printer)
- Contiene `ESC a 0/1/2` (alineación left/center/right)
- Contiene `ESC d 1` + `GS V 66 0` (feed + cut)
- Contiene `ESC p 0 25 250` (cash drawer open) cuando hay tag `<drawer>`

### Impresora real (Sprint 6 — pendiente)
Para conectar una impresora térmica USB real:
1. **Backend**: instalar `node-escpos` + `node-escpos-usb` para enviar bytes via USB
2. **Frontend (WebUSB)**: Chrome/Edge soporta WebUSB API para enviar bytes directamente desde el navegador:
   ```javascript
   const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x04b8 }] });
   await device.open();
   await device.claimInterface(0);
   await device.transferOut(1, new Uint8Array(escposBytes));
   ```
3. **Fallback PDF**: `window.print()` con una ventana emergente que contiene el HTML formateado

### Test de checksum
```bash
npm run test:print
```
Verifica que el buffer es determinista (same ticket → same SHA-256) y que todos los bytes son válidos ESC/POS.

---

## 📜 Licencia

Proyecto de ingeniería inversa educativa. El código original SambaPOS V3 es propiedad de sus autores (https://github.com/josephwambura/SambaPOS-3). Este web clone se distribuye bajo la misma licencia que el original.

---

**Estado**: Sprint 3 en progreso · **Última actualización**: 2026-09-04
