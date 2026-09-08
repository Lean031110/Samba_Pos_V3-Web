# MATRIZ DE FASES 0–20 — Estado Real con Evidencia

**Fecha de auditoría:** 2026-09-08
**Repositorio:** Lean031110/Samba_Pos_V3-Web
**Commit:** `39e6b1c`

---

## Matriz de fases

| Fase | Descripción | Backend | Frontend | DB | Tests | Docs | Estado |
|------|-------------|:-------:|:--------:|:--:|:-----:|:----:|:------:|
| 0 | Auditoría forense del repositorio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Completa |
| 1 | Seguridad y limpieza (RBAC, Zod, gitleaks, CORS, rate-limit, bcrypt) | ✅ | — | ✅ | ✅ (21) | ✅ | ✅ Completa |
| 2 | Dominio: agregados, state machine, idempotency | ✅ | — | ✅ | ✅ (72) | ✅ | ✅ Completa |
| 3 | WorkPeriod, CashSession, Customer, idempotency middleware | ✅ | — | ✅ | ✅ (7+7) | ✅ | ✅ Completa |
| 4 | Reorganización repositorio + identidad azul + PWA + mobile-first | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Completa |
| 5 | Recetas + costos + conversión de unidades | ✅ | ✅ | ✅ | ✅ (25+14) | ✅ | ✅ Completa |
| 6 | KDS profesional (sonido, vibración, notificaciones, filtros, urgente) | ✅ | ✅ | ✅ | ✅ (49) | ✅ | ✅ Completa |
| 7 | Impresión real (PrintJob, PrintQueue, PrintRouter, PrintWorker) | ✅ | ✅ | ✅ | ✅ (24) | ✅ | ✅ Completa |
| 8 | WebSocket reconnect (heartbeat, backoff, online/offline, resync) | ✅ | ✅ | — | ✅ (27 E2E) | ✅ | ✅ Completa |
| 9 | Web Push notifications (VAPID, web-push lib, migración formal) | ✅ | 🟡 | ✅ | 🔴 | 🟡 | 🟡 Parcial |
| 10 | PWA (manifest, SW, install prompt) | — | 🟡 | — | ✅ | ✅ | 🟡 Parcial |
| 11 | Offline outbox + sync (IndexedDB, API integration, retryable errors) | — | 🟡 | — | 🔴 | 🟡 | 🟡 Parcial |
| 12 | PostgreSQL production target | — | — | 🔴 | 🔴 | 🔴 | 🔴 Pendiente |
| 13 | Caja (WorkPeriod + CashSession) | ✅ | — | ✅ | ✅ | ✅ | ✅ Completa |
| 14 | Reportes (ventas, productos, categorías, cajas, voids, refunds) | ✅ | — | — | 🔴 | 🟡 | 🟡 Parcial |
| 15 | Android (Capacitor wrapper) | — | — | — | — | 🔴 | 🔴 Pendiente |
| 16 | UI final azul (identidad visual, tablet-first, touch-first) | — | ✅ | — | ✅ | ✅ | ✅ Completa |
| 17 | Testing final (unit, integration, E2E, security) | ✅ | — | — | ✅ (320) | ✅ | 🟡 Parcial |
| 18 | Producción (backups, restore, observabilidad, metrics) | 🟡 | — | — | 🔴 | 🟡 | 🟡 Parcial |
| 19 | Seguridad final (secrets scan, audit, RBAC verification) | ✅ | — | — | ✅ | ✅ | ✅ Completa |
| 20 | Limpieza del repositorio | ✅ | ✅ | — | ✅ | ✅ | ✅ Completa |

---

## Detalle por fase

### ✅ Completas (13 fases)

**Fase 0 — Auditoría forense:** `docs/BASELINE_REPORT.md` existe (movido a `docs/worklog-history.md` durante reorganización).

**Fase 1 — Seguridad:** RBAC (27 permisos en `rbac.js`), Zod validation (`schemas.js`), gitleaks en CI, rate-limit en login, bcrypt para PINs, CORS estricto en producción.

**Fase 2 — Dominio:** `Ticket.js`, `TicketStateMachine.js`, `OrderBuilder.js`, `CalculationEngine.js`, `AccountTransaction.js`, `AccountTransactionDocument.js`, `TicketRecalculator.js`. 72 tests en `domain-verification.test.js`.

**Fase 3 — WorkPeriod/CashSession/Customer:** `WorkPeriod.js`, `CashSession.js`, `Customer.js` en dominio. Rutas en `cash-sessions.js`. 7+7 tests.

**Fase 4 — Reorganización + PWA + mobile-first:** `samba-web-clone/` eliminado. `manifest.webmanifest` + `sw.js` existen. CSS azul (`variables.css` con `--lba-*`). `mobile.css` responsive.

**Fase 5 — Recetas:** `RecipeService.js` + `routes/recipes.js`. Conversión de unidades real (`UnitConversions` table). 25+14 tests.

**Fase 6 — KDS:** `kitchen.js` con `STATE_LABELS`, `_playSound` (two-tone chime), `_vibrate`, `_showBrowserNotification`, `_isUrgent`, auto-refresh 30s, filtros por estado. 49 tests.

**Fase 7 — Impresión:** `PrintQueue.js` (persistente con idempotencia), `PrintRouter.js` (routing rules), `PrintWorker.js` (background poller). **Integrado en `server.js`** (18 referencias, auto-start/stop). 24 tests.

