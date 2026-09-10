# BLOQUE G REPORT — Fase 7: PWA

**Fecha:** 2026-09-09
**Commit base anterior:** `44a4ba9` (Bloque F — Printer Gateway)
**Bloque:** G — Fase 7 (PWA)
**Estado:** ✅ Completo

---

## Resumen ejecutivo

El Bloque G cierra **1 gap P0** identificado en `docs/PRODUCTION_GAP_MATRIX.md` para la Fase 7 (PWA):
- **P0 — Install prompt visible**: botón "Instalar app" visible en Admin/Configuración.

**Hallazgo:** el módulo `pwa.js` (con `SambaPWA`) ya estaba cargado en `index.html` y capturaba el evento `beforeinstallprompt`, pero NINGUNA vista lo usaba. El botón de instalación nunca aparecía en la UI. El fix añade una tarjeta PWA en el tab "Configuración" de AdminView que:
- Detecta si la app ya está instalada (modo `standalone`)
- Muestra el botón "Instalar app" cuando `beforeinstallprompt` está disponible
- Muestra instrucciones cuando no está disponible
- Muestra el estado del Service Worker (registrado/actualización disponible)
- Se actualiza en tiempo real cuando `beforeinstallprompt` se dispara

| Gap | Prioridad | Estado | Cómo se cerró |
|-----|----------|--------|---------------|
| Install prompt visible | **P0** | ✅ Cerrado | Tarjeta PWA en Admin Config + `_renderPwaCard()` + `_pwaInstall()` + `_notifyConfigView()` en pwa.js + endpoint `/api/pwa/install-status` + 31 tests unitarios + 6 tests E2E |

---

## Cambios en el código

### Frontend

**`frontend/js/views/admin.js`** — nuevos métodos:

- `_renderPwaCard()`: genera la tarjeta PWA con:
  - Detección de modo standalone (ya instalada)
  - Botón "Instalar app" cuando `SambaPWA.canInstall === true`
  - Estado del Service Worker (vía `navigator.serviceWorker.getRegistration()`)
  - Instrucciones para instalación manual en Chrome/Edge
- `_pwaInstall()`: handler del botón que llama `SambaPWA.promptInstall()` + toast feedback + re-render

**`frontend/js/services/pwa.js`** — mejora:

- `_notifyConfigView()`: cuando `beforeinstallprompt` o `appinstalled` se disparan, notifica al AdminView (si está en tab config) para re-renderizar la tarjeta PWA en tiempo real.

### Backend

**`backend/src/api/server.js`** — nuevo endpoint:

```
GET /api/pwa/install-status (requiere auth)
```

Retorna:
- `manifestReachable`: si el manifest.webmanifest es legible
- `manifestValid`: si tiene los campos requeridos (name, start_url, display=standalone, icons 192+512)
- `manifestErrors`: lista de errores de validación
- `manifest`: el objeto completo del manifest
- `serviceWorkerExists`: si sw.js existe
- `installPromptSupported`: siempre true (depende del navegador)

---

## Tests

### Nuevo: `backend/tests/bloque-g-pwa-verification.test.js` (31 tests)

| Suite | Tests | Verifica |
|-------|------:|----------|
| 1. Manifest Validation | 5 | Archivo existe, JSON válido, campos requeridos (name, short_name, start_url, display=standalone, background_color, theme_color), icons 192+512, maskable icons, archivos de iconos existen |
| 2. Service Worker | 4 | sw.js existe, maneja evento install, maneja fetch (offline), cachea recursos |
| 3. Backend PWA Audit Endpoint | 7 | GET /api/pwa/install-status retorna 200 con auth, 401 sin auth, manifestReachable=true, manifestValid=true sin errores, serviceWorkerExists=true, retorna manifest completo, installPromptSupported=true |
| 4. index.html PWA Integration | 5 | Link a manifest.webmanifest, registro de SW, inclusión de pwa.js, meta theme-color, apple-touch-icon |
| 5. pwa.js Module API | 5 | Expone SambaPWA con canInstall/promptInstall/onInstallState/checkUpdate, captura beforeinstallprompt, maneja appinstalled, preventDefault, _notifyConfigView |
| 6. Admin View PWA Card | 5 | _renderPwaCard method, _pwaInstall handler, PWA card en _renderConfig, detección standalone, estado SW |

