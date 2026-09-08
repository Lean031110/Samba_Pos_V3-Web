# PROJECT_STATUS.md — Estado real del producto SambaPos_LBA

**Fecha:** 2026-09-08
**Commit base:** `41e1c0d`
**Guía maestra:** SambaPos_LBA_Auditoria_Guia_Produccion.md (Fases 0–13)

---

## Matriz corregida contra la guía maestra

| Fase guía | Objetivo | Backend | Frontend | DB/Migraciones | Tests | Docs | Estado | Gate |
|-----------|----------|:-------:|:--------:|:--------------:|:-----:|:----:|:------:|------|
| 0 | Congelación + auditoría | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Completa | BASELINE_REPORT.md existe |
| 1 | Seguridad y limpieza | ✅ | — | ✅ | ✅ 21 | ✅ | 🟡 Parcial | RBAC usa `pos.login` como catch-all. No hay device/session tracking ni revocación |
| 2 | Dominio completo | ✅ | — | ✅ | ✅ 72 | ✅ | 🟡 Parcial | Falta verificar: split real, merge real, reapertura, trazabilidad de cambio |
| 3 | Administración | 🟡 | 🟡 | ✅ | 🔴 | 🟡 | 🟡 Parcial | AdminView tiene 5 tabs pero faltan: usuarios, roles, mesas, clientes, proveedores, métodos de pago, etc. |
| 4 | Inventario y recetas | ✅ | ✅ | ✅ | ✅ 39 | ✅ | 🟡 Parcial | Conversión de unidades OK. Faltan: traspasos, inventario físico, merma, kardex, combos |
| 5 | Cocina/KDS | ✅ | ✅ | ✅ | ✅ 49 | ✅ | 🟡 Parcial | KDS funciona. Falta verificar routing POS→estación en tiempo real sin refrescar |
| 6 | Printer Gateway | ✅ | ✅ | ✅ | ✅ 24 | ✅ | 🟡 Parcial | PrintQueue+Router+Worker integrados. **Gate no superado**: no probado con impresora física real |
| 7 | PWA | — | 🟡 | — | ✅ | ✅ | 🟡 Parcial | Manifest+SW+icons OK. **Falta**: install prompt visible en UI |
| 8 | Push | ✅ | 🟡 | ✅ | 🔴 | 🟡 | 🔴 Pendiente | web-push lib instalado + migración formal. **Falta**: UX, tests, E2E |
| 9 | Offline/Sync | — | 🟡 | — | 🔴 | 🟡 | 🔴 Pendiente | OfflineQueue + API integration. **Falta**: orden ops, JWT expired, tests, recovery |
| 10 | PostgreSQL + producción | 🟡 | — | 🔴 | 🔴 | 🟡 | 🔴 Pendiente | SQLite only. Metrics+requestId OK. **Falta**: PostgreSQL, backup drill, restore verificado |
| 11 | Android | — | — | — | — | 🔴 | 🔴 Pendiente | No existe Capacitor |
| 12 | UI final | — | ✅ | — | ✅ | ✅ | ✅ Completa | Azul predominante, tablet-first, touch, español, logo |
| 13 | Release hardening | — | — | — | — | — | 🔴 Pendiente | No iniciado |

---

## Resumen

| Estado | Cantidad |
|--------|---------|
| ✅ Completa | 2 (Fase 0, Fase 12) |
| 🟡 Parcial | 8 (Fases 1,2,3,4,5,6,7,10) |
| 🔴 Pendiente | 3 (Fases 8,9,11) |
| 🔴 Pendiente (no iniciado) | 1 (Fase 13) |

---

## Tests actuales

