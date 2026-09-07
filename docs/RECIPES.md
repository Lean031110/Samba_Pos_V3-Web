# RECIPES.md — SambaPos_LBA Recipe Administration

**Estado:** ✅ Production-ready (Fase 5 — Batch 3)
**Última actualización:** 2026-09-07

---

## Resumen

SambaPos_LBA implementa administración completa de recetas con cálculo de costo, margen y precio sugerido. Cuando un producto se vende, los ingredientes se descuentan automáticamente del inventario. Si se anula o reembolsa un ticket, los ingredientes se restauran automáticamente.

---

## Arquitectura

```text
                        ┌──────────────────────────────────────┐
                        │         MenuItem (vendido)            │
                        │  e.g., "Hamburguesa"  price=$10.00   │
                        └─────────────────┬─────────────────────┘
                                          │ has many
                                          ▼
                        ┌──────────────────────────────────────┐
                        │     MenuItemPortion (porción)         │
                        │  e.g., "Normal" (1×)  "Large" (1.5×)  │
                        └─────────────────┬─────────────────────┘
                                          │ has one
                                          ▼
                        ┌──────────────────────────────────────┐
                        │         Recipe (receta)               │
                        │  FixedCost: $0.50 (labor/envoltorio)  │
                        └─────────────────┬─────────────────────┘
                                          │ has many
                                          ▼
                        ┌──────────────────────────────────────┐
                        │       RecipeItem (línea)              │
                        │  IngredientId: 5 (Carne)              │
                        │  Quantity:      0.2  (kg)              │
                        │  UnitId:        2   (kg)               │
                        └─────────────────┬─────────────────────┘
                                          │ references
                                          ▼
                        ┌──────────────────────────────────────┐
                        │       Ingredient (inventario)         │
                        │  CostPerUnit: $4.00/kg                │
                        │  MinimumStock: 5 kg                   │
                        └──────────────────────────────────────┘
```

**Cálculo de costo:**

```text
recipeCost = Σ (RecipeItem.Quantity × Ingredient.CostPerUnit) + Recipe.FixedCost

Ejemplo Hamburguesa Normal:
  Pan       1 unid × $0.50/unid = $0.50
  Carne     0.2 kg  × $4.00/kg   = $0.80
  Queso     0.05 kg × $1.20/kg   = $0.06
  Bacon     0.03 kg × $8.00/kg   = $0.24
  Salsa     0.02 L  × $2.50/L    = $0.05
  Vegetales 0.05 kg × $1.00/kg   = $0.05
  FixedCost (labor/envoltorio)   = $0.50
  ─────────────────────────────────────
  recipeCost                     = $2.20

price       = $10.00 (MenuItemPrices.Price)
margin      = $10.00 - $2.20 = $7.80
marginPct   = $7.80 / $10.00 × 100 = 78%
markupPct   = $7.80 / $2.20 × 100 = 354.5%
```

---

## Tablas de base de datos

### `Recipes` (ya existente — reutilizada)

Vincula una porción de MenuItem con su lista de ingredientes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | Auto-incremental |
| `MenuItemPortionId` | INTEGER FK | Porción a la que pertenece |
| `FixedCost` | DECIMAL | Costo fijo (labor, envoltorio) |
| `IsActive` | INTEGER | 1=activa, 0=desactivada (soft delete) |

### `RecipeItems` (ya existente — reutilizada)

Cada línea de ingrediente dentro de una receta.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | Auto-incremental |
| `RecipeId` | INTEGER FK | Receta a la que pertenece (CASCADE) |
| `IngredientId` | INTEGER FK | Ingrediente |
| `Quantity` | DECIMAL | Cantidad a consumir por porción |
| `UnitId` | INTEGER FK | Unidad (gr, kg, L, ml, unit) |

### `Ingredients` (ya existente)

Materias primas del inventario.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | |
| `Name` | TEXT | "Pan", "Carne", etc. |
| `Code` | TEXT UNIQUE | Código corto (BREAD, BEEF) |
| `GroupCode` | TEXT | Agrupador (para reportes) |
| `BaseUnitId` | INTEGER FK | Unidad base (unit, kg, L) |
| `MinimumStock` | DECIMAL | Stock mínimo para alertas |
| `CostPerUnit` | DECIMAL | Costo por unidad base |

### `IngredientUnits` (ya existente)

