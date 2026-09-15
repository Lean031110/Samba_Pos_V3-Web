# ADMIN_UI_AUDIT.md — Auditoría real con clasificación PASS/PARTIAL/MISSING

> Generado por `scripts/audit-admin-ui-v2.js`
> Fecha: 2026-09-14T23:31:48.913Z
> Reemplaza al audit anterior (que solo contaba presence/absence binaria).

## Capabilities verificadas

Para cada sección × capability, se clasifica como:

- **PASS**: funcionalidad completa implementada y wired a backend.
- **PARTIAL**: funcionalidad existe pero incompleta (ej: search input pero no wired).
- **MISSING**: no implementado.
- **NOT_APPLICABLE**: no aplica para esta sección (ej: paginar en "Sistema").

## Matriz por sección

| Sección | Prioridad | listar | buscar | filtrar | ordenar | paginar | crear | editar | eliminar | desactivar | ver_detalle | loading | empty | error | permisos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Productos | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | — | ❌ | ✅ | ✅ | ✅ | — |
| Usuarios | 🔴 Crítica | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | — | ❌ | ✅ | ✅ | ✅ | — |
| Roles | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | — | ❌ | ✅ | ✅ | ✅ | ✅ |
| Clientes | 🔴 Crítica | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | — |
| Estaciones | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Áreas | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | — | ❌ | ✅ | ✅ | ✅ | — |
| Tipos de Pago | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Settings | 🔴 Crítica | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Caja | 🔴 Crítica | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Inventario | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Impresoras | 🔴 Crítica | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Departamentos | 🟡 Importante | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Combos | 🟡 Importante | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | — | ❌ | ✅ | ✅ | ✅ | — |
| Recetas | 🟡 Importante | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Transferencias | 🟡 Importante | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Plantillas | 🟡 Importante | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Reportes | 🟡 Importante | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ❌ | — |
| Auditoría | 🟢 Opcional | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ✅ | — |
| Errores | 🟢 Opcional | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ⚠️ | — | ✅ | ✅ | ✅ | ✅ | — |
| Sistema | 🟢 Opcional | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ❌ | ❌ | — |
| Configuración | 🟢 Opcional | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ❌ | — |

## Resumen

| Estado | Cantidad | % |
|---|---|---|
| ✅ PASS | 119 | 40.5% |
| ⚠️ PARTIAL | 43 | 14.6% |
| ❌ MISSING | 92 | 31.3% |
| — NOT_APPLICABLE | 40 | — |
| **Total** | 294 | 100% |

## Priorización para hardening

### Secciones críticas (prioridad 1) — deben estar PASS

- **Productos**: MISSING ver_detalle
- **Usuarios**: MISSING filtrar, ver_detalle
- **Roles**: MISSING paginar, ver_detalle
- **Clientes**: MISSING filtrar, eliminar, ver_detalle
- **Estaciones**: MISSING paginar, eliminar, ver_detalle
- **Áreas**: MISSING paginar, ver_detalle
- **Tipos de Pago**: MISSING paginar, editar, eliminar, ver_detalle
- **Settings**: MISSING buscar, filtrar, ordenar, paginar, eliminar, ver_detalle
- **Caja**: MISSING buscar, filtrar, ordenar, paginar, crear, editar, eliminar, ver_detalle
- **Inventario**: MISSING paginar, editar, eliminar, ver_detalle
- **Impresoras**: MISSING paginar, eliminar, ver_detalle

### Secciones importantes (prioridad 2)

- **Departamentos**: MISSING: paginar, editar, eliminar, ver_detalle PARTIAL: filtrar, crear
- **Combos**: MISSING: paginar, ver_detalle PARTIAL: filtrar, crear, editar, eliminar
- **Recetas**: MISSING: paginar, editar, eliminar, ver_detalle PARTIAL: filtrar
- **Transferencias**: MISSING: paginar, editar, eliminar, ver_detalle PARTIAL: filtrar, crear
- **Plantillas**: MISSING: paginar, eliminar, ver_detalle PARTIAL: filtrar, crear, editar
- **Reportes**: MISSING: buscar, filtrar, ordenar, paginar, crear, editar, eliminar, ver_detalle, error 

## Recomendación

- Coverage total PASS: 40.5%
- Secciones críticas con MISSING: 38
- Próximo foco: implementar pagination + search en secciones críticas
