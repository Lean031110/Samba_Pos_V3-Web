# SambaPOS V3 — Web Clone

Réplica web fiel (pixel-perfect + logic-perfect) de **SambaPOS V3** (https://github.com/josephwambura/SambaPOS-3), migrando la aplicación WPF original a una arquitectura moderna Node.js + Vanilla JS + Web Components.

> Estado del proyecto: **Sprint 3 en curso** (APIs REST + WebSockets + Mock de impresión)

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

# 6. (Sprint 3) Iniciar el servidor API
npm start
# → Server escuchando en http://localhost:3001
# → WebSocket escuchando en ws://localhost:3001

# 7. (Sprint 3) Ejecutar tests de integración
npm test
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

### Sprint 3 — APIs RESTful + WebSockets 🚧 (en progreso)
- Express server con middleware (logging, errores 400/404/409, validación)
- Endpoints: `/api/tickets`, `/api/products`, `/api/tables`
- Socket.io para multi-terminal sync (`TicketTotalChanged`, `TicketClosed`)
- Mock de impresión ESC/POS en base64
- Tests de integración con supertest

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
Verifica: inserción de ticket con 2 órdenes, lectura via repositorio, cálculo byte-identical al C# original, preservación de la inconsistencia de redondeo.

### Sprint 2 — Aceptación del motor de negocio
```bash
node scripts/sprint2-acceptance-test.js
```
Verifica 5 escenarios:
1. Ticket simple, TaxIncluded=true, sin descuento
2. Ticket simple, TaxIncluded=false, sin descuento
3. Descuento PRE-TAX (10%) + tax excluido
4. Service charge POST-TAX (10%) + tax incluido
5. Auto-reversal en monto negativo (-7.00)

Más: ledger balanceado en cada escenario, eventBus publica eventos correctos.

### Sprint 3 — Integración HTTP
```bash
npm test
```
Tests con supertest: cada endpoint recibe input y devuelve el HTTP code correcto + body JSON esperado. Cubre 404, 409, 400, 200.

---

## 📜 Licencia

Proyecto de ingeniería inversa educativa. El código original SambaPOS V3 es propiedad de sus autores (https://github.com/josephwambura/SambaPOS-3). Este web clone se distribuye bajo la misma licencia que el original.

---

**Estado**: Sprint 3 en progreso · **Última actualización**: 2026-09-04
