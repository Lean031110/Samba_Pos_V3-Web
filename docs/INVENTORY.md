# INVENTORY.md — Inventory Management

## Overview

The inventory module provides real-time stock management with recipe-based deduction. When a ticket is closed, the system explodes each order's recipe and deducts ingredients from stock. When a ticket is voided or refunded, the deduction is reversed.

## Data Model

```
MenuItem
  → MenuItemPortion
    → Recipe (1:1 with portion)
      → RecipeItems (1:N)
        → Ingredient (with Unit)
          → StockBalance (per Warehouse)
          → StockMovements (append-only ledger)
```

## Units and Conversions

| Unit | Code | Type |
|------|------|------|
| Unit | unit | count |
| Gram | gr | weight |
| Kilogram | kg | weight |
| Milliliter | ml | volume |
| Liter | l | volume |
| Slice | slice | count |
| Piece | piece | count |

Conversions: 1 kg = 1000 gr, 1 l = 1000 ml (in `UnitConversions` table).

## Recipe Example

```
Hamburger (MenuItemPortion: Normal)
  → Recipe
    → RecipeItem: Bread Bun × 1 unit
    → RecipeItem: Beef Patty × 1 unit
    → RecipeItem: Cheese Slice × 1 slice
    → RecipeItem: Bacon Strip × 2 slices
    → RecipeItem: Burger Sauce × 20 ml
```

Selling 1 hamburger deducts: 1 bread, 1 beef, 1 cheese, 2 bacon, 20ml sauce.
Selling 3 hamburgers deducts: 3 bread, 3 beef, 3 cheese, 6 bacon, 60ml sauce.

## Stock Movements (Ledger)

All stock changes are recorded as append-only movements:

| Type | Direction | Trigger |
|------|-----------|---------|
| PURCHASE | + (positive) | Manual: receive goods from supplier |
| SALE | - (negative) | Automatic: ticket close |
| WASTE | - (negative) | Manual: expired/damaged |
| ADJUSTMENT | ± | Manual: stock count correction |
| TRANSFER_OUT | - (negative) | Manual: move to another warehouse |
| TRANSFER_IN | + (positive) | Manual: receive from another warehouse |
| RETURN | + (positive) | Manual: customer return |
| REVERSAL | opposite of original | Automatic: ticket void/refund |

## Transactional Flow

### Sale (ticket close):
```
closeTicket()
  → withTransaction:
    → saveTicket (lock + close)
    → inventoryService.deductForTicketSale(ticket, warehouseId, userId, trx)
      → for each order with CalculatePrice=true:
        → find recipe for order's MenuItemPortion
        → for each RecipeItem:
          → recordMovement(SALE, -quantity × order.quantity)
          → update StockBalance
    → release tables
  → COMMIT (or ROLLBACK on any failure)
```

### Reversal (void/refund):
```
voidTicket() / refundTicket()
  → withTransaction:
    → reverseForTicket(ticket, warehouseId, userId, trx)
      → find all SALE movements for this ticket
      → for each: recordMovement(REVERSAL, +original_quantity)
      → update StockBalance
  → COMMIT
```

## Stock Balance

`StockBalances` provides O(1) current stock lookup. It can also be reconstructed from `StockMovements`:

```
current_stock = initial_seed + SUM(StockMovements.Quantity WHERE IngredientId=? AND WarehouseId=?)
```

Average cost is recalculated on incoming movements (weighted average).

## Low Stock Alerts

```bash
GET /api/inventory/stock/:warehouseId/low
```

Returns ingredients where `Quantity <= MinimumStock`.

## API Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /api/inventory/ingredients | — | List ingredients |
| GET | /api/inventory/ingredients/:id | — | Get ingredient |
| POST | /api/inventory/ingredients | manage.inventory | Create ingredient |
| GET | /api/inventory/units | — | List units |
| GET | /api/inventory/recipes/:portionId | — | Get recipe |
| POST | /api/inventory/recipes/:portionId | manage.inventory | Save recipe |
| GET | /api/inventory/stock/:warehouseId | — | Stock balances |
| GET | /api/inventory/stock/:warehouseId/low | — | Low stock alerts |
| GET | /api/inventory/movements | — | Movement history |
| POST | /api/inventory/movements | manage.inventory | Record movement |

## Important Rules

- **Gifted orders** (CalculatePrice=false) do NOT deduct stock
- **Double close** does NOT double-deduct (ticket already closed = 409)
- **Void before close**: no SALE movements exist, so no reversal needed
- All operations are transactional — no partial state is possible
