# BASELINE_PRODUCTION_AUDIT.md — SambaPos_LBA Auditoría de Producción

**Fecha:** 2026-09-08
**Commit:** `9107500`
**Working tree:** Clean (no uncommitted changes)
**Guía maestra:** SambaPos_LBA_Auditoria_Guia_Produccion.md
**Roadmap oficial:** Fase 0 → Fase 13 (no 0-20)

---

## 1. Tests reales ejecutados

| Suite | Tests | Pass | Fail |
|-------|------:|-----:|-----:|
| api-integration | 47 | 47 | 0 |
| kds-verification | 49 | 49 | 0 |
| inventory-verification | 13 | 13 | 0 |
| concurrency-verification | 8 | 8 | 0 |
| idempotency-verification | 7 | 7 | 0 |
| idempotency-concurrency | 7 | 7 | 0 |
| domain-verification | 72 | 72 | 0 |
| security-verification | 21 | 21 | 0 |
| printing-verification | 24 | 24 | 0 |
| recipes-verification | 25 | 25 | 0 |
| refund-verification | 6 | 6 | 0 |
| unit-conversion-verification | 14 | 14 | 0 |
| **Total unit** | **293** | **293** | **0** |
| E2E Playwright | 27 | 27* | 0 |
| **TOTAL** | **320** | **320** | **0** |

*E2E con `failOnFlakyTests=true`, `--repeat-each=2`. Algunos tests tienen flakiness controlado.

## 2. Build / Lint / Static checks

- **Syntax check:** `node --check` en todos los .js bajo `src/`, `tests/`, `scripts/` → PASS
- **npm ci:** 0 vulnerabilities (`npm audit --audit-level=low`)
- **gitleaks:** 0 leaks (CI `gitleaks-action@v2`)
- **Docker build:** Multi-stage, non-root user, healthcheck → PASS

## 3. Dependencias

```
bcryptjs ^3.0.3       — PIN hashing
cors ^2.8.6            — CORS middleware
decimal.js ^10.4.3     — Precise money calculations
express ^5.2.1         — HTTP framework
express-rate-limit ^8.7.0 — Brute force protection
helmet ^8.3.0          — Security headers
jsonwebtoken ^9.0.3    — JWT auth
knex ^3.1.0            — Query builder + migrations
socket.io ^4.8.3        — WebSocket
socket.io-client ^4.8.3 — WebSocket client (for tests)
sqlite3 ^6.0.1         — SQLite driver
supertest ^7.2.2       — HTTP testing
zod ^4.5.4             — Input validation
web-push ^3.6.7        — Web Push notifications (REAL)
@playwright/test ^1.63.0 — E2E testing
```

## 4. Secretos

- `.env` en git: **NO** (verificado con `git ls-files`)
- `.db` en git: **NO**
- `credentials.json` en git: **NO**
- `.env.example` en git: **SÍ** (correcto — template sin secretos)
- `.gitignore` incluye: `.env`, `.env.*`, `!.env.example`, `data/*.db`, `tool-results/`

## 5. Migraciones (11)

1. `20240904000001_create_schema.js` — Schema principal (96 tablas SambaPOS)
2. `20240905000001_add_optimistic_locking.js` — Version + IdempotencyKeys
3. `20240906000001_create_kitchen_module.js` — KitchenStations, KitchenOrders, routing
4. `20240907000001_create_inventory_module.js` — Ingredients, Recipes, StockMovements, UnitConversions
5. `20240908000001_create_rbac_module.js` — Permissions, RolePermissions, UserRoles
6. `20260907000001_create_cash_session_and_customers.js` — CashSessions, Customers, WorkPeriods
7. `20260907000002_add_ticket_state_flags.js` — IsVoided, IsRefunded, VoidReason, VoidedAt, VoidedBy
8. `20260907000003_create_print_job_queue.js` — PrintJobInstances, PrintAreas, PrintRoutingRules
9. `20260908000001_fix_idempotency_unique_constraint.js` — Composite UNIQUE(Key, Endpoint), Status, RequestBodyHash
10. `20260908000002_create_push_tables.js` — PushSettings, PushSubscriptions, PushNotifications
11. `20260908000003_add_granular_permissions.js` — 16 permisos granulares (tickets.create, payments.process, etc.)

## 6. Tablas DB (113 tablas)

Incluye todas las tablas del schema SambaPOS V3 original + tablas nuevas de SambaPos_LBA:
- **Core:** Tickets, Orders, Payments, ChangePayments, Calculations, TicketEntities, MenuItems, MenuItemPortions, MenuItemPrices, Departments, TicketTypes, PaymentTypes, ChangePaymentTypes, CalculationTypes, Users, UserRoles
- **KDS:** KitchenStations, KitchenOrders, KitchenOrderItems, KitchenStationRouting
- **Inventory:** Ingredients, IngredientUnits, UnitConversions, Recipes, RecipeItems, StockBalances, StockMovements, Warehouses, Suppliers, InventoryItems
- **RBAC:** Permissions (43), RolePermissions, UserRoles
- **Cash:** CashSessions, CashSessionEvents, WorkPeriods
- **Customers:** Customers
- **Printing:** Printers, PrinterTemplates, PrintJobs (legacy config), PrinterMaps, PrintJobInstances, PrintAreas, PrintRoutingRules
- **Push:** PushSettings, PushSubscriptions, PushNotifications
- **Idempotency:** IdempotencyKeys
- **Audit:** AuditLogs
- **SambaPOS legacy:** AccountTransactions, AccountTransactionDocuments, EntityTypes, EntityScreens, ScreenMenus, TaxTemplates, Numerators, Triggers, etc.

