# ADMIN_UI_AUDIT.md — Auditoría de secciones administrativas

> Generado automáticamente por `scripts/audit-admin-ui.js`
> Fecha: 2026-09-12T12:15:31.159Z

## Capabilities verificadas por sección

Para cada sección se verifica la presencia de:
- **Listar** — tabla de datos
- **Buscar** — input de búsqueda
- **Filtrar** — filtros por estado/tipo
- **Ordenar** — ordenamiento de columnas
- **Crear** — botón "Nuevo"
- **Editar** — edición de registros
- **Eliminar/Desactivar** — eliminación o desactivación
- **Ver detalle** — modal de detalle
- **Paginación** — controles de paginación
- **Loading state** — estado de carga
- **Empty state** — estado vacío
- **Error handling** — manejo de errores

| Sección | Listar | Buscar | Filtrar | Ordenar | Crear | Editar | Eliminar | Desactivar | Ver detalle | Paginación | Loading state | Empty state | Error handling |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Productos | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Inventario | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Recetas | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Impresoras | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Plantillas | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Caja | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Reportes | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Configuración | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Usuarios | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Roles | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Estaciones | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Áreas | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Combos | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Transferencias | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Sistema | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Errores | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Auditoría | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Departamentos | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Tipos de Pago | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Settings | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

## Resumen de completitud

- Secciones auditadas: 21
- Capabilities verificadas: 13 por sección
- Total checks: 273
- ✅ Pasados: 117 (42.9%)
- ❌ Faltantes: 156

## Sections sin paginación real

Las siguientes secciones NO implementan paginación en la UI (aunque el backend la soporte parcialmente):

- Productos: ❌ sin paginación
- Inventario: ❌ sin paginación
- Recetas: ❌ sin paginación
- Impresoras: ❌ sin paginación
- Plantillas: ❌ sin paginación
- Caja: ❌ sin paginación
- Reportes: ❌ sin paginación
- Configuración: ❌ sin paginación
- Usuarios: ❌ sin paginación
- Roles: ❌ sin paginación
- Clientes: ❌ sin paginación
- Estaciones: ❌ sin paginación
- Áreas: ❌ sin paginación
- Combos: ❌ sin paginación
- Transferencias: ❌ sin paginación
- Sistema: ❌ sin paginación
- Errores: ❌ sin paginación
- Auditoría: ❌ sin paginación
- Departamentos: ❌ sin paginación
- Tipos de Pago: ❌ sin paginación
- Settings: ❌ sin paginación
