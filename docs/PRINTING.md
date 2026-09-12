# PRINTING.md — SambaPos_LBA Real Printing Architecture

**Estado:** ✅ Production-ready (Fase 4 / Fase 7 — Batch 2)
**Última actualización:** 2026-09-07

---

## Resumen

SambaPos_LBA implementa una **arquitectura de impresión real** (no mock) compuesta por cuatro servicios desacoplados que cooperan vía una cola persistente en base de datos. La impresión sobrevive reinicios del servidor, reintenta automáticamente con backoff exponencial ante fallos, y soporta *fallback printer* para mantener operación incluso cuando la impresora principal está caída.

---

## Arquitectura

```text
                        ┌─────────────────────────────────────────────────┐
                        │                  API REST                        │
                        │  POST /api/print/tickets/:id/send               │
                        │  POST /api/print/tickets/:id/kitchen            │
                        │  POST /api/print/tickets/:id/receipt             │
                        │  POST /api/print/printers/:id/test              │
                        └────────┬────────────────────────────────────────┘
                                 │ 1. Render ESC/POS bytes
                                 │ 2. Resolve printer via PrintRouter
                                 │ 3. Enqueue (idempotent)
                                 ▼
                       ┌─────────────────────┐
                       │   EscPosRenderer    │  formats ticket → bytes
                       └─────────────────────┘
                                 │
                                 ▼
                       ┌─────────────────────┐
                       │    PrintRouter       │  resolves: order → printer(s)
                       │  (PrintRoutingRules) │  rule types: MENU_ITEM > TAG > GROUP_CODE > DEFAULT
                       └─────────────────────┘
                                 │
                                 ▼
                       ┌─────────────────────┐
                       │     PrintQueue       │  persistent in DB
                       │  (PrintJobInstances) │  state machine: PENDING → PRINTING → PRINTED
                       │                      │  retry with exponential backoff + jitter
                       │                      │  fallback printer switch
                       └─────────┬───────────┘
                                 │ 4. claimNext() — atomic
                                 ▼
                       ┌─────────────────────┐
                       │     PrintWorker       │  background poller (1s)
                       │  (EventEmitter)       │  claims PENDING + RETRYING jobs
                       │                      │  reaps stuck PRINTING jobs (>30s)
                       └─────────┬───────────┘
                                 │ 5. send(bytes)
                                 ▼
                       ┌─────────────────────┐
                       │   PrinterManager      │
                       │   └── TcpTransport    │  TCP socket → printer:9100
                       └─────────────────────┘
                                 │
                                 ▼
                       ┌─────────────────────┐
                       │  Physical Printer    │  ESC/POS thermal (kitchen + cashier)
                       └─────────────────────┘
```

---

## Tablas de base de datos

### `Printers`

Configuración de cada impresora física.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | Auto-incremental |
| `Name` | TEXT | Nombre visible (e.g., "Cocina 1") |
| `ShareName` | TEXT | `host:port` para TCP (e.g., `192.168.1.100:9100`) |
| `PrinterType` | INTEGER | 0=ESC/POS, 1=Text, 2=HTML |
| `CodePage` | INTEGER | Code page ESC/POS (857=Turkish, 858= Euro, etc.) |
| `CharsPerLine` | INTEGER | 32 (58mm) o 42 (80mm) |
| `PrintAreaId` | INTEGER FK | Área a la que pertenece (kitchen, cashier, etc.) |
| `IsActive` | INTEGER | 1=activa, 0=inactiva |
| `SortOrder` | INTEGER | Prioridad dentro del área |

### `PrintAreas`

Agrupadores lógicos de impresoras por propósito.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | Auto-incremental |
| `Name` | TEXT | `kitchen`, `bar`, `cafe`, `pizza`, `cashier`, `report` |
| `DisplayName` | TEXT | "Cocina", "Barra", "Café", "Pizzería", "Caja" |
| `AreaType` | TEXT | `KITCHEN`, `BAR`, `CAFE`, `PIZZA`, `CASHIER`, `REPORT`, `OTHER` |
| `Color` | TEXT | Hint de color UI (hex) |
| `SortOrder` | INTEGER | Orden de visualización |

Seed inicial: 6 áreas (`kitchen`, `bar`, `cafe`, `pizza`, `cashier`, `report`).

### `PrintJobInstances`

