# RBAC.md — Role-Based Access Control

## Overview

RBAC provides fine-grained permission control. Every critical endpoint is protected by a `requirePermission()` middleware that checks if the user's role has the required permission.

## Architecture

```
User → UserRole → RolePermissions → Permissions
                   (many-to-many)    (catalog of 27 permissions)
```

## Permission Catalog

### POS (15 permissions)

| Code | Name | Protected Routes |
|------|------|-----------------|
| pos.login | Login | POST /api/auth/login |
| pos.open_ticket | Open Ticket | POST /api/tickets |
| pos.add_order | Add Order | POST /api/tickets/:id/orders |
| pos.modify_order | Modify Order | (future) |
| pos.discount | Apply Discount | POST /api/tickets/:id/calculations |
| pos.gift | Gift Order | POST /api/tickets/:id/gift |
| pos.void | Void Ticket | POST /api/tickets/:id/void |
| pos.refund | Refund | POST /api/tickets/:id/refund |
| pos.split | Split Ticket | POST /api/tickets/:id/split |
| pos.merge | Merge Tickets | POST /api/tickets/merge |
| pos.payment | Process Payment | POST /api/tickets/:id/payments |
| pos.close_ticket | Close Ticket | POST /api/tickets/:id/close |
| pos.reopen_ticket | Reopen Ticket | (future) |
| pos.print | Print | POST /api/print/tickets/:id/send |
| pos.change_table | Change Table | (future) |

### Kitchen (5 permissions)

| Code | Name | Protected Routes |
|------|------|-----------------|
| kitchen.view | View KDS | GET /api/kitchen/* |
| kitchen.bump | Bump Order | POST /api/kitchen/orders/:id/bump |
| kitchen.serve | Serve Order | POST /api/kitchen/orders/:id/serve |
| kitchen.void | Void Kitchen Order | POST /api/kitchen/orders/:id/void |
| kitchen.recall | Recall Order | POST /api/kitchen/orders/:id/recall |

### Admin (7 permissions)

| Code | Name | Protected Routes |
|------|------|-----------------|
| manage.products | Manage Products | POST /api/products |
| manage.users | Manage Users | (future) |
| manage.inventory | Manage Inventory | POST /api/inventory/* |
| manage.printers | Manage Printers | POST /api/printers, POST /api/printers/:id/test |
| manage.kitchen | Manage Kitchen Config | (future) |
| reports.view | View Reports | (future) |
| admin.all | Admin Access | Bypasses all checks |

## Admin Bypass

Users with `UserRole.IsAdmin = 1` bypass ALL permission checks. The `admin.all` permission is also a wildcard — any role with `admin.all` can access everything.

## Default Role Assignments

| Role | Permissions |
|------|------------|
| Admin (IsAdmin=1) | ALL 27 permissions |
| Non-admin roles | All `pos.*` permissions |

## Caching

Role permissions are cached in memory (`rolePermissionCache`). The cache is loaded once per role on first access. To clear the cache (when roles are updated), call `clearPermissionCache()`.

## Usage in Routes

```javascript
const { requirePermission } = require('../middleware/rbac');

router.post('/:id/void',
  requirePermission('pos.void'),
  auditLog('ticket.void', 'Ticket'),
  async (req, res, next) => { /* handler */ }
);
```

If the user lacks the permission, returns:
```json
{
  "error": "ForbiddenError",
  "message": "Permission denied: requires 'pos.void'",
  "details": {
    "requiredPermission": "pos.void",
    "userRole": 2
  }
}
```
HTTP status: 403 Forbidden.

## Frontend Authorization

The frontend should check permissions before showing buttons. However, **the backend is the authority** — hiding a button in the UI does NOT prevent the API from rejecting the request.
