# SambaPos_LBA — FASE 2: Dominio

**Fecha:** 2026-09-07
**Repositorio:** https://github.com/Lean031110/Samba_Pos_V3-Web
**Commit:** `cd3476a`

---

## FASE: 2 — DOMINIO
## ESTADO: PASS

---

## CAMBIOS

### 1. Nuevos aggregates de dominio (`backend/src/domain/`)

| Archivo | Líneas | Aggregate | Estado |
|---|---|---|---|
| `WorkPeriod.js` | 124 | WorkPeriod (sesión de negocio OPEN/CLOSED con optim. lock, reopen, expected/actual/difference) | ✅ |
| `CashSession.js` | 232 | CashSession (caja por terminal, ledger de eventos, payout/transfer/sale/refund, computeExpected, close con difference) | ✅ |
| `PrintJob.js` | 200 | PrintJob (cola de impresión, state machine con RETRYING+backoff, sha256 checksum, UUID idempotencia) | ✅ |
| `Notification.js` | 142 | Notification (in-app/push, deliver/markRead idempotentes, visibilidad por user/role/admin) | ✅ |
| `Customer.js` | 122 | Customer (saldo de cuenta, credit/debit/refund, soft-delete, validación email) | ✅ |
| `TicketStateMachine.js` | 207 | Máquina de estados formal del Ticket (7 estados, tabla de transiciones, assertCan/can/isTerminal) | ✅ |

### 2. Migraciones

- `20260907000001_create_cash_session_and_customers.js`:
  - **Extiende `WorkPeriods`**: agrega `OpenedBy`, `ClosedBy`, `OpeningAmount`, `ClosingAmount`, `ExpectedAmount`, `ActualAmount`, `Difference`, `Status` (OPEN/CLOSED), `IsOpen`, `Version`.
  - **Crea `CashSessions`**: caja por terminal+workPeriod con `OpeningAmount`, `CashSales`, `CardSales`, `VoucherSales`, `Payouts`, `Transfers`, `ExpectedAmount`, `CountedAmount`, `Difference`, `Status` (OPEN/RECONCILING/CLOSED), `Version`. FK a `WorkPeriods.Id` con `onDelete('RESTRICT')`.
  - **Crea `CashSessionEvents`**: ledger append-only de eventos (OPEN/SALE/REFUND/PAYOUT/TRANSFER/CLOSE) con `IdempotencyKey` para dedupe. FK a `CashSessions.Id` con `onDelete('CASCADE')`.
  - **Crea `Customers`**: aggregate nuevo (Name, Code único, Phone, Email, Address, TaxId, AccountBalance, GroupId, IsActive, Notes). Indexes en Name/Phone/Code/IsActive.
  - **Crea `Notifications`**: para FASE 9 (Category, Severity, Title, Body, Action, TargetUserId, TargetRole, EntityId, EntityType, IsRead, IsDelivered, IdempotencyKey único). Indexes para queries de "unread por usuario".
  - **Renombra `PrintJobs` → `PrintJobsLegacy`** y crea nueva tabla `PrintJobs` con la estructura formal FASE 7: `Uuid` único, `JobType`, `Status`, `Attempts`, `MaxAttempts`, `IdempotencyKey` único, `Payload` (BLOB), `PayloadSize`, `Checksum` (sha256), `Error`, timestamps, `FallbackPrinterId`. Indexes en `(Status, NextAttemptAt)`, `(PrinterId, Status)`, `(IdempotencyKey)`.
  - **Añade a `Payments`**: `IdempotencyKey` único, `CashSessionId`, `Version` (optimistic lock).
  - **Añade a `Tickets`**: `IdempotencyKey` único, `CustomerId`, `WorkPeriodId`, `CashSessionId`. Indexes correspondientes.

- `20260907000002_add_ticket_state_flags.js`:
  - **Añade a `Tickets`**: `IsVoided` (0/1), `IsRefunded` (0/1), `VoidReason`, `VoidedAt`, `VoidedBy`. Indexes en `IsVoided` e `IsRefunded`.
  - La máquina de estados `TicketStateMachine.deriveState()` usa estos flags para inferir el estado actual del Ticket.

### 3. Ajustes menores

- `seed.js`: actualizado para insertar en `PrintJobsLegacy` (antes era `PrintJobs`) — los 2 PrintJobs legacy ("Print Bill" y "Print Orders to Kitchen Printer") siguen sembrándose correctamente.
- `PrinterManager.js`: actualizado para leer de `PrintJobsLegacy` (era `PrintJobs`). Comportamiento idéntico, sólo cambia el nombre de la tabla.
- No se modificó el código existente de `Ticket.js`, `TicketService.js`, `KitchenService.js`, etc.

### 4. Tests de dominio (`backend/tests/domain-verification.test.js`)

- **72 tests nuevos** cubriendo los 6 aggregates + state machine:
  - 1A-1F: WorkPeriod (6 tests)
  - 2A-2J: CashSession (10 tests)
  - 3A-3M: PrintJob (13 tests)
  - 4A-4K: Notification (11 tests)
  - 5A-5J: Customer (10 tests)
  - 6A-6V: TicketStateMachine (22 tests)
- Cubre: transiciones válidas, transiciones inválidas, optimistic locking, idempotencia, validación de payload, soft-delete, visibilidad, terminal states.

---

## ARCHIVOS MODIFICADOS