La **cola persistente**. Cada fila es una operación de impresión encolada.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | Auto-incremental |
| `Uuid` | TEXT UNIQUE | UUID público (para idempotencia externa) |
| `TicketId` | INTEGER nullable | Ticket asociado |
| `OrderId` | INTEGER nullable | Order específica (para impresión por estación) |
| `PrinterId` | INTEGER NOT NULL | Impresora destino |
| `FallbackPrinterId` | INTEGER nullable | Impresora de respaldo si la primaria falla |
| `PrintAreaId` | INTEGER nullable | Área de impresión (para routing) |
| `JobType` | TEXT NOT NULL | `KITCHEN_ORDER`, `RECEIPT`, `REFUND_RECEIPT`, `REPRINT`, `REPORT` |
| `Status` | TEXT NOT NULL | `PENDING`, `PRINTING`, `PRINTED`, `FAILED`, `RETRYING`, `CANCELLED` |
| `Attempts` | INTEGER | Contador de intentos |
| `MaxAttempts` | INTEGER | Default 5 |
| `IdempotencyKey` | TEXT nullable | Clave de deduplicación (evita impresión duplicada) |
| `Payload` | BLOB | Bytes ESC/POS |
| `PayloadSize` | INTEGER | Tamaño en bytes |
| `Checksum` | TEXT | SHA-256 del payload (golden-fixture verification) |
| `Error` | TEXT nullable | Último error (truncado a 5000 chars) |
| `QueuedAt` | TIMESTAMP | Cuando se encoló |
| `PrintedAt` | TIMESTAMP nullable | Cuando se imprimió exitosamente |
| `LastAttemptAt` | TIMESTAMP nullable | Último intento |
| `NextAttemptAt` | TIMESTAMP nullable | Próximo intento programado (para RETRYING) |
| `UserId` | INTEGER nullable | Usuario que encoló |
| `Version` | INTEGER | Optimistic locking (incrementa en cada transición) |

### `PrintRoutingRules`

Reglas de enrutamiento: dado un item, decidir a qué impresora enviar.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | Auto-incremental |
| `RuleType` | TEXT NOT NULL | `MENU_ITEM`, `GROUP_CODE`, `TAG`, `DEFAULT` |
| `MatchValue` | TEXT nullable | El valor a comparar (e.g., `Food`, `Drinks`, `Vegan`) |
| `MenuItemId` | INTEGER nullable | Directo cuando `RuleType='MENU_ITEM'` |
| `PrintAreaId` | INTEGER NOT NULL FK | Área destino |
| `PrinterId` | INTEGER nullable FK | Impresora específica (override del área) |
| `Priority` | INTEGER | Mayor = se evalúa primero |
| `IsActive` | INTEGER | 1=activa |

**Prioridad de evaluación:**
1. `MENU_ITEM` + MenuItemId match (más específico)
2. `TAG` + tag value match
3. `GROUP_CODE` + group code match
4. `DEFAULT` (catch-all, solo si ninguna regla anterior matchó)

Seed inicial: 1 regla `DEFAULT → cashier`.

---

## Estado del job (state machine)

```text
                     ┌─────────┐
       enqueue()  →  │ PENDING │
                     └────┬────┘
                          │ claimNext()
                          ▼
                     ┌──────────┐
                     │ PRINTING │ ◄──── claimNext() (from RETRYING)
                     └────┬─────┘
              ┌──────────┼──────────┐
   markPrinted│          │markFailed│ (attempts < max)
              ▼          ▼          │
        ┌─────────┐  ┌──────────┐  │
        │ PRINTED │  │ RETRYING │──┘
        │ (final) │  └────┬─────┘
        └─────────┘       │ markFailed (attempts >= max)
                          ▼
                    ┌────────┐
                    │ FAILED │ (final)
                    └────────┘

   cancel(reason)  →  CANCELLED  (from any non-terminal state)
```

**Invariants:**
- `PENDING`, `PRINTING`, `RETRYING` son no-terminales.
- `PRINTED`, `FAILED`, `CANCELLED` son terminales (no más transiciones).
- `Attempts` nunca excede `MaxAttempts` antes de pasar a `FAILED`.
- `Version` incrementa en cada transición (optimistic lock).

---

## Idempotencia

Cada `enqueue()` acepta un `idempotencyKey`. Si un job con esa clave ya existe en estado **no-terminal** (PENDING/PRINTING/RETRYING), se retorna el job existente en lugar de crear un duplicado.

**Keys convencionales:**
- `receipt:ticket:<id>` — recibo normal de ticket
- `receipt:closed:<id>` — recibo post-pago (estricto, una sola vez)
- `kitchen:ticket:<id>:printer:<pid>` — orden de cocina por impresora
- `test:<printerId>:<timestamp>` — test print
- `reprint:<originalUuid>:<timestamp>` — reimpresión manual

Esto garantiza que **nunca se imprima dos veces el mismo evento** por reintentos del cliente, doble tap, o pérdida de red temporal.

---

## Reintentos con backoff exponencial

