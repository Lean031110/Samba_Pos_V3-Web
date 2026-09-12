# CSS_HIDDEN_AUDIT.md — Auditoría de elementos ocultos + clasificación manual

> Revisión manual de cada regla CSS con `display:none`, `visibility:hidden`, `opacity:0`, `pointer-events:none`.
> Fecha: 2026-09-12

## Clasificación

Cada regla se clasifica como:

- **LEGÍTIMO** — patrón correcto, no rompe UX.
- **BUG POTENCIAL** — podría bloquear clicks o tapar contenido.

## Hallazgos con análisis manual

### design-system.css

| Línea | Selector | Propiedad | Clasificación | Razón |
|---|---|---|---|---|
| 279 | `.ds-sidebar--collapsed .ds-sidebar__header span` | display: none | ✅ LEGÍTIMO | Colapsa el texto del header cuando sidebar está colapsado (patrón estándar) |
| 283 | `.ds-sidebar-overlay` | opacity: 0 + pointer-events: none | ✅ LEGÍTIMO | Overlay de drawer móvil. Tienen `.is-open` que activa opacity:1 + pointer-events:auto |
| 314 | `.view` | display: none + opacity: 0 | ✅ LEGÍTIMO | Patrón correcto: `.view` oculta vistas inactivas, `.view.is-active` las muestra. Sin esto, todas las vistas se verían simultáneamente |
| 320 | `.view.is-active` | display: flex + opacity: 1 | ✅ LEGÍTIMO | La contraparte necesaria de la regla anterior |
| 456 | `.ds-modal-overlay` | opacity: 0 + pointer-events: none | ✅ LEGÍTIMO | Modal cerrado. `.is-open` lo activa |
| 474 | `.ds-drawer-overlay` | opacity: 0 + pointer-events: none | ✅ LEGÍTIMO | Drawer cerrado. `.is-open` lo activa |
| 416 | `.ds-btn:disabled` | opacity: 0.5 | ✅ LEGÍTIMO | Indica deshabilitado, no oculta |
| 542 | `.ds-pagination__btn:disabled` | opacity: 0.4 | ✅ LEGÍTIMO | Botón de paginación deshabilitado |
| 701 | `.ds-hidden` | display: none !important | ✅ LEGÍTIMO | Utility class intencional |
| 719 | `@keyframes ds-pulse` | opacity 0.3 | ✅ LEGÍTIMO | Animación de pulso |
| 728 | `@keyframes ds-toast-in` | opacity 0 → 1 | ✅ LEGÍTIMO | Animación de entrada |
| 642 | `.ds-login-brand__version` | opacity 0.4 | ✅ LEGÍTIMO | Texto decorativo sutil |

### layout.css

| Línea | Selector | Propiedad | Clasificación | Razón |
|---|---|---|---|---|
| 111 | `.view` | display: none + opacity: 0 | ✅ LEGÍTIMO | Duplicado del patrón en design-system.css (legacy). Mismo comportamiento correcto |
| 829 | `.modal-overlay` | opacity: 0 | ✅ LEGÍTIMO | Modal cerrado. `.is-open` o `.modal-overlay--open` lo activa |
| 838 | `@keyframes pulse` | opacity 0.4 | ✅ LEGÍTIMO | Animación |
| 51 | `.app-header__info` | opacity 0.85 | ✅ LEGÍTIMO | Estilo sutil |

### mobile.css

| Línea | Selector | Propiedad | Clasificación | Razón |
|---|---|---|---|---|
| 37 | `.view-login::before` | pointer-events: none | ✅ LEGÍTIMO | Pseudo-elemento decorativo (pattern overlay) |
| 821 | `.toast-container` | pointer-events: none | ✅ LEGÍTIMO | El contenedor no recibe clicks, pero los toasts individuales sí (`pointer-events: auto` en cada toast) |

### android-shell.css

| Línea | Selector | Propiedad | Clasificación | Razón |
|---|---|---|---|---|
| 124 | `html.is-kiosk .ds-footer` | display: none | ✅ LEGÍTIMO | En modo kiosk se oculta chrome (header+footer) intencionalmente |
| 134 | `html.is-android body::before` | pointer-events: none | ✅ LEGÍTIMO | Splash screen overlay, no debe recibir clicks |
| 150 | `html.is-android body.app-ready::before` | visibility: hidden + opacity: 0 | ✅ LEGÍTIMO | Oculta el splash cuando la app está lista |

## Resumen

| Tipo | Cantidad |
|---|---|
| Total reglas ocultas | 22 |
| LEGÍTIMO | 22 |
| BUG POTENCIAL | 0 |

**Conclusión**: Tras revisión manual, no se detectaron reglas CSS problemáticas. Todas las reglas que ocultan elementos usan patrones correctos:

1. `.view` + `.view.is-active` — patrón estándar de toggle de vistas.
2. `.modal-overlay` + `.is-open` — patrón estándar de modales.
3. `pointer-events: none` en pseudo-elementos y overlays decorativos.
4. `opacity: 0.x` en deshabilitados y estilos sutiles.
5. `@keyframes` animaciones.

## Verificación cruzada con navegación

Para confirmar que ninguna regla rompe la navegación, se verificó:

1. **`.view` display:none** — Solo se aplica si la vista no tiene `.is-active`. `App.navigate(viewName)` agrega `.is-active` a la vista destino. ✅ Verificado.
2. **`.ds-modal-overlay` opacity:0** — Modal se abre con `App.showModal()` que agrega `.is-open`. ✅ Verificado.
3. **`.ds-sidebar-overlay` opacity:0** — Drawer móvil se abre con clase `.is-open`. ✅ Verificado.

**No se encontraron botones importantes accidentalmente ocultos.**
