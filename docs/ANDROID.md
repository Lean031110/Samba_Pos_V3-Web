# ANDROID.md — Android (Capacitor) Build Guide

**SambaPos_LBA — Android APK/AAB via Capacitor (LBApos)**

> PR #9 hardening: the `android/` project is **versioned in git**. It is
> never generated ad-hoc in CI (`npx cap add android || true` hid real
> errors before). The build is a mandatory CI gate with hard post-build
> checks (package ID, app name, versionName, APK size).

## Prerequisites

| Component | Version |
|-----------|---------|
| Android Studio | Hedgehog+ |
| JDK | 17 |
| Node.js | 20+ |
| Capacitor CLI | 6.x (root `package.json`) |

## Quick start (after `git clone` + `npm ci` at repo root)

```bash
# Capacitor dependencies + the versioned Android project
npm ci                     # root package.json (Capacitor only)

npm run test:android:config  # pre-flight gate: config, branding, identity
npm run cap:sync              # copy frontend/ web assets + plugins

npm run build:android:debug   # = cap:sync + gradlew assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
# CI artifact name: LBApos-debug.apk
```

Everything above runs **from the repository root** — `capacitor.config.json`
lives at the root with `webDir: "frontend"`, so there is no `cd backend`
involved anywhere.

## Root scripts (Capacitor)

| Script | What it does |
|--------|--------------|
| `npm run cap:add` | Bootstrap `android/` from scratch (only if missing — errors loudly otherwise) |
| `npm run cap:copy` | Copy `frontend/` into the Android assets |
| `npm run cap:sync` | copy + plugin update |
| `npm run cap:open` | Open Android Studio |
| `npm run test:android:config` | Pre-flight gate (see below) |
| `npm run build:android:debug` | Gate + sync + `assembleDebug` |
| `npm run build:android:release` | Gate + sync + `bundleRelease` |

## Pre-flight gate: `test:android:config`

`node scripts/check-android-config.js` verifies, before Gradle ever runs:

- `capacitor.config.json`: appId `com.sambapos.lba`, appName `LBApos`, webDir `frontend`
- `frontend/` web assets exist
- the **versioned** `android/` project (gradle wrapper committed + executable)
- `applicationId com.sambapos.lba`, `app_name = LBApos`
- `versionName` semver (x.y.z) + integer `versionCode`
- splash + launcher icons per density, adaptive icon XML
- portrait orientation (POS/KDS are vertical by design)

## Branding (versioned, reproducible)

All Android branding is committed under `android/app/src/main/res/`:

- **Splash**: full-screen compositions per orientation/density — a solid
  `#044392` field with the logo centered at its natural aspect ratio.
  The launch theme (`AppTheme.NoActionBarLaunch`) *stretches*
  `android:background`, so shipping a bare square logo would deform it;
  the port/land resources match the window aspect exactly → **the logo is
  never distorted**.
- **Launcher icons**: `mipmap-*` per density + adaptive icon
  (`mipmap-anydpi-v26`) with `#044392` background and the logo inside the
  66% safe zone.
- **Identity**: `strings.xml` (`app_name = LBApos`), `applicationId
  com.sambapos.lba`, `versionName` mirrors the app version.

To regenerate when the logo changes:

```bash
python3 scripts/generate-android-resources.py   # needs Pillow
```

## Build AAB (release — Play Store)

Signing material is **never committed** and lives ONLY in GitHub
**Secrets** (this repository is public: `vars.*` are readable by anyone
with read access, so a keystore must never be a variable). A public
variable acts as the on/off switch of the release job:

| Where | Setting | Purpose |
|-------|---------|---------|
| Repo secret | `ANDROID_KEYSTORE_BASE64` | keystore file, base64 encoded |
| Repo secret | `ANDROID_KEY_ALIAS` | key alias inside the keystore |
| Repo secret | `ANDROID_STORE_PASSWORD` | keystore password |
| Repo secret | `ANDROID_KEY_PASSWORD` | key password |
| Repo variable | `ANDROID_SIGNING_ENABLED=true` | enables the release job |

### One-shot setup (generates everything)

```bash
bash scripts/gen-release-keystore.sh release-signing/
# → creates the keystore + passwords + setup instructions
GITHUB_TOKEN=<PAT> python3 scripts/set-android-secrets.py \
  --keystore-dir release-signing/
# → uploads the 4 secrets + the toggle variable via the API
```

(or configure them by hand: Settings → Secrets and variables → Actions;
the generated `github-secrets-setup.txt` has the exact values/commands).

