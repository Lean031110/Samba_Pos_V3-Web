# FASE 4 — Reorganización del repositorio + Identidad visual + PWA + Mobile-first

**Fecha:** 2026-09-07
**Estado:** 🚧 EN PROGRESO (batch 1 de varios)
**Baseline:** FASE 3 completada — 244/244 tests PASS

---

## Objetivos de Fase 4

Según el *prompt maestro* del usuario, Fase 4 debe entregar:

1. **Reorganización del repositorio** — eliminar `samba-web-clone/` y dejar todo en la raíz.
2. **Identidad visual azul** — el color de marca debe ser azul, con una familia completa de tonalidades.
3. **POS móvil** — diseñado primero para tablets Android (7", 8", 10"+), pantallas táctiles, portrait y landscape.
4. **Comandero** — flujo completo: login → mesa → ticket → productos → modificadores → notas → enviar cocina → recibir cambios → cobrar → imprimir.
5. **Cocina / KDS** — profesional, con sonido, vibración, indicadores visuales, prioridad, tiempo transcurrido, reconexión automática.
6. **Impresión** — arquitectura real con `PrintJob`, `PrinterManager`, `PrinterDriver`, `PrintQueue` (no mock). Idempotencia con reintento y fallback.
7. **Recetas** — administración completa: producto → ingredientes → cantidad → unidad → costo. Cálculo de costo, margen y precio sugerido. Descuento automático de inventario al vender.
8. **Administración** — panel completo (productos, categorías, recetas, ingredientes, inventario, almacenes, etc.).
9. **Tiempo real** — WebSocket con reconnect, backoff exponencial, heartbeat, detección offline, sincronización post-reconexión.
10. **Push notifications** — Web Push + Service Worker (no confundir con WebSocket).
11. **PWA / Android** — manifest, service worker, icons, standalone, offline shell, install prompt.
12. **Offline** — tolerancia a pérdida temporal de red con local queue, idempotency keys, control de conflictos.
13. **Seguridad** — JWT, RBAC, rate limiting, validación, sanitización, CORS, headers, CSRF, SQL injection, XSS, secrets, logs, auditoría.

Este reporte documenta el **batch 1** de Fase 4, que cubre los puntos 1, 2, 3, 4 (parcial), 9, 10 (parcial) y 11. Los puntos 5 (KDS), 6 (impresión real), 7 (recetas), 8 (admin), 12 (offline real) y 13 (auditoría) se cubren en batches posteriores.

---

## Cambios realizados (batch 1)

### 1. Reorganización del repositorio

**Commit:** `chore(repo): reorganize — move samba-web-clone/ content to root`

- Eliminada la carpeta envoltorio `samba-web-clone/` — todo el contenido se movió a la raíz con `git mv` (preserva historial).
- Eliminado del repo: `.env` (real, con `DATABASE_URL`), `tool-results/` (artefactos de agente), `download/` (placeholder).
- Movido `worklog.md` (91 KB histórico) → `docs/worklog-history.md`.
- Actualizadas todas las referencias a `samba-web-clone/` en:
  - `backend/src/infrastructure/db/knexfile.js` (comentario)
  - `backend/scripts/run-all-tests.sh` (ruta relativa al script)
  - `backend/scripts/smoke-fase3.sh` (ruta relativa al script)
  - `backend/scripts/debug-fase3.js` (paths relativos al script)
  - `.github/workflows/ci.yml` (comentario)
  - `backend/package.json` — renombrado a `sambapos-lba-backend` v0.4.0
  - `backend/src/api/server.js` — `/health` service y `/version` name ahora dicen `sambapos-lba`
- `.gitignore` actualizado para excluir `tool-results/`, `download/`, `agent-ctx/`.
- README actualizado con la nueva estructura de árbol.

### 2. README profesional

**Commit:** `docs(readme): professional README — Fase 4 identity, 244 tests, PWA section`

- Badges: CI, License, Node, Tests (244/244), Vulnerabilities (0), Version (0.4.0), PWA installable.
- Sección "Identidad visual" describiendo la paleta azul.
- Sección "PWA / Android" explicando instalación + Capacitor como futuro path.
- Roadmap actualizado: FASE 0-3 completadas, FASE 4 en progreso, FASES 5-18 enumeradas con scope concreto.
- Conteo de tests corregido (244 = 217 unit + 27 E2E).
- Estructura del proyecto actualizada (post-reorganización).

### 3. Identidad visual azul

**Commit:** `feat(phase-4): PWA installable + blue brand identity + mobile-first responsive`

- `frontend/css/variables.css` — nuevas variables canónicas `--lba-*`:
  - Familia azul: `--lba-blue-50` a `--lba-blue-900` (10 tonos).
  - Surfaces: `--lba-shell-bg` (gradiente azul 135°), `--lba-bg-app`, `--lba-bg-panel`, `--lba-bg-elevated`, `--lba-bg-sidebar`, `--lba-bg-header`.
  - Texto: `--lba-fg-default` (navy), `--lba-fg-inverse` (white), `--lba-fg-on-blue`, `--lba-fg-muted`, `--lba-fg-link`, colores semánticos.
  - Acentos: `--lba-accent`, hover, pressed.
  - Borders, shadows, radii, animations con tono azul.
  - Touch targets: 48/56/64/80px (móvil-first).
  - Typography: stack moderno con `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`.
  - Breakpoints responsive: sm/md/lg/xl/2xl.
- Variables `--samba-*` legacy mantenidas como alias para no romper CSS existente.

### 4. POS móvil responsive

**Commit:** `feat(phase-4): PWA installable + blue brand identity + mobile-first responsive`

- `frontend/css/mobile.css` (nuevo) — layout mobile-first completo:
  - **Login**: card centrada con gradiente azul, keypad táctil grande, inputs con focus azul.
  - **Header**: sticky, blue, safe-area (notch), connection indicator con clases online/offline.
  - **POS**: grid responsive (2 → 3 → 4 → 5 → 6 columnas a 600/768/1024/1280px), botones de producto 80px, command bar sticky.
  - **Payment**: numpad 64px, payment types grid, summary panel.
  - **Modal**: max-width responsive, overlay azul.
  - **Toast**: bottom-anchored, borde izquierdo coloreado por severidad.
  - **PWA install banner** + **SW update banner** styles.
  - Safe-area insets en iOS/Android (notch, gesture nav).

### 5. PWA: manifest + service worker + icons + offline page

**Commits:**
- `feat(phase-4): PWA installable + blue brand identity + mobile-first responsive`
- `feat(kds): Fase 4 — sound two-tone chime + vibration + browser notifications`

- `frontend/manifest.webmanifest` — standalone, theme_color #044392, 4 icons (192/512, normal + maskable), 3 shortcuts (POS/KDS/Dashboard).
- `frontend/sw.js` — Service Worker con:
  - Precache de offline shell (CSS, JS, manifest, vendor).
  - Cache-first para assets estáticos.
  - Network-first para navigations (fallback a cached shell o `/offline.html`).
  - Stale-while-revalidate para imágenes.
  - NUNCA cachea `/api/*`, `/health`, `/ready`, `/version`, `/socket.io/`.
  - Versionado `sambapos-lba-v0.4.0` para forzar cleanup en cada release.
  - `self.skipWaiting()` + `clients.claim()` para activación inmediata.
- `frontend/offline.html` — página branded "Sin conexión" con retry.
- `frontend/icons/` — 5 PNGs generados con `node backend/scripts/generate-icons.js` (usa `node-canvas`):
  - `icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`, `favicon.png`.
  - Diseño: gradiente azul, "POS" wordmark, "LBA" label, barcode motif. Maskable con 10% safe padding.
- `frontend/index.html`:
  - `<link rel="manifest">`, `<link rel="icon">`, `<link rel="apple-touch-icon">`.
  - `<meta name="theme-color">`, `apple-mobile-web-app-*`, `mobile-web-app-capable`.
  - `viewport-fit=cover` para soportar notch.
  - Script de registro de SW con escucha de `updatefound` y dispatch de `sw:update-available`.
- `frontend/js/services/pwa.js` (nuevo) — `window.SambaPWA` API:
  - Captura `beforeinstallprompt` para custom install UI.
  - `_showUpdateBanner()` muestra banner verde "Nueva versión disponible — Actualizar / Más tarde".
  - `promptInstall()` async que retorna `true` si el usuario aceptó.
  - `onInstallState(cb)` para que la app suscriba a cambios de `canInstall`.

### 6. WebSocket con heartbeat + reconnect mejorado

**Commit:** `feat(phase-4): PWA installable + blue brand identity + mobile-first responsive`

- `frontend/js/store/websocket-client.js` — mejoras:
  - **Heartbeat**: ping cada 25s, force-reconnect si no ack en 10s (detecta conexiones colgadas que socket.io no detecta).
  - **`online` / `offline` events** del navegador para detectar pérdida de red.
  - **Indicador visual**: clases CSS `conn-indicator--online` (verde), `conn-indicator--offline` (rojo), `is-reconnecting` (naranja).
  - Toast "Conexión restablecida" tras reconnect exitoso.

### 7. KDS profesional (Fase 4 — batch 2)

**Commit:** `feat(kds): Fase 4 — sound two-tone chime + vibration + browser notifications`

- `frontend/js/views/kitchen.js` — mejoras significativas:
  - **Sonido two-tone chime** (A5 880Hz + E5 660Hz) — más distintivo que beep único.
  - **Vibración** en Android con `navigator.vibrate([200,100,200])`.
  - **Browser Notifications** — si el usuario otorga permiso, se muestra notificación del sistema "Nuevo pedido: #<ticket>" con icono/badge, click-to-focus, auto-close 10s.
  - **State filter**: active / ready / served / all — default 'active'.
  - **Station tabs con count badge** — muestra cuántos pedidos activos hay por estación.
  - **Sort by Priority desc, then CreatedAt asc** — pedidos urgentes arriba.
  - **Urgent indicator** — card pulsa rojo después de 10 min (5 min para priority). Timer pill parpadea.
  - **Auto-refresh cada 30s** como safety net más allá de WebSocket events.
  - **Tracking de IDs conocidos** (`_lastOrderIds` Set) — sonido/vibración solo para pedidos genuinamente nuevos, no en primera carga.
  - **`requestNotificationPermission()` method** para llamar desde un gesto del usuario.
- `frontend/css/mobile.css` — estilos KDS nuevos:
  - `.kds-toolbar` con stations + filters + sound/vibration toggles.
  - `.kds-card` variants por estado (new, accepted, preparing, ready, served, void).
  - `.kds-card--urgent` con `@keyframes kds-urgent-pulse` (glow rojo pulsante).
  - `.kds-timer--urgent` con blink animation.
  - `.kds-priority-badge` rojo pill.
  - `.kds-btn` variants por acción.
  - Responsive: KDS colapsa a 1 columna en phones.

### 8. Bugfix /version endpoint

**Commit:** `feat(phase-4): PWA installable + blue brand identity + mobile-first responsive`

- `backend/src/api/server.js:107` — `require('../../../package.json')` era incorrecto (buscaba en `<repo-root>/package.json`). Corregido a `require('../../package.json')` (busca en `backend/package.json`).
- Bug preexistente desde antes de la reorganización — nunca se había detectado porque el endpoint `/version` no estaba en los tests E2E.

### 9. Documentación

- `docs/PWA.md` (nuevo) — guía completa de instalación, manifest, service worker, offline, push, Capacitor futuro, troubleshooting.

---

## Archivos modificados / creados

### Creados

- `frontend/manifest.webmanifest`
- `frontend/sw.js`
- `frontend/offline.html`
- `frontend/icons/icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`, `favicon.png`
- `frontend/css/mobile.css`
- `frontend/js/services/pwa.js`
- `backend/scripts/generate-icons.js`
- `docs/PWA.md`
- `docs/PHASE4_REPORT.md` (este archivo)

### Modificados

- `frontend/css/variables.css` — paleta azul canónica.
- `frontend/index.html` — manifest, icons, SW registration, mobile.css, pwa.js.
- `frontend/js/store/websocket-client.js` — heartbeat, online/offline, indicators.
- `frontend/js/views/kitchen.js` — KDS profesional con sonido, vibración, notifications.
- `backend/src/api/server.js` — servicio/version renombrado a `sambapos-lba`, bugfix `/version` package.json path.
- `backend/src/infrastructure/db/knexfile.js` — comentario actualizado.
- `backend/package.json` — name → `sambapos-lba-backend`, version → `0.4.0`.
- `backend/scripts/run-all-tests.sh` — ruta relativa al script.
- `backend/scripts/smoke-fase3.sh` — ruta relativa al script.
- `backend/scripts/debug-fase3.js` — paths relativos al script.
- `backend/tests/e2e/ui-isolated.spec.js` — test B3 actualizado para `.kds-toolbar`.
- `.gitignore` — excluye `tool-results/`, `download/`, `agent-ctx/`.
- `.github/workflows/ci.yml` — header actualizado con nueva estructura.
- `README.md` — badges, identidad, PWA section, roadmap, estructura del proyecto.
- `docs/worklog-history.md` — movido desde raíz.

### Eliminados

- `samba-web-clone/` (wrapper eliminado, contenido movido a raíz).
- `.env` (raíz — contenido real con `DATABASE_URL`).
- `tool-results/` (24 archivos de artefactos de agente).
- `download/README.md` (placeholder).
- `worklog.md` (movido a `docs/worklog-history.md`).

---

## Migraciones

Ninguna migración de base de datos en este batch. El esquema existente (7 migraciones Knex) se mantiene sin cambios.

---

## Tests ejecutados

### Unit tests (217)

| Suite | Tests | Resultado |
|-------|------:|----------|
| `api-integration.test.js` | 47 | ✅ PASS |
| `kds-verification.test.js` | 49 | ✅ PASS |
| `inventory-verification.test.js` | 13 | ✅ PASS |
| `concurrency-verification.test.js` | 8 | ✅ PASS |
| `idempotency-verification.test.js` | 7 | ✅ PASS |
| `domain-verification.test.js` | 72 | ✅ PASS |
| `security-verification.test.js` | 21 | ✅ PASS |
| **Total unit** | **217** | **✅ 217/217 PASS** |

### E2E tests (Playwright + Chromium) — 27

| Suite | Tests | Resultado |
|-------|------:|----------|
| `api-isolated.spec.js` | 15 | ✅ PASS (1 flaky A15 — pre-existing race) |
| `ui-isolated.spec.js` | 5 | ✅ PASS (B3 actualizado para `.kds-toolbar`) |
| `websocket-flow.spec.js` | 7 | ✅ PASS |
| **Total E2E** | **27** | **✅ 27/27 PASS** (1 flaky) |

### Lint

```
find src tests scripts -name '*.js' -type f -print0 | xargs -0 -n1 node --check
→ PASS (all .js files syntax-valid)
```

### Smoke test del servidor

- `/health` → `200 {"status":"ok","service":"sambapos-lba",...}`
- `/version` → `200 {"name":"sambapos-lba","version":"0.4.0",...}`
- `/manifest.webmanifest` → `200` (JSON válido)
- `/sw.js` → `200` (JS válido)
- `/icons/icon-192.png` → `200 6753 bytes` (PNG válido)
- `/` (index.html) → `200` con manifest link y SW registration

### Docker build

No ejecutado en este batch. CI lo ejecutará en el push.

---

## Riesgos

1. **Tests flaky (A15, C6)** — pre-existing race conditions en tests de integración. No introducidos por este batch. El CI usa `--repeat-each=2` para mitigar.

2. **Iconos generados con canvas placeholder quality** — los iconos son funcionales pero estéticamente básicos. Se recomienda reemplazar con diseño profesional antes de publicación pública. El script `backend/scripts/generate-icons.js` está listo para iteración.

3. **`/api/push/subscribe` aún no existe** — el frontend está preparado para Web Push (VAPID), pero el backend no tiene los endpoints. Esto se implementa en Fase 9.

4. **Offline real (outbox + sync) pendiente** — el SW entrega el offline shell (HTML/CSS/JS) y la página `/offline.html`, pero las operaciones POST/PUT/DELETE no se encolan localmente. Requiere Fase 11.

5. **Push notifications solo funcionan en HTTPS** — el SW y Web Push requieren HTTPS en producción. `localhost` está exento para desarrollo.

6. **Capacitor (Android nativo) pendiente** — Fase 15. La PWA funciona en Android, pero no es APK instalable desde Play Store.

---

## Deuda pendiente (Fase 4 — batches futuros)

### Batch 2 — Impresión real (no mock)

- `PrintJob` abstraction con UUID, idempotencyKey, status, attempts, error, timestamps.
- `PrinterDriver` interface con implementación ESC/POS sobre TCP.
- `PrintQueue` persistente con retry exponencial y fallback printer.
- `PrintRouter` para enrutar pedidos a la impresora correcta por categoría/estación.
- Endpoint `POST /api/print/jobs` con idempotency.
- Endpoint `POST /api/print/jobs/:id/reprint`.
- Test de checksum de bytes ESC/POS (golden fixtures).
- Documentación `docs/PRINTING.md` actualizada.

### Batch 3 — Recetas admin + integración inventario

- Migración Knex para tablas `recipes`, `recipe_ingredients`.
- `RecipeService` con cálculo de costo, margen, precio sugerido.
- Endpoint `POST /api/recipes` con validación.
- Integración con `InventoryService.consumeForTicket(ticketId)` al cerrar ticket.
- Reversión automática en void/refund.
- UI de administración de recetas (formulario + lista).

### Batch 4 — Panel de administración

- Layout con sidebar azul.
- CRUD completo para: productos, categorías, mesas, usuarios, roles, permisos, métodos de pago, impresoras, áreas de impresión, almacenes, inventario, proveedores, clientes, recetas, configuración.
- RBAC en todas las rutas.
- Auditoría de cambios.
- Búsqueda, filtros, ordenamiento en cada listado.

### Batch 5 — Offline real + Web Push

- IndexedDB local queue.
- Operation UUID idempotency.
- Server ACK protocol.
- Conflict policy (last-write-wins vs server-wins).
- VAPID keys + endpoints `/api/push/subscribe`, `/api/push/unsubscribe`.
- Service Worker `push` event handler.
- Categorías de notificación.

### Batch 6 — Auditoría de seguridad + hardening final

- Gitleaks scan en pre-commit hook.
- npm audit gate en CI.
- Rate limiting en todos los endpoints sensibles.
- CSP estricto audit.
- Helmet headers audit.
- Input sanitization audit.
- SQL injection test suite (ya cubierto en security-verification.test.js).
- XSS test suite.
- Audit log verification.

---

## Próxima fase

**Batch 2 — Impresión real (no mock)** es el siguiente paso. Es el punto más crítico de la Fase 4 según el prompt maestro: "La impresión NO puede quedarse en mock". Se implementará la arquitectura completa con `PrintJob`, `PrinterDriver`, `PrintQueue`, `PrintRouter`, idempotencia, retry, fallback y cola persistente.

---

## Conclusión

Fase 4 batch 1 establece los cimientos visuales y de PWA del proyecto. La reorganización del repositorio está completa y verificada (244/244 tests PASS). La identidad visual azul está definida en CSS variables canónicas. La PWA es instalable con manifest + service worker + icons. El KDS es profesional con sonido, vibración y notificaciones del sistema. El WebSocket tiene heartbeat y detección offline.

Los batches siguientes cubren impresión real, recetas, administración, offline real y auditoría de seguridad.
