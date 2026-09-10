# BLOQUE D REPORT — Fase 4: Inventario + Recetas

**Fecha:** 2026-09-08
**Commit base anterior:** `835737a` (Bloque C — Admin CRUD)
**Bloque:** D — Fase 4 (Inventario + Recetas)
**Estado:** ✅ Completo

---

## Resumen ejecutivo

El Bloque D cierra **6 de los 6 gaps P0/P1/P2** identificados en `docs/PRODUCTION_GAP_MATRIX.md` para la Fase 4. Se implementan 4 nuevas capacidades de negocio (traspasos entre almacenes, inventario físico, kardex, recetas versionadas, combos) sin romper ninguna de las 305 pruebas unitarias existentes — añadiendo **34 nuevas pruebas** (total unit: **339**).

| Gap | Prioridad | Estado | Endpoints |
|-----|----------|--------|-----------|
| Traspasos entre almacenes | P0 | ✅ Cerrado | `POST /api/inventory/transfer`, `GET /transfers`, `GET /transfers/:id` |
| Inventario físico | P1 | ✅ Cerrado | `POST /api/inventory/physical-count`, `GET /physical-count`, `GET /physical-count/:id`, `PATCH /physical-count/:id/items/:ingredientId`, `POST /physical-count/:id/finalize` |
| Merma | P1 | ✅ Cerrado | `POST /api/inventory/waste` (con `reason` obligatorio) |
| Kardex | P1 | ✅ Cerrado | `GET /api/inventory/kardex?ingredientId=&warehouseId=&from=&to=` |
| Recetas versionadas | P2 | ✅ Cerrado | `GET /api/recipes/by-portion/:portionId/versions`, `POST /api/recipes/by-portion/:portionId/versions`, `POST /api/recipes/by-portion/:portionId/restore/:versionId` |
| Combos | P2 | ✅ Cerrado | `GET /api/combos`, `GET /api/combos/:id`, `GET /api/combos/by-menu-item/:menuItemId`, `POST /api/combos`, `PATCH /api/combos/:id`, `PUT /api/combos/:id/items`, `DELETE /api/combos/:id` |

---

## Cambios en la base de datos

### Migración nueva: `20260908000004_create_bloque_d_inventory_extensions.js`

**Tablas nuevas:**

| Tabla | Propósito |
|-------|-----------|
| `RecipeVersions` | Historial versionado de recetas (snapshot JSON inmutable) |
| `Combos` | Cabecera de combos (vincula MenuItem "contenedor" con sub-items) |
| `ComboItems` | Sub-items de un combo con precio override opcional |
| `WarehouseTransfers` | Cabecera de traspasos entre almacenes (PENDING/COMPLETED/CANCELLED) |
| `WarehouseTransferItems` | Líneas del traspaso (ingredientId, qty, unitCost) |
| `PhysicalCountSessions` | Sesión de inventario físico (wrapper UX sobre el esquema V3) |
| `PhysicalCountItems` | Líneas del conteo (ExpectedQuantity, CountedQuantity, Difference, Adjusted) |

**Columnas añadidas (additive ALTER TABLE):**

| Tabla | Columna | Tipo | Notas |
|-------|---------|------|-------|
| `Recipes` | `ActiveVersionId` | integer nullable | Apunta a la versión activa |
| `RecipeItems` | `VersionId` | integer nullable | Version-tag de cada línea (backward compat: null = v1 implícita) |

**Tablas existentes reutilizadas** (no modificadas):
- `PeriodicConsumptions` (esquema V3 original — `WorkPeriodId`, `StartDate`, `EndDate`, `LastUpdateTime`)
- `WarehouseConsumptions` (V3 — puente `PeriodicConsumptionId` × `WarehouseId`)
- `PeriodicConsumptionItems` (V3 — `InStock`, `Added`, `Removed`, `Consumption`, `PhysicalInventory`, `Cost`)

> **Decisión arquitectónica:** en lugar de duplicar el modelo `PeriodicConsumptions` del V3, añadimos `PhysicalCountSessions` como un wrapper ligero, desacoplado del `WorkPeriod`, para UX moderna de "conteo físico" sin forzar apertura de caja.

---

## Cambios en servicios

### `InventoryService.js` — nuevos métodos