The `release` job in `.github/workflows/android.yml` then produces the
signed `LBApos-release.aab` artifact (verified with `jarsigner`). With
the toggle off/absent, only the debug APK is built (the release job is
skipped — it is never silently faked).

> ⚠️ Back up `lba-release.jks` + the passwords PERMANENTLY (password
> manager / private vault). The SAME keystore must sign every future
> version or Android will reject updates as a different app.

Local release build:

```bash
bash scripts/gen-release-keystore.sh release-signing/   # only once
KS="$(pwd)/release-signing/lba-release.jks"             # ABSOLUTE path!
cd android
cat >> gradle.properties << EOF
android.injected.signing.store.file=$KS
android.injected.signing.store.password=...
android.injected.signing.key.alias=lba-release
android.injected.signing.key.password=...
EOF
./gradlew bundleRelease
```

> ⚠️ `android.injected.signing.store.file` MUST be an **absolute**
> path. AGP resolves relative paths inconsistently (input validation →
> app module; `validateSigningRelease` → gradle daemon cwd), which
> broke the release channel twice before the root cause was pinned.

## Server configuration (Android welcome screen)

On first launch inside the native shell the app shows the
**ServerConfig welcome screen** (single source of truth for the server
URL, stored in `localStorage: samba_server_config`):

1. Enter the server URL (e.g. `http://192.168.1.104:3001`) — or scan the
   admin QR (URL only, never credentials).
2. **Probar** — health check against `<url>/health` with 5s timeout.
3. Choose the device mode: **POS** (mesas · pedidos · cobro) or
   **COCINA** (KDS full-screen).
4. **Guardar y continuar** — persists and reloads; `api.js` then routes
   every call to `<serverUrl>/api`.

The same `ServerConfig` module serves PWA, Android, browser and the
GitHub Pages demo (where it stays dormant because `DEMO_MODE=true`).

## cleartext / HTTPS — exact rationale (why both flags exist)

`capacitor.config.json`:

```json
"server":  { "androidScheme": "https", "cleartext": true },
"android": { "allowMixedContent": true }
```

| Flag | Why it is needed |
|------|------------------|
| `androidScheme: "https"` | The app is served from `https://localhost`, giving a **secure context**. Without it, the WebView origin is `http://localhost` and the app loses: Service Worker (PWA offline), `getUserMedia` (QR camera scanning), and several storage APIs. This is non-negotiable for the feature set. |
| `cleartext: true` | LAN servers run plain `http://192.168.x.x:3001`. Android 9+ blocks cleartext network traffic by default; this flag re-enables it so the WebView can *reach* the LAN server at all. |
| `allowMixedContent: true` | Because the app origin is `https://localhost` (previous flag) while the API is `http://…`, every `fetch`/XHR is technically *mixed content* and the WebView would block it. This flag allows exactly that combination. |

**All three are required together** for the supported deployment model
(Android app → HTTP LAN server). Removing any one breaks the LAN
connection; switching `androidScheme` to `http` would break PWA/camera
instead. For an HTTPS production server the flags are simply unused —
they do not weaken anything (no cleartext is attempted when the
configured URL is `https://`).

**Production guidance**: expose the backend via HTTPS (reverse proxy
with TLS) and configure that URL; the app then communicates fully over
TLS. The flags exist for the LAN development/on-prem scenario, which is
the documented deployment for this product.

## CI gates (`.github/workflows/android.yml`)

The Android build is a **mandatory** gate — `continue-on-error` was
removed in PR #9:

1. `npm ci` at root (lockfile-committed, reproducible)
2. `node scripts/check-android-config.js`
3. `npx cap sync android`
4. Gradle wrapper verified (present + executable)
5. `./gradlew assembleDebug` — failure fails the workflow
6. APK exists, > 1 MB, and `aapt2 dump badging` proves:
   `package name='com.sambapos.lba'`, `application-label:'LBApos'`,
   semver `versionName`
7. Artifact `LBApos-debug.apk`
8. Release AAB only with signing configured (Secrets, never in git)
9. Separate best-effort **emulator smoke job** (EXPERIMENTAL, explicitly
   non-blocking): install APK → launch → package/activity/process
   checks → screenshot evidence

## Notes

- The Android app wraps the existing PWA — no business-logic changes.
- WebSocket + Push work via Capacitor's bridge.
- `android/local.properties` and `android/app/src/main/assets/public/`
  are gitignored (machine-specific / generated by `cap sync`).