Unidades de medida.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Id` | INTEGER PK | |
| `Code` | TEXT | "kg", "gr", "L", "ml", "unit" |
| `Name` | TEXT | "Kilogramo", "Litro", etc. |
| `SortOrder` | INTEGER | |

---

## RecipeService

Archivo: `backend/src/api/services/RecipeService.js`

### Métodos principales

#### `getRecipeForPortion(menuItemPortionId, trx)`

Retorna la receta completa para una porción, incluyendo ingredientes y unidades.

**Response:**
```json
{
  "recipe": { "Id": 1, "FixedCost": 0.50, "IsActive": 1 },
  "items": [
    {
      "Id": 1, "Quantity": 1, "UnitId": 1,
      "IngredientId": 1, "IngredientName": "Pan",
      "IngredientCode": "BREAD", "BaseUnitId": 1,
      "UnitCode": "unit", "UnitName": "Unit"
    }
  ],
  "portion": { "Id": 1, "Name": "Normal", "Multiplier": 1 },
  "menuItem": { "Id": 1, "Name": "Hamburguesa", "GroupCode": "Food" },
  "price": 10.00
}
```

#### `getRecipesForMenuItem(menuItemId, trx)`

Retorna todas las recetas para todas las porciones de un MenuItem.

#### `calculateRecipeCost(recipeId, trx)`

Calcula el costo total de una receta:
```text
cost = Σ (RecipeItem.Quantity × Ingredient.CostPerUnit) + Recipe.FixedCost
```

Retorna un número decimal con 4 decimales.

#### `calculateMargin(cost, price)`

Calcula margen dado costo y precio:
```text
margin    = price - cost
marginPct = (margin / price) × 100   (si price > 0)
markupPct = (margin / cost) × 100    (si cost > 0)
```

#### `suggestPrice(cost, targetMarginPct)`

Sugiere un precio dado un costo y un margen objetivo:
```text
price = cost / (1 - targetMarginPct/100)
```

Ejemplo: costo=$5, margen objetivo=60% → price=$12.50

#### `saveRecipeWithCost(menuItemPortionId, items, fixedCost, trx)`

Guarda una receta atómicamente (reemplaza la existente para esa porción). Retorna:
```json
{
  "recipeId": 5,
  "itemCount": 3,
  "fixedCost": 0.50,
  "totalCost": 2.20
}
```

#### `listRecipes(filter, limit, trx)`

Lista todas las recetas con su costo, precio, margen y margen%. Filtros:
- `menuItemId` — solo recetas de ese menuItem
- `includeInactive` — incluir recetas desactivadas

#### `deactivateRecipe(recipeId, trx)`

Soft-delete de una receta (IsActive=0). Mantiene el registro para auditoría.

#### `getCostSummary(trx)`

Retorna un resumen de costo para todos los menu items — usado por el dashboard de admin para ver rentabilidad.

---

## Endpoints API

### Recipes

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/recipes` | `manage.inventory` | Listar recetas con costo summary |
| `GET` | `/api/recipes/cost-summary` | `manage.inventory` | Cost summary para todos los menu items |
| `POST` | `/api/recipes/calc-margin` | (auth) | Calcular margen dado `{cost, price}` |
| `POST` | `/api/recipes/suggest-price` | (auth) | Sugerir precio dado `{cost, targetMarginPct}` |
| `GET` | `/api/recipes/by-portion/:portionId` | (auth) | Receta completa para una porción |
| `GET` | `/api/recipes/by-menu-item/:menuItemId` | (auth) | Recetas para todas las porciones de un menu item |
| `POST` | `/api/recipes/by-portion/:portionId` | `manage.inventory` | Guardar receta para una porción |
| `GET` | `/api/recipes/:recipeId/cost` | (auth) | Calcular costo de una receta específica |
| `DELETE` | `/api/recipes/:recipeId` | `manage.inventory` | Desactivar receta (soft delete) |

### Ejemplos de uso

**Listar todas las recetas:**
```bash
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/recipes | jq .
```

**Crear receta para una porción:**
```bash
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "ingredientId": 1, "quantity": 1, "unitId": 1 },
      { "ingredientId": 2, "quantity": 0.2, "unitId": 2 }
    ],
    "fixedCost": 0.50
  }' \
  http://localhost:3001/api/recipes/by-portion/5
```

**Calcular costo de una receta:**
```bash
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/recipes/3/cost | jq .
# → { "data": { "recipeId": 3, "totalCost": 2.20 } }
```

**Calcular margen:**
```bash
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cost": 2.20, "price": 10.00}' \
  http://localhost:3001/api/recipes/calc-margin | jq .
# → { "data": { "cost": 2.20, "price": 10, "margin": 7.80, "marginPct": 78, "markupPct": 354.55 } }
```

**Sugerir precio para 60% margen:**
```bash
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cost": 5, "targetMarginPct": 60}' \
  http://localhost:3001/api/recipes/suggest-price | jq .
# → { "data": { "cost": 5, "targetMarginPct": 60, "suggestedPrice": 12.50 } }
```

---

## Integración con inventario (consumo automático)

### Flujo de venta

