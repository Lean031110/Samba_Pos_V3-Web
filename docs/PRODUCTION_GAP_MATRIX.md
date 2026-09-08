# PRODUCTION_GAP_MATRIX.md — Matriz de gaps hacia producción

**Fecha:** 2026-09-08
**Commit:** `9107500`
**Baseline:** docs/BASELINE_PRODUCTION_AUDIT.md

---

## Cómo leer esta matriz

- **Función:** capacidad de negocio requerida por la guía maestra
- **Referencia V3:** archivo/clase de SambaPOS V3 que implementa esta función
- **SambaPos_LBA:** estado actual en nuestro repositorio
- **Gap:** lo que falta para cerrar la brecha
- **Prioridad:** P0 (bloquea producción), P1 (importante), P2 (mejora)
- **Bloque:** en qué bloque del orden de trabajo se debe cerrar

---

## Gaps por bloque

### BLOQUE B — Fase 2: Dominio

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Move orders | `TicketService.MoveOrders()` | ❌ No implementado | Implementar moveOrders(ticketId, orderIds, targetTicketId) | P0 | B |
| Transfer orders | `TicketService.MoveOrders()` | ❌ No implementado | Igual que move pero a ticket nuevo | P1 | B |
| Reopen ticket | `TicketService.ReopenTicket()` | ❌ Permiso existe, sin endpoint | POST /api/tickets/:id/reopen con guard IsClosed=false + audit | P1 | B |
| TicketNumber via Numerators | `Numerators` table | ⚠️ Auto-generado sin Numerators | Usar Numerators table para secuencia por tipo | P2 | B |
| OrderNumber secuencial | `Order.OrderNumber` | ⚠️ No asignado | Asignar en addOrder | P2 | B |
| AddChangePayment | `TicketService.AddChangePayment()` | ⚠️ ChangePayments existe pero sin endpoint | Implementar POST /api/tickets/:id/change | P1 | B |

### BLOQUE C — Fase 3: Administración

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Users CRUD | `UserModule` | ❌ Sin endpoints | GET/POST/PATCH/DELETE /api/users | P0 | C |
| Roles CRUD | `UserRoles` + `RolePermissions` | ❌ Sin endpoints | GET/POST /api/roles + assign permissions | P0 | C |
| Terminals | `Terminals` table | ❌ Sin endpoints | GET/POST /api/terminals | P1 | C |
| Departments | `Departments` table | ❌ Sin endpoints | GET/POST /api/departments | P1 | C |
| Tables CRUD | `Entities` + `EntityScreens` | ⚠️ Solo GET | POST/PATCH/DELETE /api/tables | P1 | C |
| Payment types | `PaymentTypes` table | ❌ Sin endpoints | GET/POST /api/payment-types | P1 | C |
| Tax templates | `TaxTemplates` table | ❌ Sin endpoints | GET/POST /api/tax-templates | P2 | C |
| Settings | `ProgramSettings` table | ❌ Sin endpoints CRUD | GET/PUT /api/settings | P1 | C |
| Audit log viewer | `AuditLogs` table | ❌ Sin endpoint de consulta | GET /api/audit-logs | P2 | C |

### BLOQUE D — Fase 4: Inventario + Recetas

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Traspasos | `WarehouseConsumptions` | ❌ No implementado | POST /api/inventory/transfer + StockMovements TRANSFER_OUT/IN | P0 | D |
| Inventario físico | `PeriodicConsumptions` | ❌ No implementado | POST /api/inventory/physical-count + ajustes automáticos | P1 | D |
| Merma | WASTE movement type | ⚠️ Type existe, sin endpoint | POST /api/inventory/waste | P1 | D |
| Kardex | Report en `BasicReports` | ❌ No implementado | GET /api/inventory/kardex?ingredientId=&from=&to= | P1 | D |
| Recetas versionadas | `Recipes.Version` (no existe en V3) | ❌ No implementado | Añadir Version column + historial | P2 | D |
| Combos | `ScreenMenuItems` con sub-items | ❌ No implementado | Tabla ComboItems + lógica de precio | P2 | D |

### BLOQUE E — Fase 5: Cocina/KDS

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Gate: POS→KDS tiempo real | N/A | ⚠️ Evento existe, sin E2E | Test E2E que verifique: crear pedido en POS → aparece en KDS sin refresh | P0 | E |
| Reimpresión KDS | PrintJob | ✅ Existe endpoint | Verificar que reimprime correctamente | P2 | E |

