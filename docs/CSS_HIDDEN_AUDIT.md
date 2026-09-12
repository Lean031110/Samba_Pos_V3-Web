# CSS Hidden Elements Audit

> Generado automáticamente por `scripts/audit-css-hidden.js`
> Fecha: 2026-09-12T12:15:31.129Z

## Resumen

- Total findings: 22
- Intentional (with .hidden, :hover, @media context): 7
- Potentially problematic (need manual review): 15

## Hallazgos

| Archivo | Línea | Selector | Propiedad | ¿Intencional? |
|---|---|---|---|---|
| design-system.css | 279 | `.ds-sidebar--collapsed .ds-sidebar__header span` | display: none | ⚠️ REVISAR |
| design-system.css | 283 | `.ds-sidebar-overlay` | opacity: 0 | ⚠️ REVISAR |
| design-system.css | 283 | `.ds-sidebar-overlay` | pointer-events: none | ✅ SÍ |
| design-system.css | 314 | `.view` | display: none | ⚠️ REVISAR |
| design-system.css | 314 | `.view` | opacity: 0 | ⚠️ REVISAR |
| design-system.css | 456 | `.ds-modal-overlay` | opacity: 0 | ⚠️ REVISAR |
| design-system.css | 456 | `.ds-modal-overlay` | pointer-events: none | ✅ SÍ |
| design-system.css | 474 | `.ds-drawer-overlay` | opacity: 0 | ⚠️ REVISAR |
| design-system.css | 474 | `.ds-drawer-overlay` | pointer-events: none | ✅ SÍ |
| design-system.css | 564 | `.ds-hidden` | display: none | ✅ SÍ |
| layout.css | 111 | `.view` | display: none | ⚠️ REVISAR |
| layout.css | 111 | `.view` | opacity: 0 | ⚠️ REVISAR |
| layout.css | 829 | `.modal-overlay` | opacity: 0 | ⚠️ REVISAR |
| layout.css | 829 | `.modal-overlay` | pointer-events: none | ✅ SÍ |
| mobile.css | 37 | `.view-login::before` | pointer-events: none | ⚠️ REVISAR |
| mobile.css | 772 | `.modal-overlay` | display: none | ✅ SÍ |
| mobile.css | 821 | `.toast-container` | pointer-events: none | ⚠️ REVISAR |
| android-shell.css | 124 | `html.is-kiosk .ds-footer` | display: none | ⚠️ REVISAR |
| android-shell.css | 134 | `html.is-android body::before` | z-index: 9999 | ✅ SÍ |
| android-shell.css | 134 | `html.is-android body::before` | pointer-events: none | ⚠️ REVISAR |
| android-shell.css | 150 | `html.is-android body.app-ready::before` | visibility: hidden | ⚠️ REVISAR |
| android-shell.css | 150 | `html.is-android body.app-ready::before` | opacity: 0 | ⚠️ REVISAR |

## Análisis

Las propiedades que ocultan elementos (`display: none`, `visibility: hidden`, `opacity: 0`, `pointer-events: none`) son legítimas cuando:

- Están dentro de `@media` queries (responsive design)
- Están en selectores que se activan condicionalmente (`.is-hidden`, `.hidden`, `[hidden]`)
- Son parte de animaciones (`@keyframes`, transiciones)
- Se aplican a overlay/backdrop con `pointer-events: none` para clicks

Los marcados como **REVISAR** pueden ser problemas si bloquean clicks o contenido sin razón aparente.