| Método | Descripción |
|--------|-------------|
| `transferStock({fromWarehouseId, toWarehouseId, items, transferNumber?, notes?, userId?})` | Transfiere stock entre 2 almacenes. Valida: source≠target, stock suficiente. Genera `WT-{year}-{seq}` auto. Registra 2 movimientos por item (TRANSFER_OUT + TRANSFER_IN). |
| `getTransfer(transferId)` | Devuelve el traspaso + sus líneas con join a Ingredients + Units. |
| `listTransfers({status?, fromWarehouseId?, toWarehouseId?}, limit)` | Lista traspasos filtrados. |
| `recordWaste({ingredientId, warehouseId, unitId, quantity, reason, notes?, userId?})` | Merma dedicada — `quantity` positivo (negamos internamente). `reason` obligatorio. |
| `createPhysicalCountSession({warehouseId, name, userId})` | Crea sesión OPEN con items seeded desde StockBalances (Expected=Counted=current). |
| `setCountedQuantity(sessionId, ingredientId, countedQuantity, notes?)` | Idempotente — actualiza CountedQuantity + Difference. |
| `finalizePhysicalCountSession(sessionId, userId)` | Para cada item con Difference≠0 graba ADJUSTMENT movement. Marca Adjusted=1. Status=FINALIZED. |
| `getPhysicalCountSession(sessionId)` | Devuelve sesión + items. |
| `listPhysicalCountSessions({warehouseId?, status?}, limit)` | Lista sesiones. |
| `getKardex({ingredientId, warehouseId?, from?, to?})` | Devuelve ledger cronológico con `runningBalance` + `summary` agregado por tipo. Cumple estándar LATAM (PE/CO/MX). |

### `RecipeService.js` — nuevos métodos

| Método | Descripción |
|--------|-------------|
| `saveRecipeVersion(menuItemPortionId, items, fixedCost, label?, userId)` | Crea nueva versión (snapshot JSON inmutable), reemplaza RecipeItems con tag VersionId, actualiza Recipes.ActiveVersionId. |
| `getRecipeVersions(menuItemPortionId)` | Historial completo con snapshots parseados + flag isActive. |
| `restoreVersion(menuItemPortionId, versionId, label?, userId)` | Crea **nueva** versión copiando el snapshot — versiones son inmutables (auditoría). |

### `ComboService.js` — nuevo servicio

| Método | Descripción |
|--------|-------------|
| `createCombo({menuItemId, name, items, comboPrice, useCustomPrice, userId})` | Valida sub-items + portions. Inserta cabecera + items. |
| `getCombo(comboId)` | Devuelve combo completo con precios computados: `sumOfSubItems`, `effectivePrice`, `discount`. |
| `getComboByMenuItemId(menuItemId)` | Lookup por MenuItem contenedor. |
| `listCombos({isActive?, menuItemId?}, limit)` | Lista filtrada. |
| `updateCombo(comboId, updates)` | Update metadata (name, comboPrice, useCustomPrice, isActive). |
| `replaceItems(comboId, items)` | Reemplazo atómico de items. |
| `deactivateCombo(comboId)` | Soft delete. |

**Modelo de precios de combo:**
- `useCustomPrice=0` → `effectivePrice = Σ (OverridePrice > 0 ? OverridePrice : PortionPrice) × Quantity`
- `useCustomPrice=1` → `effectivePrice = Combos.ComboPrice`
- `discount = sumOfSubItems − effectivePrice`

---

## Cambios en rutas

### `routes/inventory.js` — 11 nuevos endpoints

```
POST   /api/inventory/transfer
GET    /api/inventory/transfers
GET    /api/inventory/transfers/:id
POST   /api/inventory/waste
POST   /api/inventory/physical-count
GET    /api/inventory/physical-count
GET    /api/inventory/physical-count/:id
PATCH  /api/inventory/physical-count/:id/items/:ingredientId
POST   /api/inventory/physical-count/:id/finalize
GET    /api/inventory/kardex
```

### `routes/recipes.js` — 3 nuevos endpoints

```
GET    /api/recipes/by-portion/:portionId/versions
POST   /api/recipes/by-portion/:portionId/versions
POST   /api/recipes/by-portion/:portionId/restore/:versionId
```

### `routes/combos.js` — nuevo archivo, 7 endpoints

```
GET    /api/combos
GET    /api/combos/by-menu-item/:menuItemId
GET    /api/combos/:id
POST   /api/combos
PATCH  /api/combos/:id
PUT    /api/combos/:id/items
DELETE /api/combos/:id
```

### `server.js` — 1 nuevo registro de router

```js
app.use('/api/combos', require('./routes/combos'));  // BLOQUE D — Fase 4
```

---

## Permisos RBAC utilizados

Los permisos ya existían en la migración `20260908000003_add_granular_permissions.js` (Bloque C):

| Permiso | Endpoints que lo usan |
|---------|----------------------|
| `inventory.view` | GET /transfers, GET /physical-count, GET /kardex, GET combos |
| `inventory.transfer` | POST /transfer |
| `inventory.adjust` | POST /waste, POST/PATCH /physical-count, POST /finalize |
| `manage.inventory` | POST /movements, POST /combos, PATCH/PUT/DELETE combos |
| `recipes.edit` | POST /recipes/by-portion/:portionId/versions, POST /restore |
| `recipes.view` | GET /recipes/by-portion/:portionId/versions |

