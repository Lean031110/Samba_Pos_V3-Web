#!/usr/bin/env bash
# =====================================================================
# gen-release-keystore.sh — Genera el keystore de firma de Android
# =====================================================================
# Uso (INTERACTIVO, nunca en CI):
#   bash scripts/gen-release-keystore.sh [directorio-de-salida]
#
# Produce en el directorio de salida (default: ./release-signing/):
#   - lba-release.jks         → keystore RSA-2048, 25 años de validez,
#                                alias "lba-release"
#   - keystore-passwords.txt  → contraseñas generadas (GUARDAR SEGURO,
#                                junto al keystore, FUERA de git)
#   - keystore-base64.txt     → contenido del keystore en base64 (para
#                                el secret ANDROID_KEYSTORE_BASE64)
#   - github-secrets-setup.txt → valores + comandos/API exactos para
#                                configurar los secrets en GitHub
#
# Después de ejecutarlo:
#   1. Sube los 4 secrets (ver github-secrets-setup.txt o la wiki:
#      página "Android", sección "Firma y Publicación").
#   2. Crea la variable ANDROID_SIGNING_ENABLED=true (Actions Variables).
#   3. Guarda lba-release.jks + keystore-passwords.txt en un lugar
#      PERMANENTE y respaldado. El mismo keystore debe firmar TODAS las
#      versiones futuras de la app o Android no aceptará actualizaciones.
#
# ⚠️ NUNCA subas el keystore ni las contraseñas al repositorio.
# =====================================================================
set -euo pipefail

OUT_DIR="${1:-release-signing}"
KEYSTORE="lba-release.jks"
ALIAS="lba-release"
VALIDITY=9125 # 25 años en días

command -v keytool >/dev/null 2>&1 || {
  echo "FAIL: keytool no está en PATH — instala un JDK (p.ej. temurin 17+)."
  exit 1
}

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

if [ -f "$KEYSTORE" ]; then
  echo "FAIL: $OUT_DIR/$KEYSTORE ya existe — muévelo o bórralo antes de regenerar."
  echo "     (Regenerar INVALIDA la identidad de firma anterior.)"
  exit 1
fi

# Contraseñas aleatorias fuertes (32 chars hex = 128 bits de entropía).
# openssl rand produce exactamente N chars sin tuberías → sin SIGPIPE.
gen_pass() {
  openssl rand -hex 16
}
STORE_PASS="$(gen_pass)"
KEY_PASS="$(gen_pass)"

DNAME="CN=LBApos, OU=SambaPOS, O=Lean031110, L=La Habana, C=CU"

keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity "$VALIDITY" \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "$DNAME"

# Verificación inmediata: el keystore debe ser legible con la contraseña.
keytool -list -keystore "$KEYSTORE" -storepass "$STORE_PASS" -alias "$ALIAS" > /dev/null

# Empaquetar los materiales para configurar GitHub.
base64 -w 0 "$KEYSTORE" > keystore-base64.txt
echo > /dev/null

cat > keystore-passwords.txt <<EOF
# ================================================
# GUARDA ESTE ARCHIVO JUNTO AL KEYSTORE, SEGURO Y
# RESPALDADO. SI SE PIERDE, NO PODRÁS ACTUALIZAR LA
# APP EN PLAY STORE CON LA MISMA IDENTIDAD.
# ================================================
Keystore file : $KEYSTORE
Alias         : $ALIAS
Store password: $STORE_PASS
Key password  : $KEY_PASS
EOF
chmod 600 keystore-passwords.txt "$KEYSTORE"

cat > github-secrets-setup.txt <<EOF
# ─── GitHub → Settings → Secrets and variables → Actions → Secrets ───
#
# (UI)  Pulsa "New repository secret" por cada uno:
#   ANDROID_KEYSTORE_BASE64 = contenido de keystore-base64.txt
#   ANDROID_KEY_ALIAS       = $ALIAS
#   ANDROID_STORE_PASSWORD  = $STORE_PASS
#   ANDROID_KEY_PASSWORD    = $KEY_PASS
#
# (CLI) Equivalente con GitHub CLI:
#   gh secret set ANDROID_KEYSTORE_BASE64 < keystore-base64.txt
#   echo "$ALIAS"        | gh secret set ANDROID_KEY_ALIAS
#   echo "$STORE_PASS"  | gh secret set ANDROID_STORE_PASSWORD
#   echo "$KEY_PASS"    | gh secret set ANDROID_KEY_PASSWORD
#
# ─── Variable pública (interruptor del job release) ───
#   Settings → Secrets and variables → Actions → Variables → New:
#   ANDROID_SIGNING_ENABLED = true
#   (o: gh variable set ANDROID_SIGNING_ENABLED --body "true")
#
# Al activar la variable, el siguiente push construye y publica el
# artifact LBApos-release.aab (job "Release AAB" de android.yml).
EOF

echo
echo "================ RESUMEN ================"
echo "Keystore       : $OUT_DIR/$KEYSTORE ($(stat -c%s "$KEYSTORE") bytes)"
echo "Alias          : $ALIAS"
echo "Validez        : $VALIDITY días (~25 años)"
echo ""
echo "SIGUIENTES PASOS:"
echo "  1. Configura los 4 secrets + la variable según:"
echo "     $OUT_DIR/github-secrets-setup.txt"
echo "  2. Respalda $OUT_DIR/$KEYSTORE + keystore-passwords.txt"
echo "     (nube privada / gestor de contraseñas / bóveda)."
echo "  3. NUNCA los subas al repositorio."
