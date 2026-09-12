# ADMIN_GUIDE.md — Guía del Administrador

> Guía completa para usar el panel administrativo de SambaPos_LBA.

## Acceso

1. Login como usuario con rol **Administrator** (IsAdmin=1).
2. Click en botón "Admin" en el header (o botón engranaje).
3. Aparece el sidebar con 7 grupos de módulos.

## Estructura del sidebar

### General
- **Productos** — CRUD de menú (productos del POS).
- **Configuración** — Estado del sistema, impresoras, push, PWA.

### Personas
- **Usuarios** — CRUD completo con PIN + rol asignado.
- **Roles** — CRUD + matriz de permisos granulares (27 permisos).
- **Clientes** — CRUD con saldo de cuenta, créditos/débitos.

### Operación
- **Estaciones** — Dispositivos físicos (POS, KDS, Caja).
- **Áreas** — Áreas de producción (Cocina, Pizzería, Barra, Cafetería).
- **Impresoras** — Impresoras ESC/POS, áreas de impresión, reglas de routing.
- **Plantillas** — Plantillas de tickets (recibo, comanda, test).

### Productos
- **Recetas** — Recetas por porción con cálculo de costo y margen.
- **Combos** — Combos de productos con precio custom o suma.

### Inventario
- **Inventario** — Stock por almacén, alertas de stock bajo, movimientos.
- **Transferencias** — Traspasos entre almacenes (Principal → Cocina, etc.).

### Finanzas
- **Caja** — Sesiones de caja (abrir/cerrar), retiros, transferencias, eventos.
- **Reportes** — 9 tipos de reportes con filtro por fecha.

### Sistema
- **Sistema** — Info de versión, Node, uptime, WebSocket, salud.
- **Departamentos** — CRUD con link a almacén.
- **Tipos de Pago** — CRUD con account transaction type.
- **Settings** — ProgramSettings key-value editor.
- **Auditoría** — Viewer de audit logs (todas las mutaciones registradas).
- **Errores** — Errores de cliente capturados por error-reporter.js.

## Flujo recomendado de configuración inicial

### 1. Configurar estaciones
- Admin → Estaciones → Nueva estación
- Una POS-01 (DESKTOP), una KDS-01 (DESKTOP), una CAJA-01 (DESKTOP).
- Para cada KDS: click "Áreas" → vincular áreas de producción.
- Para cada KDS: click "KDS" → ajustar column count, refresh interval, sound.

### 2. Configurar áreas
- Admin → Áreas → ya están pre-cargadas: Cocina, Pizzería, Barra, Salón, Cafetería.
- Para cada área: click "Productos" → vincular productos que esa área prepara.

### 3. Configurar almacenes (Bloque 5)
- Backend: `POST /api/inventory/warehouses` con nombres (Principal, Cocina, Pizzería, Barra).
- Las áreas ya están vinculadas a warehouses via `WarehouseId`.

### 4. Configurar impresoras
- Admin → Impresoras → Nueva impresora.
- Una por área de producción + una para caja.
- Probar cada una con "Probar" → debe mostrar "OK".

### 5. Configurar plantillas
- Admin → Plantillas → ya están pre-cargadas: Recibo, Comanda cocina, Test.
- Editar plantilla si se necesita customizar.

### 6. Crear usuarios
- Admin → Usuarios → Nuevo usuario.
- Asignar rol (Mesero, Cajero, Cocinero, Admin).
- Setear PIN (4-8 dígitos).

### 7. Abrir caja
- Admin → Caja → Abrir caja.
- Ingresar monto inicial.
- La sesión queda abierta hasta cierre.

## Funcionalidades por sección

### Productos
- Listar todos los productos en tabla.
- Crear producto con nombre, código, grupo, precio.
- Editar producto existente.
- Eliminar producto.
- **Falta**: búsqueda, filtros por grupo, paginación.

### Usuarios
- Listar usuarios con rol y flag admin.
- Crear usuario con PIN encriptado (bcrypt).
- Editar nombre/rol/PIN.
- Desactivar (soft delete — se quita el rol pero se conserva el registro).
- **Falta**: búsqueda, paginación.