**Fase 8 — WebSocket:** `websocket-client.js` con heartbeat (25s), reconnect con backoff, `online`/`offline` events, resync. 43 referencias a estos mecanismos. 27 E2E tests.

**Fase 13 — Caja:** `CashSession.js` + `WorkPeriod.js` en dominio. Rutas en `cash-sessions.js`. Tests en `api-integration.test.js`.

**Fase 16 — UI azul:** `variables.css` con 28 referencias `--lba-blue-*`. Identidad visual azul profesional. CSS mobile-first responsive. Logo oficial integrado.

**Fase 19 — Seguridad final:** gitleaks + npm audit en CI (0 vulnerabilities). RBAC verificado en todos los endpoints.

**Fase 20 — Limpieza:** Scripts obsoletos eliminados (debug-fase3.js, smoke-fase3.sh, sprint2/4, insert-ticket-demo.js, print-checksum-test.js). Referencias rotas corregidas.

---

### 🟡 Parciales (5 fases)

**Fase 9 — Web Push: 🟡 Parcial**
- ✅ Backend: `web-push` npm package instalado. `pushService.js` usa `webpush.sendNotification()` con AES128GCM + VAPID JWT. Migración formal `20260908000002` para 3 tablas (PushSettings, PushSubscriptions, PushNotifications). Manejo de 404/410 (expira suscripción).
- 🟡 Frontend: `PushClient` existe pero la UX no está integrada en Admin/Configuración. No hay flujo visible de "Activar notificaciones" para el usuario. `PushClient.init()` se llama en `App.init()` pero no solicita permiso de forma apropiada.
- 🔴 Tests: NO existen tests de Push.
- 🟡 Docs: `docs/PWA.md` menciona push como pendiente.

**Fase 10 — PWA: 🟡 Parcial**
- ✅ Manifest + SW + icons + offline shell existen y funcionan.
- 🟡 `pwa.js` captura `beforeinstallprompt` pero NO hay UI visible que use `SambaPWA.promptInstall()`. El usuario no ve un botón de instalación.

**Fase 11 — Offline outbox: 🟡 Parcial**
- ✅ `offlineQueue.js` existe con IndexedDB, idempotency keys, conflict policy (server-wins), retry limit.
- ✅ `api.js` integrado: distingue errores reintentables (0, 5xx) vs no reintentables (400, 401, 403, 404, 409, 422). Solo encola POST/PUT/PATCH/DELETE offlineables.
- 🟡 Faltan: orden de operaciones (ticket→orders→payment→close), manejo de JWT expirado durante sync, tests.
- 🔴 Tests: NO existen tests de offline.

**Fase 14 — Reportes: 🟡 Parcial**
- ✅ Backend: `reportService.js` con 8 métodos + `routes/reports.js` con 8 endpoints. Lógica corregida (voids no se filtran del query, refunds usan Payments table).
- 🔴 Frontend: NO existe UI de reportes. El AdminView no tiene tab "Reportes". Los endpoints están huérfanos.
- 🔴 Tests: NO existen tests de reportes.

**Fase 18 — Producción: 🟡 Parcial**
- ✅ `/metrics` protegido con auth, requestId en logs, métricas en memoria (uptime, requests, errors, memory).
- 🟡 Backup/restore (`backup.js`, `restore.js`) son básicos — sin rotación, retención automática, validación posterior, o prevención de restore en caliente.
- 🔴 Tests: NO existen tests de observabilidad.
- 🟡 Docs: deployment guide existe pero no cubre WAL strategy, backup rotation.

---

### 🔴 Pendientes (2 fases)

**Fase 12 — PostgreSQL: 🔴 Pendiente**
- `knexfile.js` usa `client: 'sqlite3'` para development y production. NO hay soporte PostgreSQL.

**Fase 15 — Android (Capacitor): 🔴 Pendiente**
- NO existe `capacitor.config.json`. NO existe carpeta `android/`. La PWA funciona pero no es APK/AAB instalable desde Play Store.

---

## Resumen numérico

| Estado | Cantidad | Fases |
|--------|----------|-------|
| ✅ Completa | 13 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 16, 19, 20 |
| 🟡 Parcial | 5 | 9, 10, 11, 14, 18 |
| 🔴 Pendiente | 2 | 12, 15 |

---

## Tests por área

| Suite | Tests | Estado |
|-------|------:|--------|
| api-integration | 47 | ✅ |
| kds-verification | 49 | ✅ |
| inventory-verification | 13 | ✅ |
| concurrency-verification | 8 | ✅ |
| idempotency-verification | 7 | ✅ |
| idempotency-concurrency | 7 | ✅ |
| domain-verification | 72 | ✅ |
| security-verification | 21 | ✅ |
| printing-verification | 24 | ✅ |
| recipes-verification | 25 | ✅ |
| refund-verification | 6 | ✅ |
| unit-conversion-verification | 14 | ✅ |
| **Total unit** | **293** | ✅ |
| E2E (Playwright) | 27 | ✅ |
| **TOTAL** | **320** | ✅ |

**Tests faltantes para fases parciales:**
- Push: 0 tests (necesita: subscribe, unsubscribe, send, expire, VAPID, polling)
- Offline: 0 tests (necesita: enqueue, retry, conflict, order, JWT expired)
- Reportes: 0 tests (necesita: sales, products, categories, payments, voids, refunds)
- Observabilidad: 0 tests (necesita: requestId, metrics, health, readiness)
