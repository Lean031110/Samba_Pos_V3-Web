# Android (LBApos) — build, firma y publicación

La app Android es la **misma UI web** empaquetada con Capacitor:
`webDir = frontend` (sin build step). Identidad: **LBApos** /
`com.sambapos.lba` · splash azul `#044392` · retrato bloqueado.

## Identidad y branding (versionado en git)

| Qué | Dónde | Verificado por |
|-----|-------|----------------|
| Package | `com.sambapos.lba` en `capacitor.config.json` + `android/app/build.gradle` | `aapt2 dump badging` en CI |
| Nombre visible | `LBApos` (appName + `res` strings) | aapt2 `application-label` |
| Splash | `android/app/src/main/res/drawable*/splash.png` por densidad/orientación | `scripts/check-android-config.js` |
| Íconos launcher + adaptive | `mipmap*/ic_launcher*`, `mipmap-anydpi-v26/` | idem |
| Orientación | portrait (POS/KDS) | manifest check |

Los recursos se regeneran desde el logo con:

```bash
python3 scripts/generate-android-resources.py   # requiere Pillow
git add android/app/src/main/res && git commit  # el branding es código
```

## Build local (debug APK)

```bash
# Requisitos: JDK 17+ y ANDROID_HOME con platforms;android-34
npm ci                        # raíz (Capacitor deps)
npm run test:android:config   # pre-flight de identidad
npm run cap:sync              # frontend/ → android/app/src/main/assets/public
npm run build:android:debug   # gradle assembleDebug
```

APK resultante: `android/app/build/outputs/apk/debug/app-debug.apk`
(en CI se publica como `LBApos-debug.apk`).

> El proyecto `android/` está **versionado**: NO ejecutes
> `npm run cap:add` (es solo bootstrap si `android/` no existiera).
> `cap:sync` copia los assets, jamás regenera el proyecto.

## Firma y publicación (release AAB)

### Cómo funciona el canal release

1. La variable pública `ANDROID_SIGNING_ENABLED=true` activa el job
   `release` de `android.yml` (tras `build`).
2. El job descifra los 4 secrets, decodifica el keystore y lo inyecta
   a Gradle con `android.injected.signing.*` en `gradle.properties`.
3. `./gradlew bundleRelease` produce `app-release.aab`.
4. Gates: keystore decodificado >1KB · **`jarsigner -verify` firma el
   AAB** (si no, FALLA — nunca publica un AAB sin firma).
5. Artifact: `LBApos-release.aab` (30 días de retención).

### Setup one-shot (genera keystore + configura GitHub)

```bash
bash scripts/gen-release-keystore.sh release-signing/
# genera: lba-release.jks (RSA-2048, 25 años, alias lba-release)
#         keystore-passwords.txt  (contraseñas 128-bit)
#         keystore-base64.txt     (para el secret)
#         github-secrets-setup.txt (instrucciones exactas)

GITHUB_TOKEN=<PAT con permisos de secrets> python3 scripts/set-android-secrets.py \
  --keystore-dir release-signing/
# sube los 4 secrets + la variable ANDROID_SIGNING_ENABLED=true
```

Alternativa manual (UI): Settings → Secrets and variables → Actions.
Los valores exactos están en `github-secrets-setup.txt`. Con GitHub
CLI: `gh secret set ANDROID_KEYSTORE_BASE64 < keystore-base64.txt` etc.

| Setting | Tipo | Contenido |
|---------|------|-----------|
| `ANDROID_KEYSTORE_BASE64` | Secret | keystore en base64 |
| `ANDROID_KEY_ALIAS` | Secret | `lba-release` |
| `ANDROID_STORE_PASSWORD` | Secret | contraseña del keystore |
| `ANDROID_KEY_PASSWORD` | Secret | contraseña de la clave |
| `ANDROID_SIGNING_ENABLED` | Variable | `true` = job activo |

> ⚠️ **El keystore es la identidad de la app para siempre.** Respáldalo
> (gestor de contraseñas / bóveda / nube privada). Si lo pierdes no
> podrás publicar actualizaciones de la misma app en Play Store. Nunca
> va a git (gitleaks lo cazaría igualmente).

### Build release local

```bash
bash scripts/gen-release-keystore.sh release-signing/   # solo la 1ª vez
cd android
cat >> gradle.properties << EOF
android.injected.signing.store.file=../../release-signing/lba-release.jks
android.injected.signing.store.password=<store>
android.injected.signing.key.alias=lba-release
android.injected.signing.key.password=<key>
EOF
./gradlew bundleRelease
```

> ⚠️ El path inyectado de `store.file` se resuelve relativo al
> **módulo app** (`android/app/`), NO al proyecto gradle raíz: desde
> `android/`, el keystore en la raíz del repo queda en `../../<ruta>`.
> Si lo pones mal, `signReleaseBundle` falla con
> `storeFile ... doesn't exist` (bug real — ver
> [Troubleshooting](Troubleshooting)).

### Publicar en Google Play

1. Descarga `LBApos-release.aab` del run de Actions (o build local).
2. Play Console → crear app (nombre `LBApos`, package
   `com.sambapos.lba` — **debe coincidir con la firma**).
3. Subir el AAB a internal testing → instalar en tablets reales.
4. Checklist antes de producción: `versionCode` incrementado ·
   `versionName` semver · secrets de PRODUCCIÓN en el backend
   (`JWT_SECRET` fuerte, `CORS_ORIGIN` real, `ADMIN_PIN` no-1234).

### Emulator smoke (EXPERIMENTAL)

Job `smoke` de `android.yml`: emulador API 34 → instala APK → lanza →
verifica proceso → screenshot. Es best-effort por el boot flaky de los
runners; el gate obligatorio es `build`. El script vive versionado en
`scripts/android-smoke.sh`.

## ServerConfig en Android (primera ejecución)

1. Splash (2s, azul) → pantalla de bienvenida.
2. URL del servidor (ej. `http://192.168.1.104:3001`) → **Probar**
   (health check 5s) o **Escanear QR** (el QR lleva SOLO la URL).
3. Tipo de dispositivo: **POS** (mesas·pedidos·cobro) o **COCINA**
   (KDS full-screen).
4. **Guardar y continuar** → persiste en `localStorage
   ['samba_server_config']` y recarga.

Reconfigurar: botón de config en la topbar o limpiar datos de la app.
Demo en la tablet sin backend: no — el APK siempre es producción
(`DEMO_MODE=false`); la demo vive solo en Pages.

## cleartext / HTTPS — rationale

`capacitor.config.json` tiene `cleartext: true` y
`allowMixedContent: true` **por diseño**: los restaurantes operan en
LAN con `http://192.168.x.x` y el WebView debe poder alcanzarlo.

- **Escenario LAN (actual)**: HTTP interno = cleartext necesario.
  Riesgo aceptado: tráfico dentro de la red local del negocio.
- **Escenario HTTPS (recomendado cuando exista)**: proxy TLS
  (Caddy/nginx) delante del backend → puedes poner ambos flags en
  `false` y quitar `android:usesCleartextTraffic` del manifest.
- Nunca expongas el backend directamente a Internet sin TLS.

## Migrar a un keystore propio

Si algún día quieres una identidad de firma distinta (p. ej. Play App
Signing con subida de clave):

1. Genera el nuevo keystore (`gen-release-keystore.sh`).
2. Actualiza los 4 secrets (mismos nombres, nuevos valores).
3. Publica como **actualización** — Play lo rechazará si la firma no
   coincide: tendrás que despublicar o cambiar `applicationId`
   (app "nueva"). Planifícalo antes de tener usuarios.