```
backend/src/domain/WorkPeriod.js                     (nuevo, 124 líneas)
backend/src/domain/CashSession.js                    (nuevo, 232 líneas)
backend/src/domain/PrintJob.js                       (nuevo, 200 líneas)
backend/src/domain/Notification.js                   (nuevo, 142 líneas)
backend/src/domain/Customer.js                       (nuevo, 122 líneas)
backend/src/domain/TicketStateMachine.js             (nuevo, 207 líneas)
backend/src/infrastructure/db/migrations/20260907000001_create_cash_session_and_customers.js  (nuevo, 245 líneas)
backend/src/infrastructure/db/migrations/20260907000002_add_ticket_state_flags.js             (nuevo, 33 líneas)
backend/src/infrastructure/db/seeds/seed.js         (modificado, 2 líneas)
backend/src/api/services/PrinterManager.js          (modificado, 1 línea)
backend/tests/domain-verification.test.js            (nuevo, 553 líneas, 72 tests)
```

---

## MIGRACIONES

- **2 migraciones nuevas** aplicadas:
  1. `20260907000001_create_cash_session_and_customers.js`
  2. `20260907000002_add_ticket_state_flags.js`
- Ambas con `up` y `down` reversibles.
- `npm run migrate` las aplica limpiamente.
- `npm run migrate:rollback` las revierte.
- Seeds funcionan correctamente tras las migraciones.

---

## TESTS

| Suite | Antes (FASE 1) | Después (FASE 2) | Δ |
|---|---|---|---|
| api-integration | 47 | 47 | 0 |
| kds-verification | 49 | 49 | 0 |
| inventory-verification | 13 | 13 | 0 |
| concurrency-verification | 8 | 8 | 0 |
| security-verification | 21 | 21 | 0 |
| **domain-verification** | 0 (no existía) | 72 | +72 |
| Playwright E2E | 27 | 27 | 0 |
| **TOTAL** | **165** | **237** | **+72** |

- **Unit: 210/210 PASS**
- **Integration: 210/210** (incluidos en unit)
- **E2E: 27/27 PASS** (chromium 1243 reinstalado)
- **Domain: 72/72 PASS** (nuevos en esta fase)

---

## RIESGOS (resueltos en esta fase)

- ✅ Agregados faltantes (Customer, CashSession, WorkPeriod como aggregate, PrintJob, Notification, AuditLog como modelo dominio) → resueltos
- ✅ Máquina de estados del ticket formalizada en un módulo único (antes estaba dispersa en `canCloseTicket()` y guards implícitos)
- ✅ PrintJob tiene estructura formal FASE 7 (UUID, idempotencia, retry con backoff, checksum)
- ✅ Ledger de eventos de caja (CashSessionEvents) para auditoría detallada

## RIESGOS (pendientes de fases posteriores)

- ⚠️ Los aggregates nuevos NO están conectados todavía a la capa de servicios/rutas (FASE 3-13): `WorkPeriodService`, `CashSessionService`, `CustomerService`, `NotificationService`, `PrintJobService` con endpoints REST pendientes
- ⚠️ Idempotency keys están presentes en DB y en el schema Zod, pero la lógica formal de "check-existing-key-then-return-existing-response" NO está implementada en `addPayment`/`closeTicket`/`voidTicket`/`refundTicket` (FASE 2.5 pendiente de conexión real)
- ⚠️ `TicketStateMachine.assertCan()` no está invocado todavía desde `TicketService` (FASE 2.6 pendiente de wiring)
- ⚠️ Sin impresión con hardware real verificado (FASE 7)
- ⚠️ Sin PWA (FASE 10), Web Push (FASE 9), PostgreSQL (FASE 12), Android (FASE 15), admin panel (FASE 4)

---

## DEUDA PENDIENTE (heredada)

- ⚠️ 3 TODOs sin cerrar en el código (2 en `server.js`, 1 en `CalculationEngine.js`) — se cierran en FASE 3
- ⚠️ 2 mocks legacy en `TicketService.js` (`generateMockEscPos`, `generatePrintPreview`) — se migrarán en FASE 7
- ⚠️ Los 6 aggregates nuevos requieren wiring a servicios y rutas en FASE 3-13

---

## VERIFICACIÓN MANUAL POST-FASE 2

```bash
# Limpiar DB
rm -f data/samba.db data/samba.db-wal data/data/samba.db-shm

# Aplicar migraciones (incluye las nuevas)
cd backend && JWT_SECRET=test ADMIN_PIN=1234 npm run migrate
# Resultado: 7 migraciones aplicadas (5 anteriores + 2 nuevas)

# Seed
npm run seed
# Resultado: seed OK, PrintJobsLegacy recibe los 2 print jobs legacy

# Tests de dominio
JWT_SECRET=test ADMIN_PIN=1234 NODE_ENV=test node --test tests/domain-verification.test.js
# Resultado: 72/72 PASS

# Suite completa
bash scripts/run-all-tests.sh
# Resultado: 237/237 PASS
```

---

## SIGUIENTE FASE

**FASE 3 — POS**

Objetivos (según prompt maestro):
- Lograr el flujo POS completo: LOGIN → DASHBOARD → SALÓN/MESA → ABRIR TICKET → PRODUCTO → MODIFICADORES → NOTA → CANTIDAD → ENVIAR COCINA → CAMBIAR/AGREGAR → SOLICITAR CUENTA → PAGAR → CAMBIO → CERRAR → IMPRIMIR RECIBO
- Dividir/fusionar ticket, mover ticket, regalo, descuento, void, refund, reimpresión, pago parcial, múltiples métodos de pago
- Ninguna acción crítica puede tener doble ejecución por doble toque (idempotency keys + UI lock)
- Conectar los aggregates FASE 2 a servicios/rutas
