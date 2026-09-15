# Configuración de parámetros — referencia completa

Esta página documenta **cada parámetro configurable del proyecto y TODAS
las formas de configurarlo**: editar archivos, variables de entorno,
UI, QR, localStorage, secrets de GitHub, Docker, etc.

## Tabla maestra

| # | Parámetro | Dónde vive | Default | Afecta a |
|---|-----------|-----------|---------|----------|
| 1 | `APP_BASE_PATH` | `frontend/js/config.js` | `''` (autodetect) | URLs de assets, SW, manifest, íconos |
| 2 | `DEMO_MODE` | `frontend/js/config.js` (+ overlay `config.demo.js`) | `false` | Mock API, banner demo |
| 3 | `APP_NAME` / `APP_VERSION` | `frontend/js/config.js` | `LBApos` / `0.4.0` | Shell, welcome, versión mostrada |
| 4 | `serverUrl` + `mode` | `localStorage: samba_server_config` | — | A qué backend se conecta la UI |
| 5 | `PORT` | env del backend | `3001` | Puerto HTTP del API |
| 6 | `CORS_ORIGIN` | env del backend | `*` | Orígenes permitidos |
| 7 | `JWT_SECRET` | env del backend | ⚠️ requerido implícito | Firma de tokens |
| 8 | `JWT_EXPIRES_IN` | env del backend | ver código auth | Expiración del token |
| 9 | `NODE_ENV` | env del backend | `development` | Comportamiento prod (CORS estricto) |
| 10 | `SAMBA_DB_PATH` | env del backend | ruta por defecto del knexfile | Ubicación del archivo SQLite |
| 11 | `DATABASE_URL` | env del backend | — (SQLite) | Cambia a PostgreSQL si empieza con `postgres` |
| 12 | `ADMIN_PIN` | env (al seedear) | `1234` | PIN del administrador en el seed |
| 13 | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | env del backend | subject mailto default | Web Push |
| 14 | `appId` / `appName` / `webDir` | `capacitor.config.json` (raíz) | `com.sambapos.lba` / `LBApos` / `frontend` | Identidad Android |
| 15 | `cleartext` / `allowMixedContent` | `capacitor.config.json` | `true` | HTTP LAN dentro del WebView |
| 16 | Opciones `SplashScreen` | `capacitor.config.json` | 2000ms, `#044392` | Splash de Android |
| 17 | `applicationId` / `versionName` | `android/app/build.gradle` | `com.sambapos.lba` / espejo de versión | Identidad APK/AAB |
| 18 | 4 secrets + 1 var de firma | GitHub Actions | — | Job Release AAB |

---

## 1. `LBA_CONFIG` (frontend) — `frontend/js/config.js`

Archivo cargado **primero** en `index.html` (antes que cualquier otro
script). Define `window.LBA_CONFIG`. Es la única fuente de verdad de la
configuración de runtime del frontend.

```js
window.LBA_CONFIG = {
  APP_BASE_PATH: '',      // '' = autodetección
  DEMO_MODE: false,       // ⚠️ producción NUNCA true
  APP_NAME: 'LBApos',
  APP_VERSION: '0.4.0',
};
```

### `APP_BASE_PATH` — todas las formas de configurarlo

**Qué controla**: el prefijo bajo el que se sirve la app. De él derivan
las URLs de assets CSS/JS, `manifest.webmanifest`, el scope del service
worker, íconos y navegación interna.

| Forma | Cómo | Cuándo usarla |
|-------|------|---------------|
| **Autodetección (default)** | dejar `''` — se calcula desde `location.pathname` al cargar | Casi siempre. La MISMA build sirve en `/`, `/Samba_Pos_V3-Web/` y dentro de Capacitor |
| **Explícita en el archivo** | `APP_BASE_PATH: '/Samba_Pos_V3-Web/'` (se normaliza con barras) | Solo si la autodetección no basta (p. ej. hosting con reescrituras raras) |
| **Aislada en un build** | copiar un `config.<destino>.js` sobre `js/config.js` en el deploy (patrón del overlay demo) | Cuando cada destino necesita config distinta SIN tocar el código |

> La autodetección funciona porque el SPA es un único documento: el
> directorio de la URL actual ES el base path. Regla del proyecto:
> **nada de rutas absolutas** en `index.html` (hay un gate de CI que lo
> verifica para Pages).

### `DEMO_MODE` — todas las formas de configurarlo

| Forma | Cómo | Efecto |
|-------|------|--------|
| **Producción (default)** | `DEMO_MODE: false` en el archivo | La app NUNCA toca el Mock API |
| **Overlay de deploy** | el workflow de Pages copia `frontend/config.demo.js` → `_site/js/config.js` con `DEMO_MODE: true` | Demo pública con datos ficticios |
| **Manual para pruebas** | editar `config.js` temporalmente y NO commitear, o servir una copia con overlay | Probar el mock en local |