## 7. Endpoints API (112 líneas de rutas)

| Router | Endpoints | Permisos |
|--------|-----------|----------|
| auth | 5 (login, me, logout, sessions, revoke-all) | login=public, resto=auth |
| tickets | 14 (CRUD, orders, payments, close, void, refund, split, merge, note, tags, gift, print) | pos.* + tickets.* |
| products | 5 (list, by-group, by-id, create, update) | pos.login + manage.products |
| tables | 3 (list, by-id, update-state) | pos.login + pos.change_table |
| kitchen | 8 (stations, orders, state, bump, serve, void, recall, stats) | kitchen.view + kitchen.* |
| inventory | 8 (ingredients, units, recipes, stock, movements) | inventory.view + manage.inventory |
| recipes | 9 (list, cost-summary, calc-margin, suggest-price, by-portion, by-menu-item, save, cost, delete) | recipes.view + manage.inventory |
| printers | 14 (CRUD printers, areas, routing-rules, jobs, stats, test, cancel, reprint, send, kitchen, receipt) | printers.manage + pos.print |
| customers | 6 (CRUD + search) | customers.manage |
| cash-sessions | 8 (work-periods open/close/current, cash-sessions open/close/current/payout/events) | cash.manage |
| push | 5 (vapid-key, subscribe, unsubscribe, pending, cleanup) | auth + manage.printers |
| reports | 9 (sales, top-products, categories, users, payments, voids-refunds, inventory, cash-sessions, dashboard) | pos.login |
| config | ~5 (settings) | pos.login |

## 8. Frontend

| View | Archivo | Funcionalidad |
|------|---------|---------------|
| Login | login.js | PIN keypad, validación, errores |
| Dashboard | dashboard.js | Mapa de mesas, estados, búsqueda |
| POS | pos.js | Productos, categorías, ticket, command bar (Gift/Void/Note/Tags/Discount/Print/Pay) |
| Payment | payment.js | Numpad, tipos de pago, cambio, cierre |
| Kitchen | kitchen.js | KDS con sonido, vibración, notificaciones, filtros, estados |
| Admin | admin.js | Sidebar con 5 tabs: Productos, Inventario, Recetas, Impresoras, Configuración |

| Service | Archivo | Funcionalidad |
|---------|---------|---------------|
| API | api.js | Fetch wrapper + offline queue integration |
| PWA | pwa.js | Install prompt capture |
| Push | push.js | PushClient + polling fallback |
| Store | store.js | State management (Observable) |
| WebSocket | websocket-client.js | Heartbeat + reconnect + resync |
| OfflineQueue | offlineQueue.js | IndexedDB outbox |

## 9. PWA

