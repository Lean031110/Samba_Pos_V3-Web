# Troubleshooting — problemas conocidos y soluciones exactas

Cada entrada documenta un problema REAL que ocurrió y cómo se cerró
(el historial vive en PRs #9/#10/#11 y el worklog).

## Índice

1. [gradlew: Permission denied (CI)](#1-gradlew-permission-denied-ci)
2. [Gate aapt2 falla con versionName válido](#2-gate-aapt2-falla-con-versionname-válido)
3. [Paso de CI verde con tests fallando (`| tee` sin pipefail)](#3-paso-de-ci-verde-con-tests-fallando--tee-sin-pipefail)
4. [Visual regression: falsos positivos ~1.5%](#4-visual-regression-falsos-positivos-15)
5. [Emulator smoke: scripts inline imposibles](#5-emulator-smoke-scripts-inline-imposibles)
6. [Screenshot de splash "vacío" (~2 KB)](#6-screenshot-de-splash-vacío-2-kb)
7. [MIME `application/javascript` vs `text/javascript` en Pages](#7-mime-applicationjavascript-vs-textjavascript-en-pages)
8. [PostgreSQL: constraint duplicado en migración](#8-postgresql-constraint-duplicado-en-migración)
9. [API 404 en `actions/public-key` (secrets por API)](#9-api-404-en-actionspublic-key-secrets-por-api)
10. [La demo de Pages muestra datos reales](#10-la-demo-de-pages-muestra-datos-reales)
11. [El APK instala pero no conecta al servidor](#11-el-apk-instala-pero-no-conecta-al-servidor)
12. [Release AAB: fallas de firma por ruta del keystore](#12-release-aab-fallas-de-firma-por-ruta-del-keystore)
13. ["final block not properly padded" al leer la clave (PKCS12)](#13-final-block-not-properly-padded-al-leer-la-clave-pkcs12)

---

### 1. `gradlew: Permission denied` (CI)

**Síntoma**: el job Android falla en "Verify Gradle wrapper" aunque el
wrapper está commiteado.

**Causa**: git commiteó `android/gradlew` sin el bit ejecutable.

**Fix**:
```bash
git update-index --chmod=+x android/gradlew
git commit -m "fix(android): restore executable bit on gradlew"
```
El gate (`test -x android/gradlew`) existe precisamente para esto.

---

### 2. Gate aapt2 falla con versionName válido

**Síntoma**: "FAIL: versionName missing" aunque el badging muestra
versionName correcto.

**Causa**: el grep original asumía el orden de campos del badging
(`name` → `versionName`); a veces `versionCode` aparece intercalado.

**Fix**: grep independiente del orden (`versionName='[0-9.]+'`). El
APK era correcto — el gate estaba sobre-estricto (PR #9).

---

### 3. Paso de CI verde con tests fallando (`| tee` sin pipefail)

**Síntoma**: visual regression FALLÓ (diff 1.48%) pero el step quedó
verde → workflow success con tests rotos.

**Causa**: `npx playwright test | tee log.txt` devuelve el exit code
de `tee` (0), no el de playwright.

**Fix**: `set -o pipefail` al inicio de los pasos con tuberías (4 pasos
corregidos en `ci.yml`). Regla: cualquier paso con `|` lleva pipefail.

---

### 4. Visual regression: falsos positivos ~1.5%

**Síntoma**: diffs de 1.4–1.6% de píxeles en pantallas idénticas.

**Causa**: antialiasing/rendering difiere entre runners y local
(fuentes, GPU virtual).

**Fix**: tolerancia al 2% (de 1%) en el config de visual. Por encima
de 2% ES un cambio real de UI → revisar el artifact
`visual-regression-diff`. La baseline se actualiza solo vía workflow
manual (ver [Pruebas](Pruebas#baseline-visual)).

---

### 5. Emulator smoke: scripts inline imposibles

**Síntoma**: loops/multi-línea en el `script:` del emulator-runner
fallan raro (cada línea se ejecuta como `sh -c` separado).

**Fix**: toda la lógica vive en `scripts/android-smoke.sh`
(versionado); el workflow solo lo invoca. Además el smoke valida
`Status: ok` con tolerancia (emulador frío reporta `device not
booted` brevemente).

---

### 6. Screenshot de splash "vacío" (~2 KB)

**Síntoma**: el screenshot del emulador parece vacío/roto (2 KB).

**Causa**: un splash sólido `#044392` sin texto comprime muchísimo.

**Fix**: la validez del screenshot es "PNG magic bytes presente", no
un tamaño mínimo. El screenshot es evidencia, no un gate de contenido.

---

### 7. MIME `application/javascript` vs `text/javascript` en Pages

**Síntoma**: smoke de Pages 3/4 en local, 4/4 en CI o viceversa.

**Causa**: el servidor local y el CDN de Pages sirven JS con MIME
distinto; el smoke validaba uno solo.

**Fix** (PR #10): el smoke acepta ambos MIME. Portabilidad local↔CDN.

---

### 8. PostgreSQL: constraint duplicado en migración

**Síntoma**: `npm run migrate` con `DATABASE_URL=postgres://...`
falla con constraint duplicado.

**Estado**: EXPERIMENTAL documentado — el job de PG en CI corre el
teste para no perder cobertura, pero el fallo está conocido y anotado
(README + badge). **SQLite es la BD soportada**. Cerrar esto requiere
protocolo backend (ver [Contribuir](Contribuir#cambios-en-backendsrc)).

---

### 9. API 404 en `actions/public-key` (secrets por API)

**Síntoma**: `PUT /actions/secrets/X` funciona (422 con valor inválido)
pero `GET /actions/public-key` → 404.

**Causa**: endpoint movido. La ruta vigente es
`/repos/{owner}/{repo}/actions/secrets/public-key`. (La antigua ni
siquiera redirige para PATs fine-grained.)

**Fix**: `scripts/set-android-secrets.py` ya usa la ruta correcta.

**Nota adicional**: los PAT **fine-grained NO tienen permiso de wiki**
— para pushear a `*.wiki.git` se necesita PAT clásico (`repo`) o SSH.
Ver [Contribuir](Contribuir#activar-la-wiki-de-github).

---

### 10. "La demo de Pages muestra datos reales"

**Verificación**: la demo usa Mock API client-side; NO hay camino para
datos reales (no conoce ningún backend). Si ves datos distintos a los
esperados: son los de `demo-data.js` (alguien los cambió) — revisa el
diff del frontend. El overlay `DEMO_MODE: true` está gateado en CI.

---

### 11. El APK instala pero no conecta al servidor

Checklist en orden:
1. URL correcta en ServerConfig (`http://IP:3001` — con `http://`, el
   teclado puede autocompletar `https://`).
2. **Probar** (health check) desde la MISMA tablet: la IP del servidor
   debe ser alcanzable por WiFi del local (no la IP del PC de dev).
3. Backend corriendo: `curl http://IP:3001/health` desde otra máquina.
4. Firewall del servidor: puerto 3001 abierto en LAN.
5. cleartext está en `true` en `capacitor.config.json` (es default).
6. Backend en producción: `CORS_ORIGIN` correcto (el server no arranca
   con `*` en prod — revisa sus logs).
7. Reinstaló tras cambiar `appId`? Es una app distinta: limpia datos.

---

### 12. Release AAB: fallas de firma por ruta del keystore

**Síntomas (dos runs distintos, dos errores distintos)**:
- Run 1: `:app:signReleaseBundle` →
  `storeFile specifies file '.../android/app/release.keystore' which doesn't exist`
- Run 2: `:app:validateSigningRelease` →
  `Keystore file '/home/runner/.gradle/daemon/8.2.1/release.keystore' not found`

**Causa raíz**: la propiedad inyectada
`android.injected.signing.store.file` con ruta RELATIVA se resuelve de
forma **inconsistente dentro de AGP**: la validación de inputs la
resuelve relativa al módulo app (`android/app/`), mientras
`validateSigningRelease` la resuelve relativa al **cwd del daemon de
Gradle**. Estas propiedades fueron diseñadas para Android Studio, que
siempre pasa rutas absolutas — las relativas son comportamiento
indefinido.

**Fix**: pasar SIEMPRE una ruta **absoluta**
(`KS_FILE="$(pwd)/app/release.keystore"` en CI; `KS="$(pwd)/..."` en
local). El workflow ya está corregido.

**Contexto**: el bug existía desde el diseño del canal release pero no
se había visto porque **nunca había corrido** (sin secrets
configurados, el job saltaba). Apareció las dos primeras veces que el
canal corrió de verdad (PR #11). Lección: un canal de release sin
secretos configurados nunca fue probado.

---

### 13. "final block not properly padded" al leer la clave (PKCS12)

**Síntoma**: `:app:signReleaseBundle` falla con
`Failed to read key *** from store ".../release.keystore": Get Key
failed: Given final block not properly padded. Such issues can arise
if a bad key is used during decryption.`

**Causa**: `keytool` moderno genera por defecto keystores **PKCS12**,
que NO soportan contraseñas distintas para store y key. keytool
**ignora** `-keypass` con un warning ("Different store and key
passwords not supported for PKCS12 KeyStores") y cifra TODO con el
storepass. Si el secret `ANDROID_KEY_PASSWORD` tiene un valor
distinto, la clave no se puede descifrar → este error criptográfico
engañoso (parece keystore corrupto, es solo password).

**Verificación local**:
```bash
keytool -list -keystore lba-release.jks -storepass <SP> \
  -alias lba-release -keypass <KP>   # el warning de PKCS12 lo dice
```

**Fix**: `ANDROID_KEY_PASSWORD` debe ser IGUAL a
`ANDROID_STORE_PASSWORD` (así lo genera `gen-release-keystore.sh`
desde la corrección del PR #11). Si tienes un keystore legacy con
contraseñas distintas, migra a JKS o iguala los secrets.

---

## Cuándo nada de esto aplica

Si el problema es de lógica de negocio (dinero, inventario, cocina):
**no improvises**. Protocolo: reproducir con test → documentar →
arreglar en `backend/src` con PR (ver [Contribuir](Contribuir)).
