# CI/CD — workflows, gates y artifacts

El pipeline tiene **4 workflows**. Todos comparten una filosofía: **un
gate que falló debe fallar el workflow** (nada de `continue-on-error`
en builds obligatorios, nada de `|| true` escondiendo errores).

## Mapa de workflows

| Workflow | Archivo | Se dispara con | Qué garantiza |
|----------|---------|----------------|---------------|
| **CI** | `ci.yml` | push a main/feature/**, PRs a main | Tests reales, seguridad, Docker |
| **Android Build** | `android.yml` | push a main/feature/**, PRs, manual | APK obligatorio + AAB firmado + smoke |
| **GitHub Pages Demo** | `pages.yml` | push a main (frontend/...), PRs, manual | Demo pública funcional (smoke) |
| **Visual Baseline** | `visual-baseline.yml` | solo `workflow_dispatch` manual | Actualización intencional de la baseline visual |

## CI (`ci.yml`) — jobs y gates

### Job `security`
1. **gitleaks** — escaneo de secretos commiteados (gate: 0 findings)
2. **npm audit** — 0 vulnerabilidades permitidas (high/critical)

> Si gitleaks encuentra un secreto: NO lo enmascares con otro commit —
> rótalo y purga la historia. Ver [Seguridad](Seguridad#si-se-filtró-un-secreto).

### Job `tests` (el corazón)
1. `npm ci` (lockfile exacto)
2. **Syntax check**: `node --check` a TODOS los `.js` del repo
3. **Migraciones + seed programáticas** (`scripts/run-migrations.js`)
4. **533 unit tests** — reset de BD por suite, conteos REALES escritos
   en el job summary (no números hardcodeados); cualquier fallo rompe
   el gate `node scripts/...` (con `pipefail`)
5. PostgreSQL integration (**EXPERIMENTAL** — fallo conocido
   documentado, no bloquea)
6. Playwright: **61 E2E funcionales** (gate) → **18 screenshots**
   documentales (gate) → **5 visual regression** con tolerancia 2%
   (gate, con `| tee` + `pipefail`)
7. Upload de artifacts: `ui-redesign-screenshots`, `docs-screenshots`,
   `playwright-report` y `playwright-traces` SOLO en fallo

### Job `docker`
1. `docker build` multi-stage
2. Smoke del contenedor: arranca, `/ready` responde, CORS correcto

## Android (`android.yml`) — jobs y gates

### Job `build` (OBLIGATORIO)
```
npm ci → verificar capacitor.config.json + scripts/check-android-config.js
→ frontend/ existe (webDir) → npx cap sync android
→ assets copiados en android/app/src/main/assets/public
→ wrapper presente y EJECUTABLE (chmod +x commiteado)
→ ./gradlew assembleDebug        ← si falla, FALLA el workflow
→ APK existe, >1MB, package='com.sambapos.lba',
  label='LBApos', versionName semver   (verificado con aapt2)
→ artifact: LBApos-debug.apk
```

### Job `release` (solo con firma configurada)
Se activa con la variable `ANDROID_SIGNING_ENABLED=true` (ver
[Android](Android#firma-y-publicación)). Gates adicionales:
- los 4 secrets existen y el keystore decodificado pesa >1KB
- `./gradlew bundleRelease` con firma inyectada
- **`jarsigner -verify` del AAB** — un AAB sin firma NUNCA puede pasar
- artifact: `LBApos-release.aab`

### Job `smoke` (EXPERIMENTAL, best-effort)
Emulador x86_64 API 34: instala el APK → lanza → verifica
foreground/pid → screenshot de evidencia. El boot del emulador en
runners compartidos puede ser flaky → `continue-on-error` **explícito y
documentado** (el gate obligatorio es `build`, no este).

## Pages (`pages.yml`)

```
build-pages-demo.js (overlay config.demo.js, SIN sed)
→ gates de contenido: index, app.js, config.js, manifest, sw, css,
  íconos, logo TODOS existen en _site/
→ overlay demo ACTIVO (DEMO_MODE: true) y config de producción AUSENTE
→ index.html SIN rutas absolutas
→ sw.js base-path aware
→ serve-pages.js sirve _site/ bajo /Samba_Pos_V3-Web/ (sub-path real)
→ Playwright smoke: login demo → áreas → POS → KDS → Admin
→ deploy SOLO desde main (los PR corren gates sin publicar)
```

## Visual Baseline (`visual-baseline.yml`)

Dispatchable **solo a mano** (evita que "arreglar" la baseline se
convierta en forma de saltar la regresión visual): resetea la BD a
estado determinista, regenera las 5 capturas base con
`--update-snapshots` y commitea el resultado con mensaje explicativo.
Ver [Pruebas](Pruebas#baseline-visual).

## Cómo leer un fallo de CI

| Mensaje / job | Causa típica | Dónde mirar primero |
|---------------|--------------|---------------------|
| `FAIL: APK is smaller than 1 MB` | build roto/vacío | log de `assembleDebug` (arriba) |
| `FAIL: package ID is not com.sambapos.lba` | identidad desincronizada | `capacitor.config.json` vs `build.gradle` |
| `gradlew: Permission denied` | se commiteó sin bit ejecutable | `git update-index --chmod=+x android/gradlew` |
| `FAIL: demo overlay was not applied` | `config.demo.js` vs build | `scripts/build-pages-demo.js` |
| `absolute paths found in index.html` | alguien usó `href="/..."` | `frontend/index.html` |
| Visual regression con diff ~1.5% | antialiasing cross-entorno | tolerancia ya está en 2%; si supera, es un cambio REAL de UI |
| `Invalid request ... does not match base64` | secret mal pegado | re-configurar el secret (ver [Troubleshooting](Troubleshooting)) |
| `FAIL: AAB is NOT signed` | secrets de firma incorrectos | verificar contraseñas/alias del keystore |

## Artifacts: dónde están y cómo bajarlos

En cada run: **Actions** → run → sección "Artifacts" (o API
`/actions/runs/{id}/artifacts`). Retention 30 días (14 screenshots de
emulador).

| Artifact | Contenido | Workflow |
|----------|-----------|----------|
| `LBApos-debug.apk` | APK instalable (debug) | android |
| `LBApos-release.aab` | AAB firmado para Play Store | android (con firma activa) |
| `android-emulator-launch-screenshot` | evidencia del smoke | android |
| `ui-redesign-screenshots` / `docs-screenshots` | capturas de la UI | ci |
| `visual-regression-diff` | diffs de la regresión visual | ci (fallo) |
| `playwright-report` / `playwright-traces` | reporte/traces E2E | ci (fallo) |
| `pages-smoke-traces` | traces del smoke de Pages | pages (fallo) |

```bash
# bajar con API:
gh run download <run-id> -n LBApos-debug.apk -D ./artifacts
# o con curl:
curl -L -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/repos/Lean031110/Samba_Pos_V3-Web/actions/artifacts \
  | python3 -m json.tool
```

## Checklist de merge a `main`

Un PR se mergea solo cuando TODOS estos puntos están verificados:

1. ☐ CI verde (security + 533 unit + 61 E2E + screenshots + visual + docker)
2. ☐ Android Build verde: APK con identidad verificada (aapt2)
3. ☐ Si toca Pages: smoke 4/4 bajo el sub-path real
4. ☐ Si toca frontend: revisar capturas del artifact (vista previa)
5. ☐ Artifacts presentes y no vacíos
6. ☐ PR review — diff leído, no solo confiado en CI
7. ☐ Historia limpia (commits atómicos, mensajes con `tipo(área): descripción`)
8. ☐ Sin secretos en el diff (gitleaks verde)

Los merges históricos importantes usan **merge commit** con mensaje
descriptivo (ver `git log --merges`).
