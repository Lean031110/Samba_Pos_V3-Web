# SAMBAPOS_V3_FUNCTIONAL_REFERENCE.md — Matriz de referencia funcional

**Fecha:** 2026-09-08
**Propósito:** Mapear cada función de SambaPOS V3 (C#/WPF) a la implementación de SambaPos_LBA (Node.js/Web) e identificar gaps.

---

## Matriz: Función → Referencia SambaPOS V3 → SambaPos_LBA → Gap → Test

### Ticket lifecycle

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| CreateTicket | `TicketService.cs` → `CreateTicket()` | `TicketService.createTicket()` | ✅ Implementado | api-integration (47) |
| OpenTicket | `TicketService.cs` → `OpenTicket()` | `TicketService.getOpenTickets()` | ✅ Implementado | api-integration |
| CloseTicket | `TicketService.cs` → `CloseTicket()` | `TicketService.closeTicket()` | ✅ Transaccional + inventory deduct | api-integration + refund (6) |
| Recalculate | `TicketRecalculator.cs` | `TicketRecalculator.js` | ✅ Implementado | domain (72) |
| Ticket state | `TicketStateMachine` (implícito) | `TicketStateMachine.js` | ✅ Formal (OPEN→LOCKED→PAID→CLOSED→VOIDED→REFUNDED) | domain (72) |
| Ticket number | `Numerators` table + `TicketNumber` | `Tickets.TicketNumber` | ⚠️ No usa Numerators (genera automático) | — |
| Order number | `OrderNumber` en Orders | `Orders.OrderNumber` | ⚠️ No se asigna secuencialmente | — |
| Concurrency | Optimistic locking en `Ticket.Version` | `Tickets.Version` + `saveTicket` check | ✅ Implementado | concurrency (8) |
| Audit | `AuditLogs` table | `AuditLogs` table + `auditLog` middleware | ✅ Implementado | api-integration |
| Entity/Table | `TicketEntities` + `Entities` | `TicketEntities` + `Entities` | ✅ Implementado | api-integration |
| Tags | `TicketTags` + `TicketTagGroups` | `TicketTags` + `TicketTagGroups` | ✅ Implementado (setTags) | — |
| Customer | `Ticket.CustomerId` + `Customers` | `Tickets.CustomerId` + `Customers` | ✅ Implementado | — |
| Calculations | `Calculations` + `CalculationTypes` | `Calculations` + `CalculationTypes` | ✅ Implementado (addCalculation) | — |

### Pagos

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| AddPayment | `TicketService.cs` → `AddPayment()` | `TicketService.addPayment()` | ✅ Implementado | api-integration |
| RemainingAmount | `Ticket.RemainingAmount` | `Ticket.RemainingAmount` | ✅ Implementado | domain |
| TenderedAmount | `Payment.TenderedAmount` | `Payments.TenderedAmount` | ✅ Implementado | — |
| ChangeAmount | `ChangePayments` table | `ChangePayments` table | ✅ Implementado | — |
| Pago parcial | `AddPayment()` con amount < remaining | `addPayment()` con amount < remaining | ✅ Implementado | idempotency (7) |
| Múltiples pagos | Múltiples `Payments` rows | Múltiples `Payments` rows | ✅ Implementado | — |
| Refund | `AddPayment()` con amount negativo | `refundTicket()` con `IsRefunded` | ✅ Implementado | refund (6) |
| Refund parcial | `AddPayment()` con amount negativo < total | `refundTicket()` con amount < total | ✅ Implementado | refund (6) |
| Idempotency | No existe en V3 | `IdempotencyKeys` table + middleware | ✅ Implementado (mejora sobre V3) | idempotency-concurrency (7) |
| PaymentProcessed event | `EventTopicNames.PaymentProcessed` | `EventTopicNames.PaymentProcessed` + WebSocket | ✅ Implementado | — |

### Operaciones de ticket

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| Split | `TicketService.SplitTickets()` | `TicketServiceExtended.splitTicket()` | ✅ Implementado | — |
| Merge | `TicketService.MergeTickets()` | `TicketServiceExtended.mergeTickets()` | ✅ Implementado | — |
| Move orders | `TicketService.MoveOrders()` | ❌ NO implementado | 🔴 Gap | — |
| Transfer | `TicketService.MoveOrders()` (entre tickets) | ❌ NO implementado | 🔴 Gap | — |
| Reopen | `TicketService.ReopenTicket()` | `pos.reopen_ticket` permiso existe, pero ❌ NO endpoint | 🔴 Gap | — |
| Void | `TicketService.VoidTicket()` | `TicketServiceExtended.voidTicket()` con `IsVoided` | ✅ Implementado | refund (6) |
| Gift | `Order.CalculatePrice=false` | `TicketServiceExtended.giftOrders()` | ✅ Implementado | — |
| Discount | `Calculations` con `CalculationType` | `TicketService.addCalculation()` | ✅ Implementado | — |

### Inventario

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| InventoryItem | `InventoryItems` table | `InventoryItems` table | ✅ Existe | inventory (13) |
| Units | `IngredientUnits` table | `IngredientUnits` table | ✅ Existe | unit-conversion (14) |
| Conversions | `UnitConversions` table | `UnitConversions` table | ✅ Existe + implementado | unit-conversion (14) |
| Warehouses | `Warehouses` table | `Warehouses` table | ✅ Existe | — |
| Stock balance | `StockBalances` table | `StockBalances` table | ✅ Existe | inventory (13) |
| Movements | `StockMovements` table | `StockMovements` table | ✅ Existe + implementado | inventory (13) |
| Recipe | `Recipes` + `RecipeItems` | `Recipes` + `RecipeItems` | ✅ Existe | recipes (25) |
| Cost calculation | `InventoryService.CalculateCost()` | `RecipeService.calculateRecipeCost()` | ✅ Implementado + conversión | recipes (25) |
| Consumption (sale) | `InventoryService.UpdateInventory()` | `InventoryService.deductForTicketSale()` | ✅ Transaccional | unit-conversion (14) |
| Reversal (void) | `InventoryService.UpdateInventory()` (reverse) | `InventoryService.reverseForTicket()` | ✅ Idempotente | refund (6) |
| Traspasos | `WarehouseConsumptions` | ❌ NO implementado | 🔴 Gap | — |
| Inventario físico | `PeriodicConsumptions` | ❌ NO implementado | 🔴 Gap | — |
| Merma | WASTE movement type | WASTE type existe, pero ❌ sin endpoint/UI | 🟡 Gap parcial | — |
| Kardex | Report en `BasicReports` | ❌ NO implementado | 🔴 Gap | — |
| Stock mínimo | `Ingredients.MinimumStock` | `Ingredients.MinimumStock` | ✅ Existe + InventoryLow event | — |
| Alertas | `EventTopicNames.InventoryLow` (no existe en V3) | `InventoryLow` WebSocket event | ✅ Implementado (mejora sobre V3) | — |

### Cocina/KDS

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| Departamentos | `Departments` table | `Departments` table | ✅ Existe | — |
| Routing | `KitchenStationRouting` + `PrinterMaps` | `KitchenStationRouting` + `PrintRoutingRules` | ✅ Implementado | kds (49) |
| KitchenOrder | Vía PrintJob (no KDS en V3) | `KitchenOrders` + `KitchenOrderItems` | ✅ Implementado (mejora sobre V3) | kds (49) |
| Estados | Implícito en OrderStates | NEW→ACCEPTED→PREPARING→READY→SERVED+VOIDED | ✅ Implementado | kds (49) |
| BUMP | Botón en KitchenView | `KitchenService.bumpOrder()` | ✅ Implementado | kds (49) |
| Void propagation | `KitchenService.VoidOrdersForPosOrder()` | `KitchenService.voidOrdersForPosOrder()` | ✅ Implementado | kds (49) |
| Recall | Botón en KitchenView | `KitchenService.recallOrder()` | ✅ Implementado | kds (49) |
| Tiempo real | WebSocket events | `KitchenOrderAdded/Updated/Voided` WebSocket | ✅ Implementado | E2E (27) |
| Prioridad | `Order.Priority` field | `KitchenOrders.Priority` | ✅ Implementado | — |
| SLA | No existe en V3 | `_isUrgent()` con threshold 10min/5min | ✅ Implementado (mejora) | — |
| Sonido | No existe en V3 | Two-tone chime (880Hz + 660Hz) | ✅ Implementado (mejora) | — |
| **Gate: POS→KDS sin refrescar** | N/A | WebSocket event bridge | ⚠️ No verificado E2E explícito | — |

### Impresión

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| PrintJob (config) | `PrintJobs` table | `PrintJobs` table (legacy config) | ✅ Existe | — |
| PrintJob (instance) | No existe en V3 (imprime directo) | `PrintJobInstances` table | ✅ Implementado (mejora) | printing (24) |
| Printer | `Printers` table | `Printers` table | ✅ Existe | — |
| PrinterTemplate | `PrinterTemplates` table | `PrinterTemplates` table | ✅ Existe | — |
| PrinterMap | `PrinterMaps` table | `PrinterMaps` table + `PrintRoutingRules` | ✅ Implementado | printing (24) |
| ESC/POS rendering | `PrinterService.cs` → `PrintBuilder` | `EscPosRenderer` class | ✅ Implementado | printing (24) |
| TCP transport | No existe en V3 (Windows spooler) | `TcpTransport` class (TCP 9100) | ✅ Implementado (mejora) | — |
| Queue | No existe en V3 | `PrintQueue` (persistente + idempotente) | ✅ Implementado (mejora) | printing (24) |
| Router | `PrinterMaps` lookup | `PrintRouter` (GROUP_CODE/MENU_ITEM/TAG/DEFAULT) | ✅ Implementado | printing (24) |
| Worker | No existe en V3 | `PrintWorker` (background poller en server.js) | ✅ Implementado (mejora) | — |
| Retry | No existe en V3 | Exponential backoff + jitter + MaxAttempts | ✅ Implementado (mejora) | printing (24) |
| Fallback | No existe en V3 | FallbackPrinterId switch | ✅ Implementado (mejora) | printing (24) |
| Reimpresión | `PrintJob` manual | `POST /api/print/jobs/:id/reprint` | ✅ Implementado | — |
| Cash drawer | `ESC p` command | `EscPosRenderer` includes cash drawer command | ✅ Implementado | — |
| **Gate: hardware real** | Windows spooler | TCP socket | ❌ NO probado con impresora física | — |

### Reportes

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| Ventas por período | `ReportContext.cs` | `getSalesSummary()` | ✅ Implementado | ❌ Sin tests |
| Productos más vendidos | `ReportContext.cs` | `getTopProducts()` | ✅ Implementado | ❌ Sin tests |
| Por categoría | `ReportContext.cs` | `getSalesByCategory()` | ✅ Implementado | ❌ Sin tests |
| Por usuario | `ReportContext.cs` | `getSalesByUser()` | ✅ Implementado | ❌ Sin tests |
| Pagos | `ReportContext.cs` | `getPaymentSummary()` | ✅ Implementado | ❌ Sin tests |
| Voids/Refunds | `ReportContext.cs` | `getVoidRefundSummary()` | ✅ Implementado (corregido) | ❌ Sin tests |
| Inventario | `ReportContext.cs` | `getInventoryMovementSummary()` | ✅ Implementado | ❌ Sin tests |
| Cajas | `ReportContext.cs` | `getCashSessionSummary()` | ✅ Implementado | ❌ Sin tests |
| Dashboard | No existe en V3 | `getDashboardReport()` | ✅ Implementado (mejora) | ❌ Sin tests |
| Export CSV | `BasicReports` → CSV | ❌ NO implementado | 🔴 Gap | — |
| Export XLSX | No existe en V3 | ❌ NO implementado | 🔴 Gap | — |
| Export PDF | `BasicReports` → PDF | ❌ NO implementado | 🔴 Gap | — |
| UI de reportes | `BasicReportsModule` | ❌ NO existe tab en AdminView | 🔴 Gap | — |

### WorkPeriod / Caja

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| WorkPeriod | `WorkperiodModule` | `WorkPeriod.js` + rutas | ✅ Implementado | api-integration |
| Cash session | `CashSession` (no existe en V3) | `CashSession.js` + `CashSessionService.js` | ✅ Implementado (mejora) | — |
| Open | `WorkperiodModule` → Open | `POST /api/work-periods/open` | ✅ Implementado | — |
| Close | `WorkperiodModule` → Close | `POST /api/work-periods/close` | ✅ Implementado | — |
| Payout | No existe en V3 | `POST /api/cash-sessions/:id/payout` | ✅ Implementado (mejora) | — |
| Expected vs counted | No existe en V3 | `CashSession.ExpectedAmount` vs `CountedAmount` | ✅ Implementado (mejora) | — |
| UI de caja | `WorkperiodModule` view | ❌ NO existe vista en frontend | 🔴 Gap | — |

### Seguridad / RBAC

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| Login | `LoginModule` → PIN pad | `login.js` + `auth.js` | ✅ Implementado | security (21) |
| JWT | No existe en V3 (Windows auth) | JWT + bcrypt + session tracking | ✅ Implementado (mejora) | security (21) |
| Permisos | `PermissionRegistry` en cada módulo | `Permissions` table (43) + `requirePermission()` | ✅ Implementado | security (21) |
| Rate limiting | No existe en V3 | `express-rate-limit` (5/15min) | ✅ Implementado (mejora) | security (21) |
| Session revocation | No existe en V3 | JTI + `sessionService` + `/auth/logout` | ✅ Implementado (mejora) | — |
| **WebSocket auth por recurso** | N/A | ❌ Cualquier usuario puede unirse a ticket:<id> | 🔴 Gap | — |

### PWA / Push / Offline

| Función | Referencia SambaPOS V3 | SambaPos_LBA | Gap | Test |
|---------|----------------------|-------------|------|------|
| PWA | N/A (desktop app) | manifest + SW + icons | ✅ Implementado | E2E (27) |
| Install prompt | N/A | `pwa.js` captura evento | ⚠️ Sin UI visible | — |
| Push | N/A | web-push lib + migración | ⚠️ Sin UX ni tests | — |
| Offline | N/A | OfflineQueue + API integration | ⚠️ Sin orden ni tests | — |

---

## Resumen de gaps

### 🔴 Gaps críticos (bloquean producción)

1. **Move orders / Transfer** — No implementado en TicketServiceExtended
2. **Reopen ticket** — Permiso existe pero no endpoint
3. **Traspasos de inventario** — No implementado
4. **Inventario físico** — No implementado
5. **Kardex** — No implementado
6. **UI de reportes** — Endpoints existen pero no hay tab en AdminView
7. **UI de caja** — No hay vista de caja en frontend
8. **Export CSV/XLSX/PDF** — No implementado
9. **WebSocket auth por recurso** — Cualquier usuario puede unirse a ticket:<id>
10. **PostgreSQL** — Solo SQLite
11. **Android/Capacitor** — No existe
12. **Push UX + tests** — Sin botón activar, sin tests
13. **Offline orden + tests** — Sin garantías de orden, sin tests
14. **Backup drill** — No probado restore
15. **Printer hardware gate** — No probado con impresora física

### 🟡 Gaps parciales (deuda técnica)

1. **TicketNumber via Numerators** — No usa la tabla Numerators
2. **OrderNumber secuencial** — No se asigna
3. **Merma** — WASTE type existe pero sin endpoint/UI
4. **Recetas versionadas** — No implementado
5. **Combos** — No implementado
6. **Install prompt visible** — pwa.js captura pero no hay botón
7. **Structured logs** — Parcial (console.log con JSON)
8. **Alerts** — No implementado
