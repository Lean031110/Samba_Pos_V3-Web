# API ↔ UI Coverage Matrix

> Generado automáticamente por `scripts/audit-api-ui-coverage.js`
> Fecha: 2026-09-12T12:15:30.873Z

## Resumen

- Endpoints backend: 192
- Paths únicos llamados desde frontend: 100
- Archivos de test: 26 unit + 9 E2E specs = 35 archivos

## Matriz detallada

| Módulo | Método | Path | Permiso | UI Consumer | Test Coverage | Audit Log |
|---|---|---|---|---|---|---|
| admin | GET | /users | (none) | Admin | unit-by-module | — |
| admin | GET | /users/:id | (none) | Admin | unit-by-module | — |
| admin | POST | /users | (none) | Admin | unit-by-module | ✅ |
| admin | PATCH | /users/:id | (none) | Admin | unit-by-module | ✅ |
| admin | DELETE | /users/:id | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /roles | (none) | Admin | unit-by-module | — |
| admin | POST | /roles | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /roles/:id/permissions | (none) | Admin | unit-by-module | — |
| admin | POST | /roles/:id/permissions | (none) | Admin | unit-by-module | ✅ |
| admin | DELETE | /roles/:id/permissions/:permId | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /permissions | (none) | Admin | unit-by-module | — |
| admin | GET | /departments | (none) | Admin | unit-by-module | — |
| admin | POST | /departments | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /terminals | (none) | Admin | unit-by-module | — |
| admin | POST | /terminals | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /payment-types | (none) | Admin | unit-by-module | — |
| admin | POST | /payment-types | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /settings | (none) | Admin | unit-by-module | — |
| admin | PATCH | /settings/:name | (none) | Admin | unit-by-module | ✅ |
| admin | GET | /audit-logs | users.manage | Admin | unit-by-module | — |
| auth | POST | /login | (none) | Login | unit-by-module | — |
| auth | GET | /me | (none) | Login | unit-by-module | — |
| auth | POST | /logout | (none) | Login | unit-by-module | — |
| auth | GET | /sessions | (none) | Login | unit-by-module | — |
| auth | POST | /revoke-all | (none) | Login | unit-by-module | — |
| cash-sessions | POST | /work-periods/open | pos.open_ticket | Admin | unit-by-module | ✅ |
| cash-sessions | POST | /work-periods/close | pos.close_ticket | Admin | unit-by-module | ✅ |
| cash-sessions | POST | /work-periods/:id/reopen | admin.all | Admin | unit-by-module | ✅ |
| cash-sessions | GET | /work-periods/current | cash.manage | Admin | unit-by-module | — |
| cash-sessions | GET | /work-periods | reports.view | Admin | unit-by-module | — |
| cash-sessions | POST | /cash-sessions/open | cash.manage | Admin | unit-by-module | ✅ |
| cash-sessions | POST | /cash-sessions/:id/close | pos.close_ticket | Admin | unit-by-module | ✅ |
| cash-sessions | POST | /cash-sessions/:id/payout | pos.payment | Admin | unit-by-module | ✅ |
| cash-sessions | POST | /cash-sessions/:id/transfer | pos.payment | Admin | unit-by-module | ✅ |
| cash-sessions | GET | /cash-sessions/current | cash.manage | Admin | unit-by-module | — |
| cash-sessions | GET | /cash-sessions | reports.view | Admin | unit-by-module | — |
| cash-sessions | GET | /cash-sessions/:id/events | reports.view | Admin | unit-by-module | — |
| combos | GET | / | inventory.view | Admin | integration+unit-by-module+service | — |
| combos | GET | /by-menu-item/:menuItemId | inventory.view | Admin | unit-by-module+service | — |
| combos | GET | /:id | inventory.view | Admin | unit-by-module+service | — |
| combos | POST | / | manage.inventory | Admin | integration+unit-by-module+service | ✅ |
| combos | PATCH | /:id | manage.inventory | Admin | unit-by-module+service | ✅ |
| combos | PUT | /:id/items | manage.inventory | Admin | unit-by-module+service | ✅ |
| combos | DELETE | /:id | manage.inventory | Admin | unit-by-module+service | ✅ |
| config | GET | /calculation-types | (none) | Admin/POS | NONE | — |
| config | GET | /payment-types | (none) | Admin/POS | NONE | — |
| config | GET | /departments | (none) | Admin/POS | NONE | — |
| config | GET | /ticket-types | (none) | Admin/POS | NONE | — |
| config | GET | /tax-templates | (none) | Admin/POS | NONE | — |
| customers | GET | / | customers.manage | Admin | integration+unit-by-module | — |
| customers | GET | /:id | customers.manage | Admin | unit-by-module | — |
| customers | POST | / | manage.users | Admin | integration+unit-by-module | ✅ |
| customers | PATCH | /:id | manage.users | Admin | unit-by-module | ✅ |
| customers | POST | /:id/deactivate | manage.users | Admin | unit-by-module | ✅ |
| customers | POST | /:id/reactivate | manage.users | Admin | unit-by-module | ✅ |
| customers | POST | /:id/credit | manage.users | Admin | unit-by-module | ✅ |
| customers | POST | /:id/debit | manage.users | Admin | unit-by-module | ✅ |
| errors | POST | / | (none) | ErrorReporter | integration+unit-by-module+service | — |
| errors | GET | / | users.manage | Admin | integration+unit-by-module+service | — |
| errors | GET | /stats | users.manage | Admin | unit-by-module+service | — |
| errors | DELETE | / | users.manage | Admin | integration+unit-by-module+service | — |
| inventory | GET | /ingredients | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /ingredients/:id | inventory.view | Admin | unit-by-module+service | — |
| inventory | POST | /ingredients | manage.inventory | Admin | unit-by-module+service | ✅ |
| inventory | GET | /units | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /recipes/:portionId | inventory.view | Admin | unit-by-module+service | — |
| inventory | POST | /recipes/:portionId | manage.inventory | Admin | unit-by-module+service | ✅ |
| inventory | GET | /stock/:warehouseId | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /stock/:warehouseId/low | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /movements | inventory.view | Admin | unit-by-module+service | — |
| inventory | POST | /movements | manage.inventory | Admin | unit-by-module+service | ✅ |
| inventory | POST | /transfer | inventory.transfer | Admin | unit-by-module+service | ✅ |
| inventory | GET | /transfers | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /transfers/:id | inventory.view | Admin | unit-by-module+service | — |
| inventory | POST | /waste | inventory.adjust | Admin | unit-by-module+service | ✅ |
| inventory | POST | /physical-count | inventory.adjust | Admin | unit-by-module+service | ✅ |
| inventory | GET | /physical-count | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /physical-count/:id | inventory.view | Admin | unit-by-module+service | — |
| inventory | PATCH | /physical-count/:id/items/:ingredientId | inventory.adjust | Admin | unit-by-module+service | ✅ |
| inventory | POST | /physical-count/:id/finalize | inventory.adjust | Admin | unit-by-module+service | ✅ |
| inventory | GET | /kardex | inventory.view | Admin | unit-by-module+service | — |
| inventory | GET | /warehouses | inventory.view | Admin | unit-by-module+service | — |
| inventory | POST | /warehouses | manage.inventory | Admin | unit-by-module+service | ✅ |
| inventory | PATCH | /warehouses/:id | manage.inventory | Admin | unit-by-module+service | ✅ |
| inventory | DELETE | /warehouses/:id | manage.inventory | Admin | unit-by-module+service | ✅ |
| kitchen | GET | /stations | kitchen.view | Admin | integration+unit-by-module+service | — |
| kitchen | GET | /orders | kitchen.view | KDS | integration+unit-by-module+service | — |
| kitchen | GET | /stats/:stationId | kitchen.view | KDS | unit-by-module+service | — |
| kitchen | POST | /orders/:id/state | kitchen.view | KDS | unit-by-module+service | ✅ |
| kitchen | POST | /orders/:id/bump | kitchen.bump | KDS | unit-by-module+service | ✅ |
| kitchen | POST | /orders/:id/serve | kitchen.serve | KDS | unit-by-module+service | ✅ |
| kitchen | POST | /orders/:id/void | kitchen.void | KDS | unit-by-module+service | ✅ |
| kitchen | POST | /orders/:id/recall | kitchen.recall | KDS | unit-by-module+service | ✅ |
| printers | GET | / | manage.printers | Admin | integration+unit-by-module | — |
| printers | POST | / | manage.printers | Admin | integration+unit-by-module | ✅ |
| printers | GET | /areas/list | manage.printers | Admin | unit-by-module | — |
| printers | POST | /areas | manage.printers | Admin | unit-by-module | ✅ |
| printers | GET | /routing-rules/list | manage.printers | Admin | unit-by-module | — |
| printers | POST | /routing-rules | manage.printers | Admin | unit-by-module | ✅ |
| printers | DELETE | /routing-rules/:id | manage.printers | Admin | unit-by-module | ✅ |
| printers | GET | /templates/list | manage.printers | Admin | unit-by-module | — |
| printers | GET | /templates/:id | manage.printers | Admin | unit-by-module | — |
| printers | POST | /templates | manage.printers | Admin | unit-by-module | ✅ |
| printers | PATCH | /templates/:id | manage.printers | Admin | unit-by-module | ✅ |
| printers | DELETE | /templates/:id | manage.printers | Admin | unit-by-module | ✅ |
| printers | POST | /templates/:id/preview | manage.printers | Admin | unit-by-module | — |
| printers | GET | /jobs/list | manage.printers | Admin | unit-by-module | — |
| printers | GET | /jobs/:id | manage.printers | Admin | unit-by-module | — |
| printers | POST | /jobs/:id/cancel | manage.printers | Admin | unit-by-module | ✅ |
| printers | POST | /jobs/:id/reprint | pos.print | Admin | unit-by-module | ✅ |
| printers | GET | /stats/list | manage.printers | Admin | unit-by-module | — |
| printers | GET | /:id | manage.printers | Admin | unit-by-module | — |
| printers | GET | /:id/status | manage.printers | Admin | unit-by-module | — |
| printers | POST | /:id/test | manage.printers | Admin | unit-by-module | ✅ |
| printers | PATCH | /:id | manage.printers | Admin | unit-by-module | ✅ |
| printers | POST | /tickets/:id/send | pos.print | Admin | unit-by-module | ✅ |
| printers | POST | /tickets/:id/kitchen | pos.print | Admin | unit-by-module | ✅ |
| printers | POST | /tickets/:id/receipt | pos.print | Admin | unit-by-module | ✅ |
| products | GET | / | pos.login | Admin | integration+unit-by-module | — |
| products | GET | /group/:code | pos.login | POS/Admin | unit-by-module | — |
| products | GET | /:id | pos.login | POS/Admin | unit-by-module | — |
| products | POST | / | manage.products | Admin | integration+unit-by-module | ✅ |
| push | GET | /vapid-public-key | (none) | Admin | unit-by-module+service | — |
| push | POST | /subscribe | (none) | PWA/Push | unit-by-module+service | — |
| push | POST | /unsubscribe | (none) | PWA/Push | unit-by-module+service | — |
| push | GET | /pending | (none) | Admin | unit-by-module+service | — |
| push | POST | /cleanup | manage.printers | PWA/Push | unit-by-module+service | — |
| push | GET | /status | (none) | Admin | unit-by-module+service | — |
| push | GET | /subscriptions | manage.printers | PWA/Push | unit-by-module+service | — |
| push | GET | /notifications | manage.printers | PWA/Push | unit-by-module+service | — |
| push | POST | /send | manage.printers | PWA/Push | unit-by-module+service | ✅ |
| push | POST | /test | manage.printers | Admin | integration+unit-by-module+service | ✅ |
| recipes | GET | / | manage.inventory | Admin | integration+unit-by-module+service | — |
| recipes | GET | /cost-summary | manage.inventory | Admin | unit-by-module+service | — |
| recipes | POST | /calc-margin | recipes.view | Admin | unit-by-module+service | — |
| recipes | POST | /suggest-price | recipes.view | Admin | unit-by-module+service | — |
| recipes | GET | /by-portion/:portionId | recipes.view | Admin | unit-by-module+service | — |
| recipes | GET | /by-menu-item/:menuItemId | recipes.view | Admin | unit-by-module+service | — |
| recipes | POST | /by-portion/:portionId | manage.inventory | Admin | unit-by-module+service | ✅ |
| recipes | GET | /:recipeId/cost | recipes.view | Admin | unit-by-module+service | — |
| recipes | DELETE | /:recipeId | manage.inventory | Admin | unit-by-module+service | ✅ |
| recipes | GET | /by-portion/:portionId/versions | recipes.view | Admin | unit-by-module+service | — |
| recipes | POST | /by-portion/:portionId/versions | recipes.edit | Admin | unit-by-module+service | ✅ |
| recipes | POST | /by-portion/:portionId/restore/:versionId | recipes.edit | Admin | unit-by-module+service | ✅ |
| reports | GET | /sales | (none) | Admin | unit-by-module+service | — |
| reports | GET | /top-products | (none) | Admin | unit-by-module+service | — |
| reports | GET | /categories | (none) | Admin | unit-by-module+service | — |
| reports | GET | /users | (none) | Admin | unit-by-module+service | — |
| reports | GET | /payments | (none) | Admin | integration+unit-by-module+service | — |
| reports | GET | /voids-refunds | (none) | Admin | unit-by-module+service | — |
| reports | GET | /inventory | (none) | Admin | unit-by-module+service | — |
| reports | GET | /cash-sessions | (none) | Admin | unit-by-module+service | — |
| reports | GET | /dashboard | (none) | Admin | unit-by-module+service | — |
| stations | GET | /areas | pos.login | Admin | unit-by-module | — |
| stations | POST | /areas | settings.manage | Admin | unit-by-module | ✅ |
| stations | PATCH | /areas/:id | settings.manage | Admin | unit-by-module | ✅ |
| stations | DELETE | /areas/:id | settings.manage | Admin | unit-by-module | ✅ |
| stations | GET | /areas/:id/products | pos.login | Admin | unit-by-module | — |
| stations | POST | /areas/:id/products | settings.manage | Admin | unit-by-module | ✅ |
| stations | DELETE | /areas/:id/products/:productId | settings.manage | Admin | unit-by-module | ✅ |
| stations | GET | / | pos.login | Admin | integration+unit-by-module | — |
| stations | POST | / | settings.manage | Admin | integration+unit-by-module | ✅ |
| stations | GET | /:id | pos.login | Admin | unit-by-module | — |
| stations | PATCH | /:id | settings.manage | Admin | unit-by-module | ✅ |
| stations | DELETE | /:id | settings.manage | Admin | unit-by-module | ✅ |
| stations | GET | /:id/areas | pos.login | Admin | unit-by-module | — |
| stations | POST | /:id/areas | settings.manage | Admin | unit-by-module | ✅ |
| stations | DELETE | /:id/areas/:areaId | settings.manage | Admin | unit-by-module | ✅ |
| stations | GET | /:id/kds-config | pos.login | Admin | unit-by-module | — |
| stations | PUT | /:id/kds-config | settings.manage | Admin | unit-by-module | ✅ |
| stations | POST | /register | (none) | Admin | unit-by-module | — |
| tables | GET | / | pos.login | Dashboard | integration+unit-by-module | — |
| tables | GET | /:id | pos.login | Dashboard | unit-by-module | — |
| tables | PATCH | /:id/state | pos.change_table | Dashboard | unit-by-module | ✅ |
| tickets | GET | / | pos.login | POS/Payment | integration+unit-by-module+service | — |
| tickets | GET | /:id | pos.login | POS/Payment | unit-by-module+service | — |
| tickets | POST | / | pos.open_ticket | POS/Payment | integration+unit-by-module+service | — |
| tickets | POST | /merge | pos.merge | POS/Payment | unit-by-module+service | ✅ |
| tickets | POST | /:id/orders | pos.add_order | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/calculations | pos.discount | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/payments | pos.payment | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/close | pos.close_ticket | POS/Payment | unit-by-module+service | — |
| tickets | GET | /:id/print | pos.login | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/note | pos.add_order | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/gift | pos.gift | POS/Payment | unit-by-module+service | ✅ |
| tickets | POST | /:id/void | pos.void | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/tags | pos.add_order | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/split | pos.split | POS/Payment | unit-by-module+service | ✅ |
| tickets | POST | /:id/refund | pos.refund | POS/Payment | unit-by-module+service | — |
| tickets | POST | /:id/move-orders | pos.merge | POS/Payment | unit-by-module+service | ✅ |
| tickets | POST | /:id/reopen | pos.reopen_ticket | POS/Payment | unit-by-module+service | ✅ |
| tickets | POST | /:id/change-payments | pos.payment | POS/Payment | unit-by-module+service | — |

## Estadísticas

- Total endpoints: 192
- Endpoints sin UI consumer (ORPHAN): 0
- Endpoints con audit log: 81/192 (42.2%)
- Endpoints con al menos un test: 187/192 (97.4%)
- Coverage UI: 100.0%
