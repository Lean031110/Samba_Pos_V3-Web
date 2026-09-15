# PAGINATION_AUDIT.md — Estado real de paginación backend

> Generado por auditoría manual del código en `backend/src/api/routes/`.
> Fecha: 2026-09-12

## Resumen

| Endpoint | ¿Tiene limit? | ¿Tiene offset? | ¿Paginación real? |
|---|---|---|---|
| GET /api/admin/users | ❌ | ❌ | ❌ |
| GET /api/admin/audit-logs | ✅ (max 200) | ✅ | ✅ |
| GET /api/admin/roles | ❌ | ❌ | ❌ |
| GET /api/admin/permissions | ❌ | ❌ | ❌ |
| GET /api/admin/departments | ❌ | ❌ | ❌ |
| GET /api/admin/terminals | ❌ | ❌ | ❌ |
| GET /api/admin/payment-types | ❌ | ❌ | ❌ |
| GET /api/admin/settings | ❌ | ❌ | ❌ |
| GET /api/tickets | ❌ | ❌ | ❌ |
| GET /api/products | ❌ | ❌ | ❌ |
| GET /api/tables | ❌ | ❌ | ❌ |
| GET /api/kitchen/orders | ❌ | ❌ | ❌ |
| GET /api/customers | ❌ | ❌ | ❌ |
| GET /api/combos | ✅ (default 100) | ❌ | ⚠️ Solo limit |
| GET /api/inventory/ingredients | ❌ | ❌ | ❌ |
| GET /api/inventory/movements | ✅ (default 100) | ❌ | ⚠️ Solo limit |
| GET /api/inventory/transfers | ✅ (default 100) | ❌ | ⚠️ Solo limit |
| GET /api/inventory/physical-count | ✅ (default 100) | ❌ | ⚠️ Solo limit |
| GET /api/print/areas/list | ❌ | ❌ | ❌ |
| GET /api/print/templates/list | ❌ | ❌ | ❌ |
| GET /api/print/jobs/list | ✅ (max 200) | ❌ | ⚠️ Solo limit |
| GET /api/print/routing-rules/list | ❌ | ❌ | ❌ |
| GET /api/print/stats/list | N/A | N/A | N/A (stats) |
| GET /api/reports/* | ✅ (max 100) | ❌ | ⚠️ Limit en top-products |
| GET /api/push/notifications | ✅ (max 100) | ❌ | ⚠️ Solo limit |
| GET /api/stations | ❌ | ❌ | ❌ |
| GET /api/stations/areas | ❌ | ❌ | ❌ |
| GET /api/errors | ✅ (max 200) | ✅ | ✅ |

## Estado real

- **Solo 2 endpoints tienen paginación real (limit + offset):** `/admin/audit-logs` y `/errors`.
- **9 endpoints tienen solo `limit` (sin `offset`)**: combos, inventory/movements, transfers, physical-count, print/jobs, reports/top-products, push/notifications, recipes.
- **20+ endpoints NO tienen ningún tipo de paginación** y devuelven todos los registros.

## Riesgo en producción

Para volúmenes pequeños (< 1000 registros por tabla) no hay problema. Para producción real con miles de tickets/movimientos, los siguientes endpoints pueden causar lentitud o OOM:

1. **GET /api/tickets** — todos los tickets sin paginación.
2. **GET /api/admin/users** — todos los usuarios sin paginación.
3. **GET /api/customers** — todos los clientes sin paginación.
4. **GET /api/inventory/ingredients** — todos los ingredientes sin paginación.
5. **GET /api/inventory/movements** — limit opcional pero sin offset.

## Trabajo pendiente

Para considerar la app PRODUCTION READY para volúmenes grandes, se debe agregar paginación a:

- [ ] `GET /api/tickets` — paginación por defecto 50.
- [ ] `GET /api/admin/users` — paginación 20-50.
- [ ] `GET /api/customers` — paginación 20-50.
- [ ] `GET /api/inventory/ingredients` — paginación 50.
- [ ] `GET /api/products` — paginación 50.

### Frontend

El frontend admin.js actualmente asume que el backend devuelve todos los registros y los renderiza en una sola tabla. Esto debe cambiar:

1. Agregar componente `Pagination` reutilizable.
2. Modificar cada `_renderXxx` para usar paginación.
3. Agregar controles de página (anterior/siguiente/ir a).
4. Mostrar total de registros.

## Decisión de release

Para v0.6.1, la paginación es **parcial**: los endpoints críticos para volúmenes pequeños funcionan, pero **NO se recomienda producción con > 10000 tickets o > 1000 usuarios/clientes** hasta completar la paginación real.

Lista en el release gate como: `⚠️ Paginación parcial — work pending`.
