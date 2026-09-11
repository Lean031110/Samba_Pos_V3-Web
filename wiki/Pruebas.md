# Pruebas — todas las suites

## Inventario

| Suite | Cantidad | Gate CI | Cómo correrla local |
|-------|----------|---------|---------------------|
| Unit (integración API + dominio) | **533** | ✅ obligatorio | `cd backend && npm run test:unit` |
| E2E funcionales (Playwright) | **61** | ✅ obligatorio | `cd backend && npm run test:e2e` |
| Screenshots documentales | **18** | ✅ obligatorio | `cd backend && npm run screenshots` |
| Regresión visual | **5** pantallas | ✅ obligatorio (tolerancia 2%) | `cd backend && npm run test:visual` |
| Pages smoke | **4** | ✅ en pages.yml | `npm run pages:smoke` (raíz) |
| Android build | APK+AAB | ✅ obligatorio | `npm run build:android:debug` (raíz) |
| Todo junto | — | — | `cd backend && npm run test:all` |

> Los números de arriba son los que CI **realmente ejecuta** y escribe
> en el job summary (ver la pestaña Summary de cualquier run). Si
> añades/borras tests, el badge del README se actualiza desde esa
> ejecución real — nunca se hardcodean conteos.

## Unit tests (backend)

- Runner: `node --test` (sin dependencias externas)
- Cada suite **resetea la BD** al empezar (aislamiento total)
- Cubren: auth/JWT, tickets/órdenes/pagos, refunds/splits/merges,
  voids, KDS state machine, inventario/recetas (deducción
  transaccional), impresión (transporte mock + retry), push, offline
  outbox, idempotencia, concurrencia, seguridad, conversiones de
  unidad...

```bash
cd backend && npm run test:unit   # listado explícito en package.json
npm test                          # suite de integración rápida
```

## E2E funcionales (Playwright)

Flujos de usuario reales contra el backend corriendo en local con BD
reseteada: login → áreas → POS → pedido → pago → cierre → KDS →
caja → reportes, más navegación por rol y responsive
(390×844 · 768×1024 · 1024×768 · 1280×800).

```bash
cd backend && npm run test:e2e
# reporte HTML (en fallo, también en artifacts del CI):
npx playwright show-report
```

Los tests legacy se actualizaron a los selectores de la UI Odoo 19
conservando las aserciones funcionales (PR #9).

## Screenshots documentales

13 capturas del rediseño (`tests/e2e/ui-redesign-screenshots.spec.js`)
+ 5 legacy — publicadas como artifacts `ui-redesign-screenshots` y
`docs-screenshots`, y versionadas en `docs/screenshots/`.

## Regresión visual

Compara 5 pantallas base (login, áreas, POS, payment, KDS) contra
**baselines versionadas**. Tolerancia: **2%** de píxeles distintos
(antialiasing entre entornos produce ~1.5% — el umbral evita falsos
positivos sin ocultar cambios reales).

```bash
cd backend && npm run test:visual
```

### Baseline visual

- Las baselines viven en el repo (`backend/tests/**/visual-baselines/`).
- **Nunca** las regeneres en local para "pasar" un fallo sin entender
  el diff: mira `visual-regression-diff` (artifact del CI) primero.
- Actualización legítima (cambio de UI intencional):

```bash
# Opción A — workflow manual (deja audit trail en git):
#   Actions → "Visual Baseline" → Run workflow (solo dispatchable)
# Opción B — local:
cd backend && npm run test:visual:update
git add -A && git commit -m "test(visual): update baseline — <motivo>"
```

El workflow A resetea la BD a estado determinista antes de capturar
(cualquier drift de datos haría diffs falsos).

## Pages smoke

4 tests Playwright contra `_site/` servido bajo `/Samba_Pos_V3-Web/`
(VER [GitHub-Pages](GitHub-Pages)). Corre dentro de `pages.yml`; en
local: `npm run pages:smoke` desde la raíz.

## Android

- `scripts/check-android-config.js` — identidad/branding/wrapper
- Gradle assembleDebug — compile gate
- `aapt2 dump badging` — el APK ES LBApos (package+label+version)
- Emulator smoke (EXPERIMENTAL) — ver [Android](Android)

## Cómo añadir tests

| Tipo | Receta |
|------|--------|
| Unit | nuevo `tests/<feature>-verification.test.js` con `node --test` + añádelo a `test:unit` en `backend/package.json` (el listado es explícito para conteos reales) |
| E2E | `tests/e2e/<flujo>.spec.js`; usa los page objects/patrones existentes; correlo 2× antes de pushear (flakes no se aceptan) |
| Visual | nueva spec con `project: visual`; primera vez: genera baseline con `-u` y revisa la captura a mano |
| Smoke Pages | `backend/tests/pages-smoke/` — recuerda: nunca puede depender de un backend real |

## Reglas de calidad

1. Un test flaky se arregla o se elimina — nunca se reintenta a ciegas.
2. CI corre los tests con `set -o pipefail` donde hay `| tee`: un fallo
   en la tubería NO puede quedar verde (bug real que se corrigió).
3. `npm audit` con 0 vulnerabilidades es gate.
4. Ningún test depende de red externa (CDNs, APIs de terceros).