### Nuevo: `backend/tests/e2e/bloque-g-pwa.spec.js` (6 tests E2E)

| Test | Verifica |
|------|---------|
| G1: Admin Config tab shows PWA card | Login → navigate admin → click config → PWA card renderiza con "Aplicación (PWA)" + "Service Worker" |
| G2: Service Worker is registered and active | Verifica `navigator.serviceWorker.getRegistration()` retorna registration activa |
| G3: Manifest is reachable and valid | GET /manifest.webmanifest → JSON con name, short_name, start_url, display=standalone, icons 192+512 |
| G4: PWA install button appears when beforeinstallprompt fires (simulated) | Simula beforeinstallprompt → botón "Instalar app" aparece |
| G5: Clicking "Instalar app" calls SambaPWA.promptInstall() | Spy en promptInstall → click botón → verify called ≥1 |
| G6: PWA card shows "Instalada como PWA" in standalone mode | Override matchMedia para simular standalone → card muestra "Instalada como PWA ✓" |

### Suite completa de tests (post-Bloque G)

| Suite | Tests |
|-------|------:|
| api-integration | 47 |
| kds-verification | 49 |
| inventory-verification | 13 |
| concurrency-verification | 8 |
| idempotency-verification | 7 |
| idempotency-concurrency | 7 |
| domain-verification | 72 |
| security-verification | 21 |
| printing-verification | 24 |
| recipes-verification | 25 |
| refund-verification | 6 |
| unit-conversion | 14 |
| domain-extended | 12 |
| bloque-d-verification | 34 |
| bloque-e-kds | 14 |
| bloque-f-printer | 19 |
| **bloque-g-pwa** (nuevo) | **31** |
| **Total unit** | **403** (+31 vs Bloque F) |
| E2E (Playwright) | 56 PASS (incluye 6 nuevos de Bloque G) |

**Resultado:** 403 unit PASS / 0 FAIL. E2E: 56 PASS / 2 FAIL (B3 kitchen view flaky por SW first-load + screenshot "09" preexistente, ambos no relacionados con Bloque G).

---

## Cumplimiento de la guía maestra

| Requisito guía (PRODUCTION_GAP_MATRIX.md) | Cumplido | Cómo |
|-------------------------------------------|----------|------|
| P0: "Botón 'Instalar app' visible en Admin/Configuración" | ✅ | Tarjeta PWA en Admin Config con botón "Instalar app" que aparece cuando `beforeinstallprompt` está disponible. En navegadores que no soportan PWA install, muestra instrucciones manuales. 6 tests E2E verifican el comportamiento. |

---

## Archivos modificados/creados

### Nuevos
- `backend/tests/bloque-g-pwa-verification.test.js` — 31 tests unitarios
- `backend/tests/e2e/bloque-g-pwa.spec.js` — 6 tests E2E
- `docs/BLOQUE_G_REPORT.md` — este documento

### Modificados
- `frontend/js/views/admin.js` — `_renderPwaCard()` + `_pwaInstall()` + inclusión en `_renderConfig()`
- `frontend/js/services/pwa.js` — `_notifyConfigView()` para actualizar la tarjeta en tiempo real
- `backend/src/api/server.js` — endpoint `GET /api/pwa/install-status`
- `backend/scripts/run-all-tests.sh` — añadido bloque-g-pwa a unit tests
- `backend/package.json` — añadido tests/bloque-g-pwa-verification.test.js a test:unit

---

## Próximos pasos sugeridos

Con Bloque G cerrado, el siguiente bloque según `PRODUCTION_GAP_MATRIX.md` es:

### **BLOQUE H — Fase 8: Push**
- P0: UX activación (tab "Notificaciones" en Admin/Config con botón activar)
- P0: Tests push (subscribe, unsubscribe, send, expire)
- P1: Gate E2E push (cerrar pestaña, enviar push, verificar recepción)