### Roles
- Listar roles.
- Crear nuevo rol.
- Ver/editar matriz de permisos por rol (27 permisos granulares).
- **Falta**: eliminación de rol (no implementado por seguridad).

### Clientes
- Listar clientes con saldo de cuenta.
- Crear/editar/desactivar clientes.
- Aplicar crédito o débito a cuenta corriente.
- **Falta**: búsqueda, paginación, ver historial de movimientos.

### Estaciones
- Listar estaciones con tipo, form factor, IP, hardware ID.
- Crear/editar/activar/desactivar.
- Vincular áreas de producción a cada estación KDS.
- Configurar KDS: columnas, refresh, auto-bump, sound, font scale.
- **Falta**: paginación, pero el volumen esperado es bajo (< 10 estaciones).

### Áreas
- Listar áreas con color swatch, código, almacén vinculado.
- Crear/editar/eliminar.
- Vincular productos a cada área (para routing KDS).
- **Falta**: paginación (no necesaria, 5-10 áreas típicas).

### Caja
- Ver sesión abierta con monto inicial y usuario.
- Abrir/cerrar sesión.
- Registrar retiro (payout) y transferencia.
- Ver eventos de sesión (open, sale, payout, transfer, close).
- Listar sesiones cerradas recientes.

### Reportes
- 9 reportes con filtro de fecha (desde/hasta):
  1. Resumen de ventas (total, ticket count, avg, voids, refunds).
  2. Dashboard en tiempo real (open tickets, active tables, kitchen orders, today sales).
  3. Top 10 productos.
  4. Ventas por categoría.
  5. Ventas por mesero.
  6. Pagos por tipo.
  7. Anulaciones y reembolsos.
  8. Resumen de inventario (total ingredientes, low stock, sin stock, valor).
  9. Sesiones de caja (abiertas, cerradas, total cash).
- **Falta**: exportación CSV/XLSX/PDF (no implementado).

### Errores
- Ver errores de cliente capturados automáticamente.
- Estadísticas: errores 24h, total histórico, por tipo, por plataforma.
- Ver detalle con stack trace completo.
- Limpiar logs (con confirmación).

### Auditoría
- Ver audit logs ordenados por fecha descendente.
- Columnas: acción, entidad, usuario, fecha, detalles.
- **Falta**: filtrar por usuario, filtrar por entidad, exportación.

## Permisos (RBAC)

27 permisos granulares agrupados:

- **Auth/Login**: `pos.login`
- **POS**: `pos.open_ticket`, `pos.add_order`, `pos.payment`, `pos.discount`, `pos.gift`, `pos.void`, `pos.refund`, `pos.split`, `pos.merge`, `pos.change_table`, `pos.close_ticket`, `pos.reopen_ticket`
- **Inventory**: `inventory.view`, `manage.inventory`, `inventory.transfer`, `inventory.adjust`
- **Kitchen**: `kitchen.view`, `kitchen.bump`, `kitchen.serve`, `kitchen.void`, `kitchen.recall`
- **Admin**: `users.manage`, `settings.manage`, `manage.products`, `manage.printers`, `customers.manage`, `manage.users`
- **Reports**: `reports.view`
- **Cash**: `cash.manage`

Para asignar permisos: Admin → Roles → Permisos → toggle checkbox por permiso.

## Limitaciones conocidas (v0.6.1)

- **Paginación parcial**: solo audit-logs y errors tienen paginación real. Listar usuarios/clientes no pagina.
- **Sin búsqueda**: la mayoría de las secciones no tienen search input.
- **Sin ordenamiento**: las tablas no permiten click en headers para ordenar.
- **Sin exportación**: CSV/XLSX/PDF no implementados.
- **PostgreSQL**: experimental, no recomendado para producción.
- **E2E en CI**: continue-on-error, no es gate estricto.

## Próximos pasos recomendados

1. Implementar paginación en endpoints de volumen (tickets, usuarios, clientes).
2. Agregar search input a todas las secciones.
3. Implementar exportación CSV de reportes.
4. Validar PostgreSQL end-to-end o eliminarlo.
5. Agregar E2E smoke para flujo login → POS → cobro.