El mock (`js/services/demo-data.js`) solo se activa cuando
`LBA_CONFIG.DEMO_MODE === true` explícito. Un build de producción **no
puede caer en datos ficticios por accidente**. Cuando está activo
verás: banner naranja `DEMO` en el topbar + advertencia en consola.

> ⚠️ Regla: `DEMO_MODE: true` NUNCA se commitea en `config.js`. El
> overlay es copia de deploy, no cambio de código.

### Cambiar `APP_NAME` / versión

- `APP_NAME` se muestra en el shell y en la pantalla de bienvenida de
  Android. Si cambias la identidad de la app, cámbialo también en
  `capacitor.config.json` (`appName`) y en `android/app/build.gradle`
  (`resValue 'string', 'app_name'`) — el gate de CI
  (`scripts/check-android-config.js`) verifica que los tres coincidan.
- `APP_VERSION` debe espejear la versión del build Android
  (`versionName`) y del `package.json` raíz.

---

## 2. `ServerConfig` — pantalla de bienvenida (Android/PWA)

`frontend/js/services/server-config.js`. Define **a qué servidor se
conecta la app** y en qué modo de dispositivo corre. Persistencia:
`localStorage['samba_server_config']` = `{serverUrl, mode, configured}`.

| Forma | Cómo |
|-------|------|
| **UI (bienvenida)** | Primera ejecución → pantalla con logo → URL del servidor (`http://192.168.1.104:3001`) → **Probar** (health check `/health`, 5s timeout) → tipo de dispositivo (**POS** / **COCINA**) → **Guardar y continuar** |
| **QR** | Botón "Escanear QR" — el QR contiene SOLO la URL del servidor (nunca credenciales). El admin puede generar ese QR en la vista de configuración |
| **Reconfigurar** | Botón de configuración en la topbar (o limpiar `localStorage`) |
| **Directo en consola** (dev) | `localStorage.setItem('samba_server_config', JSON.stringify({serverUrl:'http://192.168.1.104:3001', mode:'pos', configured:true})); location.reload()` |

Una vez configurado, `api.js` enruta cada llamada a
`<serverUrl>/api`. El modo `kitchen` arranca directo en el KDS.

> En la demo de Pages, `ServerConfig` permanece dormido porque
> `DEMO_MODE=true` (todo lo sirve el mock).

---

## 3. Variables de entorno del backend

El backend **no usa `dotenv`**: lee `process.env` directamente. Las
formas de definirlas:

1. **Shell**: `PORT=3002 npm run dev`
2. **Export persistente**: `export JWT_SECRET=...` en el profile
3. **systemd / PM2**: `Environment=` / `ecosystem.config.js`
4. **Docker**: `docker run -e PORT=3001 -e JWT_SECRET=...` (el
   Dockerfile ya fija `NODE_ENV=production`, `PORT=3001`,
   `SAMBA_DB_PATH=/app/data/samba.db`)

