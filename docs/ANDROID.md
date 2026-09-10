# ANDROID.md — Android (Capacitor) Build Guide

**SambaPos_LBA — Android APK/AAB via Capacitor**

## Prerequisites

| Component | Version |
|-----------|---------|
| Android Studio | Hedgehog+ |
| JDK | 17 |
| Node.js | 20+ |
| Capacitor CLI | 6.x |

## Setup (one-time)

```bash
# 1. Install Capacitor dependencies
cd backend
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install -D @capacitor/splash-screen

# 2. Initialize Android project
npx cap add android

# 3. Copy web assets to native project
npx cap copy

# 4. Open Android Studio
npx cap open android
```

## Build APK (debug)

```bash
# From repo root
cd backend
npx cap copy android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Build AAB (release — for Play Store)

```bash
# 1. Generate keystore (one-time)
keytool -genkey -v -keystore sambapos-release.keystore -alias sambapos -keyalg RSA -keysize 2048 -validity 10000

# 2. Configure signing in android/app/build.gradle
# 3. Build AAB
cd android
./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
```

## Configuration

The `capacitor.config.json` at repo root defines:
- `appId`: `com.sambapos.lba` (unique Android package ID)
- `appName`: `SambaPos LBA`
- `webDir`: `../frontend` (the SPA web assets)
- `server.androidScheme`: `https` (secure scheme for PWA features)
- `SplashScreen`: 2s launch with brand blue (#044392)

## Notes

- The Android app wraps the existing PWA — no code changes needed
- WebSocket + Push notifications work via Capacitor's HTTP/WebSocket bridge
- For production builds, configure signing in `android/app/build.gradle`
- The backend server URL must be configured via env var `SAMBA_API_URL`