```text
1. POS crea ticket con órdenes → POST /api/tickets/:id/orders
2. POS procesa pago → POST /api/tickets/:id/payments
3. POS cierra ticket → POST /api/tickets/:id/close
   ↓
   TicketService.closeTicket():
     - Cierra el ticket (state machine)
     - Llama inventoryService.deductForTicketSale(ticket, warehouseId, userId, trx)
       ↓
       Para cada Order con CalculatePrice=true:
         - Encuentra la porción (MenuItemPortion)
         - Encuentra la receta (Recipes.IsActive=1)
         - Para cada RecipeItem:
           - Calcula cantidad = RecipeItem.Quantity × Order.Quantity
           - Registra movimiento SALE (cantidad negativa)
           - Actualiza StockBalance (Quantity -= cantidad)
   ↓
   Todo en la misma transacción — si algo falla, se revierte todo.
```

### Flujo de anulación (void)

```text
1. POS anula ticket → POST /api/tickets/:id/void
   ↓
   TicketServiceExtended.voidTicket():
     - Marca todas las órdenes como Void (CalculatePrice=false)
     - Llama inventoryService.reverseForTicket(ticket, warehouseId, userId, trx)
       ↓
       Para cada SALE movement del ticket:
         - Registra movimiento REVERSAL (cantidad opuesta = positiva)
         - Actualiza StockBalance (Quantity += cantidad original)
   ↓
   Todo en la misma transacción.
```

### Flujo de reembolso (refund)

```text
1. POS reembolsa ticket → POST /api/tickets/:id/refund
   ↓
   TicketServiceExtended.refundTicket():
     - Verifica que el ticket esté cerrado
     - Llama inventoryService.reverseForTicket(originalTicket, warehouseId, userId, trx)
       ↓
       Igual que void: registra movimientos REVERSAL y restaura stock.
```

### Invariantes

- **Transaccional:** Si la deducción de inventario falla, el cierre del ticket falla (rollback).
- **Idempotente:** Si se llama dos veces `closeTicket`, el segundo falla (ConflictError).
- **Saltea voided/gifted:** Las órdenes con `CalculatePrice=false` no descuentan inventario.
- **Sin receta = sin descuento:** Si un MenuItem no tiene receta definida, no se descuenta nada (silenciosamente).
- **Reversión completa:** `reverseForTicket` busca todos los SALE movements del ticket y los revierte uno a uno.

---

## Tests automatizados (25 tests, todos PASS en 437ms)

Archivo: `backend/tests/recipes-verification.test.js`

### RecipeService cost calculation (8 tests)
- `calculateRecipeCost` suma costos de ingredientes + fixed cost
- `calculateRecipeCost` retorna 0 para receta vacía con fixedCost
- `calculateMargin` calcula margin + marginPct + markupPct
- `calculateMargin` maneja costo cero
- `calculateMargin` maneja precio cero
- `suggestPrice` calcula precio para margen objetivo
- `suggestPrice` rechaza margen >= 100%
- `suggestPrice` rechaza margen negativo

### RecipeService CRUD (8 tests)
- `saveRecipeWithCost` valida que items sea array
- `saveRecipeWithCost` rechaza receta vacía (sin items ni fixedCost)
- `saveRecipeWithCost` valida cada item tenga ingredientId
- `saveRecipeWithCost` valida que quantity sea positivo
- `getRecipeForPortion` retorna receta completa con ingredientes
- `getRecipeForPortion` lanza NotFound para porción desconocida
- `getRecipesForMenuItem` retorna todas las porciones con cost data
- `listRecipes` retorna recetas con cost summary
- `deactivateRecipe` soft-delete (IsActive=0)
- `getCostSummary` retorna resumen para todos los menu items

### Inventory integration (4 tests)
- `deductForTicketSale` consume ingredientes según receta
- `reverseForTicket` restaura ingredientes en void/refund
- `deductForTicketSale` saltea órdenes con CalculatePrice=false (voided/gifted)
- `deductForTicketSale` ignora órdenes sin receta

### Transactional integrity (2 tests)
- `saveRecipeWithCost` corre dentro de una transacción
- `saveRecipeWithCost` reemplaza receta existente (cascade delete RecipeItems)

---

## Próximos pasos (pendiente)

1. **UI de administración de recetas** — formulario para crear/editar recetas con búsqueda de ingredientes.
2. **Soporte para porciones múltiples** — actualmente cada porción tiene su propia receta; permitir heredar de la porción "Normal" con multiplicador.
3. **Combos** — un MenuItem que agrupa varios MenuItems con descuento. Requiere nueva tabla `ComboItems`.
4. **Conversión de unidades** — permitir usar gramos en la receta aunque el ingrediente se almacene en kg (tabla `IngredientUnitConversions` ya existe).
5. **Costo histórico** — actualmente `CostPerUnit` es estático; registrar cambios de costo en el tiempo para análisis de rentabilidad histórica.
6. **Merma (waste)** — registro de mermas por lote caducado, rotura, etc. (movement type WASTE ya soportado en InventoryService).
7. **Alertas de stock bajo** — cuando un ingrediente cae bajo MinimumStock, emitir evento WebSocket `InventoryLow` + notificación push.