| Variable | Default | Notas |
|----------|---------|-------|
| `PORT` | `3001` | Puerto HTTP. El health check responde en `/health` |
| `CORS_ORIGIN` | `*` | En `NODE_ENV=production` con `*` el server **se niega a arrancar** — define el origen real del frontend (p. ej. `http://192.168.1.50:8080`) |
| `JWT_SECRET` | — (obligatoria en prod) | Firma los tokens. **Rota con cuidado**: invalida sesiones activas |
| `JWT_EXPIRES_IN` | ver `src/api/middleware/auth.js` | Vigencia del token; el cliente detecta expiración y re-autentica |
| `NODE_ENV` | `development` | `production` activa verificaciones estrictas (CORS) |
| `SAMBA_DB_PATH` | definido en `knexfile.js` | Ruta absoluta o relativa del `.db` SQLite. Monta volumen persistente en Docker |
| `DATABASE_URL` | — | Si empieza con `postgres` → Knex cambia a cliente `pg` (EXPERIMENTAL, ver [Troubleshooting](Troubleshooting#postgresql)) |
| `ADMIN_PIN` | `1234` (solo seed) | PIN del administrador creado por `npm run seed`. En producción defínelo ANTES de seedear |
| `VAPID_PUBLIC_KEY` | — | Par de claves Web Push (sin ellas, Push queda inactivo pero el server arranca) |
| `VAPID_PRIVATE_KEY` | — | idem |
| `VAPID_SUBJECT` | `mailto:admin@sambapos-lba.local` | Contacto exigido por la spec Web Push |

**Generar claves VAPID**:

```bash
npx web-push generate-vapid-keys
```

---

## 4. `capacitor.config.json` (raíz del repo)

```json
{
  "appId": "com.sambapos.lba",        // identidad Android (package)
  "appName": "LBApos",                // nombre visible
  "webDir": "frontend",               // qué carpeta se empaqueta en el APK
  "server": {
    "androidScheme": "https",         // esquema interno del WebView
    "cleartext": true                 // permite http:// LAN dentro del shell
  },
  "android": { "allowMixedContent": true },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,     // ms visibles
      "launchAutoHide": true,
      "backgroundColor": "#044392",   // azul corporativo
      "splashFullScreen": true,
      "splashImmersive": true
    }
  }
}
```

| Campo | Cómo cambiarlo | Efecto |
|-------|----------------|--------|
| `appId` | editar JSON + `applicationId` en `android/app/build.gradle` + re-verify con `npm run test:android:config` | ⚠️ Cambiar el id = app DISTINTA para Android (no actualiza la anterior) |
| `appName` | editar JSON + `resValue 'string', 'app_name'` en `build.gradle` | El gate de CI exige coincidencia exacta |
| `cleartext` / `allowMixedContent` | editar JSON | `true` es necesario para servidores `http://192.168.x.x` en LAN. Si tu backend es HTTPS puedes ponerlos en `false` (más seguro). Detalle en [Android](Android#cleartext--https-rationale) |
| `SplashScreen.*` | editar JSON | Duración/color del splash; los recursos gráficos viven en `android/app/src/main/res/` (regenerar con `scripts/generate-android-resources.py`) |
| `webDir` | ⚠️ no tocar | `frontend/` es estático — el pipeline completo depende de esto |

Después de cualquier cambio: `npm run cap:sync`.

## 5. `android/app/build.gradle`

| Parámetro | Default | Nota |
|-----------|---------|------|
| `applicationId` | `com.sambapos.lba` | Debe coincidir con `appId` de capacitor.config.json (gate CI con `aapt2`) |
| `versionCode` | entero incremental | Súbelo en cada release publicada |
| `versionName` | `0.4.0` (semver) | El gate CI valida formato semver y que el APK muestre `application-label: LBApos` |
| `minSdkVersion` | según template Capacitor 6 | Tablets antiguas: verificar |
| `buildTypes.release` | sin signingConfig propio | La firma se INYECTA en CI vía `android.injected.signing.*` (ver abajo) |

## 6. Firma Android (GitHub Actions)

Todo el material vive en **Secrets** cifrados (el repo es público: las
`vars.*` son visibles — solo el interruptor es var):

| Setting | Dónde | Valor |
|---------|-------|-------|
| `ANDROID_KEYSTORE_BASE64` | Secret | keystore `.jks` en base64 |
| `ANDROID_KEY_ALIAS` | Secret | `lba-release` |
| `ANDROID_STORE_PASSWORD` | Secret | contraseña del keystore |
| `ANDROID_KEY_PASSWORD` | Secret | contraseña de la clave |
| `ANDROID_SIGNING_ENABLED` | **Variable** | `true` activa el job release |

### Todas las formas de configurarlos

1. **Automática (recomendada)** — genera y sube todo de una vez:
   ```bash
   bash scripts/gen-release-keystore.sh release-signing/
   GITHUB_TOKEN=<PAT> python3 scripts/set-android-secrets.py \
     --keystore-dir release-signing/
   ```
2. **UI de GitHub**: Settings → Secrets and variables → Actions →
   "New repository secret" (×4) + "New repository variable" (×1). El
   archivo `github-secrets-setup.txt` generado por el script trae los
   valores exactos.
3. **GitHub CLI**:
   ```bash
   gh secret set ANDROID_KEYSTORE_BASE64 < keystore-base64.txt
   echo "lba-release" | gh secret set ANDROID_KEY_ALIAS
   # ... + gh variable set ANDROID_SIGNING_ENABLED --body "true"
   ```

> Rotación/revocación: borrar el secret (UI o
> `gh secret delete NOMBRE`) o poner la variable en `false` para
> desactivar el job. Ver [Seguridad](Seguridad).

## 7. Otros archivos con parámetros

| Archivo | Parámetros | Notas |
|---------|-----------|-------|
| `frontend/manifest.webmanifest` | nombre, colores PWA, íconos | El scope se resuelve con APP_BASE_PATH |
| `frontend/sw.js` | precache list, estrategia | Base-path aware (`BASE`) — gate de Pages lo verifica |
| `frontend/config.demo.js` | overlay demo | Se copia encima de `js/config.js` SOLO en el deploy de Pages |
| `backend/src/infrastructure/db/knexfile.js` | defaults de BD | Punto de verdad de `SAMBA_DB_PATH` y el switch SQLite/PG |
| `.github/workflows/*.yml` | triggers, gates, artifacts | Ver [CI-CD](CI-CD) |
| `scripts/check-android-config.js` | qué verifica el gate | identidad, branding, wrapper ejecutable |
