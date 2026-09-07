# KITCHEN.md — Kitchen Display System (KDS)

## Overview

The KDS module provides real-time order management for kitchen staff. Orders flow automatically from the POS to the kitchen display when a waiter adds them to a ticket.

## Architecture

```
POS (addOrder)
  → TicketService (atomic transaction: ticket + order + kitchen order)
  → KitchenService.routeOrderToKitchen()
  → KitchenOrders table
  → KitchenOrderItems table
  → WebSocket event: KitchenOrderAdded → role:kitchen
  → KDS frontend refreshes
```

## Kitchen Stations

Stations are configured in `KitchenStations` with stable `Code` identifiers:

| Code | Display Name | Color | Default |
|------|-------------|-------|---------|
| KITCHEN | Cocina | #FF6B6B | Yes |
| PIZZA | Pizzería | #4ECDC4 | No |
| DRINKS | Bebidas | #45B7D1 | No |
| EXPO | Despacho | #96CEB4 | No |

## Routing Rules

Priority (highest to lowest):
1. **MenuItemId** — specific product → specific station
2. **MenuItemGroupCode** — product group → station (Food → KITCHEN, Drinks → DRINKS)
3. **IsDefault=1** — fallback to default station (KITCHEN)

Configure in `KitchenStationRouting` table.

## State Machine

```
NEW → ACCEPTED → PREPARING → READY → SERVED
                                      ↓
                              RECALL → READY (only via recallOrder)
NEW/ACCEPTED/PREPARING/READY → VOIDED (terminal)
```

- `updateState()`: generic state transition (enforces VALID_TRANSITIONS)
- `recallOrder()`: special — only way to go SERVED → READY
- `voidOrderFromKitchen()`: KDS void → propagates to POS (CalculatePrice=false)

## API Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /api/kitchen/stations | kitchen.view | List stations |
| GET | /api/kitchen/orders | kitchen.view | Active orders |
| POST | /api/kitchen/orders/:id/state | kitchen.view | Update state |
| POST | /api/kitchen/orders/:id/bump | kitchen.bump | Mark READY |
| POST | /api/kitchen/orders/:id/serve | kitchen.serve | Mark SERVED |
| POST | /api/kitchen/orders/:id/void | kitchen.void | Void (→POS) |
| POST | /api/kitchen/orders/:id/recall | kitchen.recall | Recall SERVED→READY |

## Optimistic Locking

KitchenOrders have a `Version` column. Pass `expectedVersion` in bump/serve/void/recall requests. If the version doesn't match, returns 409 Conflict.

## Idempotency

`UNIQUE(OrderId, KitchenStationId)` constraint prevents duplicate kitchen orders from retries, double-clicks, or network errors.

## Revision Mechanism

When the POS edits an order (quantity, notes, modifiers), the kitchen order's `Revision` counter is incremented and items are updated (not duplicated). The KDS displays the revision so cooks know the order changed.

## Void Propagation

- **POS → KDS**: `voidTicket()` calls `voidOrdersForPosOrder()` — all kitchen orders for the ticket are voided.
- **KDS → POS**: `voidOrderFromKitchen()` marks the POS order as voided (CalculatePrice=false). Both sides agree.

## Frontend

The KDS view (`frontend/js/views/kitchen.js`) shows:
- Station filter bar
- Order cards with color by state
- Timer since creation (updates every second)
- Priority badge
- BUMP / READY / SERVED / VOID / RECALL buttons
- Sound notification on new orders (configurable)

## Realtime Events

| Event | Recipients | Trigger |
|-------|-----------|---------|
| KitchenOrderAdded | role:kitchen | New order added to ticket |
| KitchenOrderUpdated | role:kitchen, role:pos | State change or POS edit |
| KitchenOrderVoided | role:kitchen, role:pos | KDS or POS void |

## Resync

On reconnect, kitchen terminals call `socket.emit('resync')`. The server responds with current open tickets + tables. The KDS frontend then fetches `/api/kitchen/orders` to get the full kitchen state.