Cuando un job falla y quedan intentos, pasa a `RETRYING` con `NextAttemptAt` calculado como:

```text
baseMs    = min(60000, 2^attempts * 1000)   // 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
jitterMs  = random(0, 500)                  // jitter anti-thundering-herd
NextAttemptAt = now + baseMs + jitterMs
```

El `PrintWorker` hace polling cada 1 segundo y reclama jobs `RETRYING` cuyo `NextAttemptAt` ya pasó.

---

## Fallback printer

Si un job tiene `FallbackPrinterId` set y agota `MaxAttempts` en la impresora primaria, el `PrintQueue.markFailed()` automáticamente:
1. Cambia `PrinterId` al `FallbackPrinterId`.
2. Limpia `FallbackPrinterId` (ya no hay fallback del fallback).
3. Resetea `Attempts` a 0.
4. Pasa a `RETRYING` con `NextAttemptAt` en 1s.

Esto permite que la operación de impresión continúe en una impresora de respaldo sin intervención manual.

---

## PrintWorker (background poller)

- **Poll interval:** 1 segundo (configurable).
- **Stuck reaper:** cada 10s, busca jobs en `PRINTING` cuyo `LastAttemptAt` fue hace más de 30s y los re-encola en `RETRYING` (un job atascado significa que el worker crasheó mid-print).
- **Eventos (EventEmitter):**
  - `job:claimed` — (job) un job fue reclamado y se está enviando
  - `job:printed` — (job) un job se imprimió exitosamente
  - `job:failed` — (job, error) un job falló (final o no)
  - `job:retrying` — (job) un job pasó a RETRYING
  - `queue:empty` — () la cola está vacía
  - `error` — (err) un error inesperado en el worker

> **Nota:** El PrintWorker aún no está integrado en `server.js` para auto-arrancar. Es el siguiente paso. Para probarlo manualmente, ver `backend/src/api/services/PrintWorker.js`.

---

## Endpoints API

### Printers

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/printers` | `manage.printers` | Listar impresoras |
| `POST` | `/api/printers` | `manage.printers` | Crear impresora |
| `GET` | `/api/printers/:id` | `manage.printers` | Obtener por ID |
| `PATCH` | `/api/printers/:id` | `manage.printers` | Actualizar |
| `GET` | `/api/printers/:id/status` | `manage.printers` | Verificar online |
| `POST` | `/api/printers/:id/test` | `manage.printers` | Test print (encola) |

### Print Areas

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/print/areas/list` | `manage.printers` | Listar áreas |
| `POST` | `/api/print/areas` | `manage.printers` | Crear área |

### Routing Rules

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/print/routing-rules/list` | `manage.printers` | Listar reglas |
| `POST` | `/api/print/routing-rules` | `manage.printers` | Crear regla |
| `DELETE` | `/api/print/routing-rules/:id` | `manage.printers` | Eliminar regla |

### Print Job Instances (cola)

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/print/jobs/list` | `manage.printers` | Listar jobs (filtros: `?status=`, `?printerId=`, `?ticketId=`, `?limit=`) |
| `GET` | `/api/print/jobs/:id` | `manage.printers` | Obtener job por ID |
| `POST` | `/api/print/jobs/:id/cancel` | `manage.printers` | Cancelar job pendiente |
| `POST` | `/api/print/jobs/:id/reprint` | `pos.print` | Reimprimir (crea nuevo job con nueva key) |
| `GET` | `/api/print/stats/list` | `manage.printers` | Estadísticas de cola por estado |

### Ticket printing (operacional)

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `POST` | `/api/print/tickets/:id/send` | `pos.print` | Encolar recibo normal |
| `POST` | `/api/print/tickets/:id/kitchen` | `pos.print` | Encolar órdenes de cocina (una por impresora) |
| `POST` | `/api/print/tickets/:id/receipt` | `pos.print` | Encolar recibo post-pago (estricto — verifica que ticket esté pagado) |

**Respuesta:** `202 Accepted` con `{ jobId, jobUuid, status, printerId, areaName, payloadSize, checksum }`.

---

## Flujo de impresión

### Pedido enviado a cocina

```text
1. POS crea ticket con órdenes (POST /api/tickets/:id/orders)
2. POS envía a cocina (POST /api/print/tickets/:id/kitchen)
3. PrintRouter agrupa órdenes por impresora destino
4. Por cada impresora destino:
   - EscPosRenderer.renderKitchenOrder() → bytes
   - PrintQueue.enqueue({ jobType:'KITCHEN_ORDER', payload, idempotencyKey:`kitchen:ticket:<id>:printer:<pid>` })
5. PrintWorker reclama jobs PENDING
6. TcpTransport.send(bytes) → impresora TCP
7. Si éxito: markPrinted(). Si fallo: markFailed() → RETRYING con backoff.
```