- `manifest.webmanifest`: ✅ standalone, theme_color #044392, icons 192/512 (normal + maskable), shortcuts
- `sw.js`: ✅ Precache offline shell, cache-first assets, network-first navigations, never caches /api/*
- `offline.html`: ✅ Branded offline page
- `pwa.js`: ✅ Captura `beforeinstallprompt`
- **Install prompt visible en UI:** ❌ NO — `SambaPWA.promptInstall()` existe pero no hay botón visible

## 10. WebSocket

- Auth JWT en handshake: ✅
- Rooms por rol (role:pos, role:kitchen, role:admin): ✅
- Heartbeat (25s ping, 10s timeout): ✅
- Reconnect con backoff + jitter: ✅
- Online/offline detection: ✅
- Resync tras reconnect: ✅
- Eventos: TicketCreated, TicketClosed, TicketTotalChanged, OrderAdded, PaymentProcessed, EntityUpdated, KitchenOrderAdded/Updated/Voided, InventoryLow, InventoryUpdated, PrintJobCompleted/Failed/Retrying
- **Autorización por recurso (ticket:<id>):** ❌ NO — cualquier usuario con pos.login puede unirse a cualquier ticket room

## 11. Impresión

- PrintQueue: ✅ Persistente con idempotencia, atomic claim, retry con backoff
- PrintRouter: ✅ Routing rules (GROUP_CODE, MENU_ITEM, TAG, DEFAULT)
- PrintWorker: ✅ Integrado en server.js (auto-start/stop)
- EscPosRenderer: ✅ ESC/POS bytes (init, code page, align, cut, cash drawer)
- TcpTransport: ✅ TCP socket a printer:9100
- **Gate hardware real:** ❌ NO probado con impresora física

## 12. Inventario

- Ingredients + IngredientUnits + UnitConversions: ✅
- Recipes + RecipeItems: ✅
- StockBalances + StockMovements: ✅
- Conversión de unidades (kg↔gr, L↔ml): ✅ Verificado con 14 tests
- deductForTicketSale (recipe explosion): ✅ Transaccional
- reverseForTicket (void/refund): ✅ Idempotente
- **Traspasos:** ❌ NO implementado
- **Inventario físico:** ❌ NO implementado
- **Merma:** ❌ NO implementado (WASTE movement type existe pero sin UI/endpoint)
- **Kardex:** ❌ NO implementado

## 13. Recetas

- RecipeService: ✅ Costo, margen, precio sugerido, conversión de unidades
- UI de administración: ✅ En AdminView tab "Recetas"
- **Recetas versionadas:** ❌ NO
- **Combos:** ❌ NO

## 14. KDS

- KitchenService: ✅ Routing, bump, serve, void, recall
- Frontend: ✅ Sonido two-tone, vibración, notificaciones browser, filtros, urgente
- Estados: NEW → ACCEPTED → PREPARING → READY → SERVED + VOIDED
- **Gate tiempo real:** ⚠️ Parcial — el evento WebSocket existe pero no se ha verificado E2E que un pedido creado en POS aparezca en KDS sin refrescar

## 15. Caja

- CashSession + WorkPeriod: ✅ Dominio + rutas + migración
- Open/close/payout: ✅
- **UI de caja:** ❌ NO existe vista de caja en frontend

## 16. Reportes

- ReportService: ✅ 8 métodos (sales, top-products, categories, users, payments, voids-refunds, inventory, cash-sessions, dashboard)
- Endpoints: ✅ 9 endpoints en /api/reports/
- **UI de reportes:** ❌ NO existe tab de reportes en AdminView
- **Export CSV/XLSX/PDF:** ❌ NO

## 17. Backup/Restore

- backup.js: ✅ Script básico (copia DB)
- restore.js: ✅ Script básico (reemplaza DB)
- **Rotación/retención:** ❌ NO
- **Validación post-backup:** ❌ NO
- **Restore drill:** ❌ NO probado

## 18. PostgreSQL

- knexfile.js: `client: 'sqlite3'` para dev y prod
- **PostgreSQL support:** ❌ NO implementado

## 19. Android

- **Capacitor:** ❌ NO existe

## 20. Observabilidad

- Request IDs (X-Request-ID header): ✅
- /metrics endpoint (auth-protected): ✅ uptime, requests by status, errors, memory, PrintWorker, WebSocket
- errorLogger with requestId: ✅
- **Structured logs:** ⚠️ Parcial (JSON metadata pero formato console.log)
- **Alerts:** ❌ NO

## 21. Push

- web-push lib: ✅ Real VAPID + AES128GCM + JWT signing
- Migración formal: ✅ PushSettings, PushSubscriptions, PushNotifications
- 404/410 handling: ✅ Marca suscripción como expirada
- PushClient frontend: ✅ subscribe + polling fallback
- **UX de activación:** ❌ NO hay botón "Activar notificaciones" en UI
- **Tests:** ❌ 0 tests de push
- **Gate E2E:** ❌ NO probado

## 22. Offline

- OfflineQueue (IndexedDB): ✅
- API integration (isRetryable, isOfflineable): ✅
- **Orden de operaciones:** ❌ NO garantizado (ticket→orders→payment→close)
- **JWT expirado durante sync:** ❌ NO manejado
- **Tests:** ❌ 0 tests de offline
- **Gate E2E:** ❌ NO probado

---

## Estado por fase (guía maestra 0-13)

| Fase | Objetivo | Estado | Gate superado |
|------|----------|--------|---------------|
| 0 | Auditoría + baseline | ✅ Completa | Este documento |
| 1 | Seguridad | ✅ Completa | 21 tests + RBAC granular + session tracking |
| 2 | Dominio | 🟡 Parcial | 72 domain tests, pero faltan verificar split/merge reales |
| 3 | Administración | 🟡 Parcial | 5 tabs en AdminView, pero faltan usuarios/roles/mesas/clientes/proveedores/etc. |
| 4 | Inventario + recetas | 🟡 Parcial | Conversión OK, pero faltan traspasos/merma/kardex/inventario físico |
| 5 | Cocina/KDS | 🟡 Parcial | KDS funciona, gate tiempo real no verificado E2E |
| 6 | Printer Gateway | 🟡 Parcial | Arquitectura completa, pero gate hardware no superado |
| 7 | PWA | 🟡 Parcial | Manifest+SW OK, pero install prompt no visible en UI |
| 8 | Push | 🔴 Pendiente | web-push lib + migración, pero sin UX ni tests |
| 9 | Offline | 🔴 Pendiente | Queue+API integration, pero sin orden/JWT/tests |
| 10 | PostgreSQL + producción | 🔴 Pendiente | SQLite only |
| 11 | Android | 🔴 Pendiente | No existe Capacitor |
| 12 | UI final | ✅ Completa | Azul + tablet + touch + español + logo |
| 13 | Release hardening | 🔴 Pendiente | No iniciado |