| Suite | Tests | Cubre |
|-------|------:|-------|
| api-integration | 47 | API REST, tickets, pagos, cierre, void |
| kds-verification | 49 | KDS states, routing, bump, serve, recall |
| inventory-verification | 13 | Stock, movimientos, balances |
| concurrency-verification | 8 | Concurrencia de pagos |
| idempotency-verification | 7 | Idempotency keys en payment/close/void/refund |
| idempotency-concurrency | 7 | Concurrencia real con mismas keys |
| domain-verification | 72 | State machine, cálculos, ledger |
| security-verification | 21 | CORS, auth bypass, fuzzing |
| printing-verification | 24 | PrintQueue, PrintRouter, EscPosRenderer |
| recipes-verification | 25 | RecipeService, costos, márgenes |
| refund-verification | 6 | Refund idempotente, IsRefunded |
| unit-conversion-verification | 14 | Conversión kg↔gr, L↔ml |
| **Total unit** | **293** | |
| E2E (Playwright) | 27 | Login→dashboard→POS→kitchen→WebSocket |
| **TOTAL** | **320** | |

**Tests faltantes:** Push (0), Offline (0), Reportes (0), Observabilidad (0)

---

## Migraciones actuales (9)

1. `20240904000001_create_schema.js` — Schema principal SambaPOS
2. `20240905000001_add_optimistic_locking.js` — Version + IdempotencyKeys
3. `20240906000001_create_kitchen_module.js` — KDS
4. `20240907000001_create_inventory_module.js` — Inventario + recetas
5. `20240908000001_create_rbac_module.js` — RBAC
6. `20260907000001_create_cash_session_and_customers.js` — CashSession + Customer
7. `20260907000002_add_ticket_state_flags.js` — IsVoided, IsRefunded
8. `20260907000003_create_print_job_queue.js` — PrintJobInstances, PrintAreas
9. `20260908000001_fix_idempotency_unique_constraint.js` — Composite UNIQUE(Key, Endpoint)
10. `20260908000002_create_push_tables.js` — PushSettings, PushSubscriptions, PushNotifications

---

## Archivos clave del producto

### Backend (servicios)
- `TicketService.js` — Creación, órdenes, pagos, cierre
- `TicketServiceExtended.js` — Void, refund, split, merge, tags, notes, gift
- `InventoryService.js` — Stock, movimientos, conversión de unidades, deduct, reverse
- `RecipeService.js` — Recetas, costos, márgenes, precios sugeridos
- `KitchenService.js` — KDS, routing, bump, serve, void propagation
- `PrinterManager.js` — ESC/POS renderer, TCP transport
- `PrintQueue.js` — Cola persistente con idempotencia
- `PrintRouter.js` — Routing rules (GROUP_CODE, MENU_ITEM, TAG, DEFAULT)
- `PrintWorker.js` — Background poller (integrado en server.js)
- `CashSessionService.js` — Sesiones de caja
- `CustomerService.js` — Clientes
- `pushService.js` — Web Push real con web-push lib
- `reportService.js` — 8 tipos de reportes

### Backend (middleware)
- `auth.js` — JWT + bcrypt + rate-limit
- `rbac.js` — 27 permisos, cache en memoria
- `idempotency.js` — Atomic INSERT OR IGNORE + Status + hash
- `schemas.js` — Zod validation
- `auditLog.js` — Auditoría de acciones sensibles
- `logger.js` — Request IDs + métricas

### Frontend (views)
- `login.js` — Login con keypad
- `dashboard.js` — Mapa de mesas
- `pos.js` — POS principal (productos, ticket, command bar)
- `payment.js` — Pago con numpad
- `kitchen.js` — KDS (sonido, vibración, notificaciones, filtros)
- `admin.js` — Panel administración (5 tabs)

### Frontend (servicios)
- `api.js` — API client con offline integration
- `pwa.js` — PWA install handler
- `push.js` — Web Push client
- `store.js` — State management
- `websocket-client.js` — WebSocket con heartbeat + reconnect
- `offlineQueue.js` — IndexedDB outbox

---

## Próximo paso: BLOQUE A (Fase 0+1)

Corregir seguridad, secretos, DB, autenticación y RBAC granular.