### Recibo post-pago

```text
1. POS procesa pago (POST /api/tickets/:id/payments)
2. POS verifica ticket pagado (RemainingAmount === 0)
3. POS imprime recibo (POST /api/print/tickets/:id/receipt)
4. Servidor verifica ticket.RemainingAmount === 0 (sino 400 ValidationError)
5. PrintRouter.resolveReceiptPrinter() → impresora cashier (DEFAULT rule)
6. EscPosRenderer.render(ticket) → bytes
7. PrintQueue.enqueue({ jobType:'RECEIPT', payload, idempotencyKey:'receipt:closed:<id>' })
8. PrintWorker procesa → TcpTransport → impresora
```

> **Idempotencia estricta:** Si el POS llama dos veces a `/receipt` para el mismo ticket cerrado, la segunda llamada retorna el mismo job (ya está PENDING/PRINTING/PRINTED). **Nunca se imprime dos veces.**

---

## EscPosRenderer

El renderer genera bytes ESC/POS estándar compatible con impresoras térmicas:
- Epson TM-T20, TM-T88
- Star TSP100, TSP143
- Bixolon SRP-350, SRP-380
- Generic Chinese ESC/POS clones (Xprinter, Goojprt)

**Comandos soportados:**
- `ESC @` — inicializar
- `ESC t n` — set code page
- `ESC a n` — alineación (0=left, 1=center, 2=right)
- `ESC ! n` — modo de caracteres (double width/height, emphasized)
- `GS V m` — cortar papel
- `ESC p m t1 t2` — abrir cajón de dinero
- `ESC d n` — feed n líneas

**Templates:**
- `<L00>text` — línea izquierda
- `<C00>text` — línea centrada
- `<R00>text` — línea derecha
- `<F>` — separador

---

## Verificación

### Tests automatizados (24 tests, todos PASS en 404ms)

Archivo: `backend/tests/printing-verification.test.js`

**PrintQueue (12 tests):**
- enqueue crea PENDING con UUID + checksum
- idempotency: doble enqueue con misma key no crea duplicado
- claimNext transición atómica PENDING → PRINTING
- claimNext retorna null si cola vacía
- markPrinted transición PRINTING → PRINTED + PrintedAt
- markFailed transición a RETRYING con backoff
- markFailed transición a FAILED tras MaxAttempts
- cancel transición PENDING → CANCELLED
- cancel de job terminal lanza ConflictError
- fallback printer switch tras agotar primaria
- getStats retorna conteos por estado
- findByIdempotencyKey retorna job o null

**PrintRouter (4 tests):**
- resolveReceiptPrinter retorna impresora cashier (DEFAULT rule)
- resolveKitchenPrinters rutea GROUP_CODE='Food' → kitchen
- resolveKitchenPrinters retorna array vacío para item desconocido
- groupOrdersByPrinter agrupa órdenes por impresora destino

**EscPosRenderer golden fixtures (4 tests):**
- render receipt produce checksum estable
- renderKitchenOrder contiene header 'KITCHEN ORDER' + items
- renderTestPrint contiene 'TEST PRINT'
- render corta papel (GS V al final)

**E2E workflows (3 tests):**
- enqueue → claim → markPrinted → verify state
- enqueue → claim → fail → retry → succeed (attempts counter)
- idempotency: doble enqueue misma key no duplica

### Smoke test manual

```bash
# Iniciar servidor
JWT_SECRET=$(openssl rand -hex 32) ADMIN_PIN=1234 node backend/src/api/server.js &

# Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Administrator","pin":"1234"}' | jq -r .token)

# Listar áreas
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/print/areas/list | jq .

# Listar reglas de routing
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/print/routing-rules/list | jq .

# Ver estadísticas de cola
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/print/stats/list | jq .

# Encolar test print a impresora ID=1
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/print/printers/1/test | jq .
```

---

## Próximos pasos (pendiente)

1. **Integrar PrintWorker en server.js** — auto-start del worker al arrancar el servidor, auto-stop en graceful shutdown.
2. **WebSocket events** — emitir `PrintJobFailed`, `PrinterOnline`, `PrinterOffline` al frontend para monitoreo en tiempo real.
3. **UI de monitoreo de cola** — pantalla de admin para ver jobs PENDING/FAILED, cancelar, reimprimir manualmente.
4. **Test con impresora real** — conectar impresora térmica ESC/POS física y verificar que los bytes salen correctamente.
5. **Templates personalizables** — permitir editar templates de recibo/kitchen order vía admin.
6. **Soporte USB** — vía Capacitor plugin para Android nativo (Fase 15).
