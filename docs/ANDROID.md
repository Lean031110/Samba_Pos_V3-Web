# ANDROID.md — Build & Install Guide

> Guía oficial para compilar e instalar la APK de SambaPos_LBA.

## Requisitos

- Node.js 20+
- Java 17 (JDK Temurin recomendado)
- Android SDK (Platform 34, Build-tools 34.0.0)
- Android Studio (recomendado para edición y debugging nativo)
- Capacitor (incluido en dependencies)

## Build local

```bash
# En la raíz del repo
npm install

# Agregar plataforma Android (si no existe)
npx cap add android

# Copiar assets web a android/
npx cap copy android

# Sincronizar plugins nativos
npx cap sync android

# Compilar APK debug
cd android
./gradlew assembleDebug --no-daemon

# APK generada en:
# android/app/build/outputs/apk/debug/app-debug.apk
```

## APK Release (firmada)

Requiere configurar secrets en GitHub Actions:

- `ANDROID_KEYSTORE_BASE64` — keystore en base64
- `ANDROID_KEY_ALIAS` — alias de la key
- `ANDROID_KEY_PASSWORD` (secret) — password de la key
- `ANDROID_STORE_PASSWORD` (secret) — password del keystore

Si los secrets están configurados, el workflow genera automáticamente `SambaPos-LBA-release.aab` (Android App Bundle) listo para subir a Google Play.

## CI Workflow

`.github/workflows/android.yml`:

1. Setup Node + Java + Android SDK
2. Install dependencies
3. `npx cap add android` (si no existe)
4. `npx cap copy android` + `npx cap sync android`
5. `./gradlew assembleDebug`
6. Upload APK como artifact (30 días retención)
7. Si signing secrets existen: `./gradlew bundleRelease` + upload AAB

## Descargar APK

Desde GitHub Actions:

1. Ir a la pestaña **Actions** del repo
2. Seleccionar el workflow **Android Build**
3. Última run exitosa → **Artifacts**
4. Descargar `SambaPos-LBA-debug.apk`

## Instalación en dispositivo

```bash
# Habilitar ADB debugging en Android (Settings → Developer options)

# Instalar APK
adb install SambaPos-LBA-debug.apk

# Lanzar app
adb shell am start -n com.sambapos.lba/.MainActivity
```

O manualmente: copiar APK al dispositivo y abrir el archivo.

## Configuración inicial

Al abrir la app por primera vez:

1. **Server config screen** aparece si no hay servidor configurado
2. Ingresar URL del servidor (ej: `http://192.168.1.10:3001`)
3. Click "Probar conexión" → debe mostrar ✓ verde
4. (Opcional) Escanear QR del servidor
5. Seleccionar modo: POS / KDS / Admin
6. Click "Guardar"

Después del login, el usuario aterriza en la vista según su rol.

## Capacitor plugins integrados

| Plugin | Uso |
|---|---|
| `@capacitor/status-bar` | Color azul LBA en status bar |
| `@capacitor/app` | Back button nativo |
| `@capacitor/haptics` | Vibración en acciones POS |
| `@capacitor/network` | Estado online/offline |

## Iconos y splash

- `frontend/assets/logo-symbol.png` — adaptive icon foreground
- `frontend/assets/splash-512.png` — splash screen
- `frontend/icons/icon-192-maskable.png` — launcher icon (máscara)
- `frontend/icons/icon-512-maskable.png` — launcher icon alta resolución

Los iconos no se deforman porque usan el formato **maskable** de Android (adaptive icons).

## Estado actual (v0.6.1)

- ✅ APK debug se compila correctamente en CI.
- ⚠️ APK release (firmada) requiere configurar secrets — el workflow está listo pero no se ejecuta hasta que se agreguen.
- ⚠️ Smoke test en emulator NO implementado (experimental, pendiente).
- ✅ Plugin Capacitor integrados (StatusBar, App, Haptics, Network).
- ✅ Server config screen con QR scanner.

## Pendiente

- [ ] Emulator smoke test en CI
- [ ] Firma release con keystore real
- [ ] Publicación en Google Play Store
- [ ] Soporte offline (IndexedDB) ya implementado, falta smoke test en emulator