**Admin role** recibe todos los permisos automáticamente (bloque C).

---

## Tests

### Archivo nuevo: `tests/bloque-d-verification.test.js` (34 tests)

| Suite | Tests | Verifica |
|-------|------:|----------|
| 1. Traspasos | 6 | Transferencia OUT/IN, validation source≠target, stock insuficiente, listing, get-by-id, movimientos en ledger |
| 2. Merma | 4 | POST /waste con reason, fallos por reason missing / qty negativo / stock insuficiente |
| 3. Inventario físico | 6 | Create session seeded, get with items, set counted qty, finalize + adjustments, idempotencia (no double-finalize), list |
| 4. Kardex | 7 | Running balance correcto, summary agregado por tipo, filtros warehouseId + fecha, errores 400/404 |
| 5. Recetas versionadas | 5 | Save v1/v2, history con snapshots, restore crea nueva versión, inmutabilidad |
| 6. Combos | 6 | Create, effectivePrice=sum (useCustomPrice=false), PATCH a customPrice + discount, list, replace items, soft delete |

### Suite completa de tests (post-Bloque D)

| Suite | Tests |
|-------|------:|
| api-integration | 47 |
| kds-verification | 49 |
| inventory-verification | 13 |
| concurrency-verification | 8 |
| idempotency-verification | 7 |
| idempotency-concurrency | 7 |
| domain-verification | 72 |
| security-verification | 21 |
| printing-verification | 24 |
| recipes-verification | 25 |
| refund-verification | 6 |
| unit-conversion | 14 |
| domain-extended | 12 |
| **bloque-d-verification** | **34** (nuevo) |
| **Total unit** | **339** (+34) |
| E2E (Playwright) | 27 |

---

## Auditoría de eventos publicados

| Evento | Origen | Uso futuro |
|--------|--------|-----------|
| `InventoryTransferred` | `transferStock` | Notificar admin en tiempo real (WebSocket) |
| `PhysicalCountFinalized` | `finalizePhysicalCountSession` | Push notification + report trigger |

---

## Cumplimiento de la guía maestra

| Requisito guía | Cumplido | Cómo |
|----------------|----------|------|
| Traspasos con `WarehouseConsumptions` | ✅ | Tabla `WarehouseTransfers` + `WarehouseTransferItems` (más explícito que el modelo V3, que no tenía tabla propia de transfer) |
| Inventario físico con `PeriodicConsumptions` | ✅ | Reutilizamos las tablas V3 + añadimos `PhysicalCountSessions` como wrapper UX |
| Merma con tipo `WASTE` | ✅ | Endpoint dedicado `POST /api/inventory/waste` con `reason` obligatorio |
| Kardex en `BasicReports` | ✅ | Implementado en `InventoryService.getKardex` (no como "reporte" porque es consulta de ledger, no reporte de ventas) |
| Recetas versionadas con `Version` column | ✅ | Tabla `RecipeVersions` con snapshot JSON (mejor que una simple columna — preserva items históricos) |
| Combos con `ComboItems` | ✅ | Tabla `Combos` + `ComboItems` con soporte de override de precio |

---

## Próximos pasos sugeridos

Con Bloque D cerrado, el siguiente bloque según `PRODUCTION_GAP_MATRIX.md` es:

### **BLOQUE E — Fase 5: Cocina/KDS**
- Gate P0: Test E2E que verifique POS→KDS en tiempo real sin refresh
- P2: Verificar reimresión KDS

### **BLOQUE F — Fase 6: Printer Gateway**
- Gate P0: Probar con impresora térmica física real
- P2: Editor de templates de recibo/cocina

---

## Archivos modificados/creados

### Nuevos
- `backend/src/infrastructure/db/migrations/20260908000004_create_bloque_d_inventory_extensions.js`
- `backend/src/api/services/ComboService.js`
- `backend/src/api/routes/combos.js`
- `backend/tests/bloque-d-verification.test.js`
- `docs/BLOQUE_D_REPORT.md`

### Modificados
- `backend/src/api/services/InventoryService.js` (+10 métodos, +590 líneas)
- `backend/src/api/services/RecipeService.js` (+3 métodos, +180 líneas)
- `backend/src/api/routes/inventory.js` (+11 endpoints)
- `backend/src/api/routes/recipes.js` (+3 endpoints)
- `backend/src/api/server.js` (registro `/api/combos`)
- `backend/package.json` (añadido `bloque-d-verification.test.js` a `test:unit`)
- `backend/scripts/run-all-tests.sh` (añadido bloque-d a la lista)
