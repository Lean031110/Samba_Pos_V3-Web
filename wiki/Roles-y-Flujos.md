# Roles y flujos de negocio

## Navegación por rol

Tras el login, el router (`frontend/js/app.js`) decide la vista según
el rol (método `_destForUser`):

| Rol | Destino | Vista |
|-----|---------|-------|
| Administrador | `/dashboard` | KPIs, administración completa |
| Mesero / Dependiente | `/pos` (selector de áreas → mesas) | Pedido y cobro |
| Cocina | `/kitchen` | KDS full-screen |
| Cajero | `/cash` | Caja |

El selector de **Áreas** es la puerta común: mesas agrupadas por zona
(Salón, Terraza…), estado visible por color (libre/ocupada/cuenta).
Dentro de la sesión el usuario navega según permisos (el menú se
construye con lo que su rol permite).

## RBAC — 27 permisos

Arquitectura: `User → Role → RolePermissions → Permissions` (catálogo).
Cada endpoint crítico pasa por el middleware `requirePermission()`.

### POS (15)
`pos.login` · `pos.open_ticket` · `pos.add_order` · `pos.modify_order`*
· `pos.discount` · `pos.gift` · `pos.void` · `pos.refund` · `pos.split`
· `pos.merge` · `pos.payment` · `pos.close_ticket` · `pos.reopen_ticket`*
· `pos.print` · `pos.change_table`*
(\* reservados para rutas futuras)

### Kitchen (5)
`kitchen.view` · `kitchen.update_status` · `kitchen.bump_order` ·
`kitchen.reprint` · `kitchen.station_manage`

### Cash (3)
`cash.session_open` · `cash.session_close` · `cash.payout`

### Inventory (2) + Admin (2)
`inventory.view` · `inventory.adjust` · `admin.users` · `admin.reports`

Detalle con rutas exactas protegidas: `docs/RBAC.md`. Todas las
acciones sensibles dejan registro en el **audit log** (quién, qué,
cuándo) — la suite de seguridad lo verifica.

### Roles del seed

| Rol | Perfil de permisos |
|-----|--------------------|
| Administrador | todos (27) |
| Mesero | POS operativo (sin void/refund) |
| Cocinero | kitchen + view de tickets |
| Cajero | POS pago/cierre + cash |

## Flujo POS (mesero)

```
Áreas → elegir mesa (Ocupada/Libre) → POS
  → buscar producto (categorías/favoritos) → añadir (modificadores, notas)
  → descuentos / regalos / mover a otra mesa
  → ENVIAR A COCINA (ordena por estación, dispara KDS en tiempo real)
  → cobrar: Payment (numpad) → método → división/split → cambio
  → cerrar ticket → imprime (si hay cola de impresión) → mesa libre
```

Offline: si se cae la red, el outbox (IndexedDB) encola con orden
garantizada `ticket → orders → payment → close` y reintenta al volver
(persistencia y JWT-expiry check verificados por suite de tests).

## Flujo KDS (cocina)

```
Estación (Cocina / Pizzería / Barra) → tickets entrantes en tiempo real
  → cada item con estado (nuevo → en_preparación → listo/servido)
  → SLA visual: los tickets que exceden el tiempo objetivo pasan a
    "URGENTE" (destacado en rojo)
  → bump de orden (servida) → propagación a displays y voids en vivo
```

Los eventos llegan por Socket.io con rooms por estación/rol; el
reconnect hace **resync** de estado para no perder órdenes vistas
durante la desconexión.

## Flujo Caja (cajero)

```
Apertura (fondo inicial) → operación del día (venta registrada)
  → payouts (retiros parciales con motivo) → arqueo parcial
  → cierre de caja (conteo final vs esperado → diferencias)
```

Los work periods agrupan sesiones para los reportes.

## Flujo Administrador

- **Dashboard**: KPIs del día (ventas, tickets, tiempo medio)
- **Inventario**: stock, traspasos, kardex, recetas versionadas,
  combos; la **deducción al cierre de ticket es transaccional**
  (recetas → ingredientes, rollback si algo falla)
- **Reportes**: ventas por periodo, top productos, tickets
  cerrados/anulados/reembolsados
- **Configuración**: usuarios/roles, plantillas de impresión (con
  preview ESC/POS), métodos de pago

## Métodos de pago

Del seed: **Efectivo CUP · USD · MLC** (+ tarjetas/Transfermóvil
según configuración del local — el catálogo `PaymentMethods` es
editable por el admin). El numpad calcula cambio y soporta pagos
mixtos/split; refunds y voids con permiso y audit.

## Impresión

Plantillas editables (recibo/cocina) con preview; el backend mantiene
una **cola persistente** con idempotency keys, transporte TCP ESC/POS
con retry exponencial y fallback. Sin impresora configurada, la cola
retiene y reintenta (no se pierden tickets).