### BLOQUE F — Fase 6: Printer Gateway

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Gate: hardware real | Windows spooler | TCP socket | Probar con impresora térmica física (o driver real) | P0 | F |
| Print templates editables | `PrinterTemplates.Template` | ❌ Sin editor | UI para editar templates de recibo/cocina | P2 | F |

### BLOQUE G — Fase 7: PWA

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Install prompt visible | N/A | ❌ Sin botón | Botón "Instalar app" en Admin/Configuración | P0 | G |

### BLOQUE H — Fase 8: Push

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| UX activación | N/A | ❌ Sin UI | Tab "Notificaciones" en Admin/Config con botón activar | P0 | H |
| Tests push | N/A | ❌ 0 tests | Subscribe, unsubscribe, send, expire, polling | P0 | H |
| Gate E2E push | N/A | ❌ No probado | Cerrar pestaña, enviar push, verificar recepción | P1 | H |

### BLOQUE I — Fase 9: Offline

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Orden de operaciones | N/A | ❌ No garantizado | Ordenar outbox: ticket→orders→payment→close | P0 | I |
| JWT expirado | N/A | ❌ No manejado | Detectar 401 durante sync, pausar, notificar usuario | P0 | I |
| Tests offline | N/A | ❌ 0 tests | Enqueue, retry, conflict, order, JWT | P0 | I |
| Gate E2E offline | N/A | ❌ No probado | Desconectar, operar, reconectar, verificar 0 duplicados | P1 | I |

### BLOQUE J — Fase 10: PostgreSQL + Producción

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| PostgreSQL driver | N/A (desktop) | ❌ SQLite only | knexfile.js production con pg | P0 | J |
| Migraciones compatibles | N/A | ⚠️ SQLite-specific | Verificar que todas las migraciones sean compatibles con PG | P0 | J |
| Backup rotation | N/A | ❌ Básico | Rotación automática + retención + validación | P1 | J |
| Restore drill | N/A | ❌ No probado | Backup → destroy → install clean → restore → verify | P0 | J |
| Deployment docs | N/A | ⚠️ Parcial | Guía completa de instalación en máquina nueva | P1 | J |

### BLOQUE K — Fase 11: Android

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Capacitor | N/A | ❌ No existe | capacitor.config.json + wrapper | P1 | K |
| APK/AAB | N/A | ❌ No existe | Build pipeline + firma | P1 | K |

### BLOQUE L — Fase 12: UI final

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| UI de caja | `WorkperiodModule` | ❌ No existe | Vista de caja con apertura/cierre/payout | P1 | L |
| UI de reportes | `BasicReportsModule` | ❌ No existe | Tab "Reportes" en AdminView con selector de período | P1 | L |

### BLOQUE M — Fase 13: Release hardening

| Función | Referencia V3 | SambaPos_LBA | Gap | Prioridad | Bloque |
|---------|--------------|-------------|------|----------|--------|
| Dependency audit | N/A | ✅ npm audit 0 | Mantener | P0 | M |
| Security audit | N/A | ✅ gitleaks 0 | Mantener | P0 | M |
| Load test | N/A | ❌ No hecho | Stress test con artillery/k6 | P1 | M |
| Failure injection | N/A | ❌ No hecho | Caída DB, WebSocket, impresora | P1 | M |
| Backup/restore drill | N/A | ❌ No hecho | Backup → destroy → restore → verify | P0 | M |
| E2E completo | N/A | ✅ 27 tests | Ampliar cobertura | P1 | M |
| Browser smoke | N/A | ✅ Playwright | Mantener | P1 | M |
| PWA smoke | N/A | ⚠️ Parcial | Verificar instalación real | P1 | M |
| Printer smoke | N/A | ❌ No hecho | Probar con impresora física | P0 | M |
| Offline smoke | N/A | ❌ No hecho | Desconectar → operar → reconectar | P1 | M |

---

## Resumen por prioridad

| Prioridad | Cantidad | Descripción |
|-----------|----------|-------------|
| P0 | 18 | Bloquean producción — deben cerrarse antes de "PRODUCTION READY" |
| P1 | 18 | Importantes — deben cerrarse antes de release público |
| P2 | 8 | Mejoras — pueden posponerse |
