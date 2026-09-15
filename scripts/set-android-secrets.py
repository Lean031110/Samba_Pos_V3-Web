#!/usr/bin/env python3
# =====================================================================
# set-android-secrets.py — Configura los secrets/vars de firma Android
# =====================================================================
# Alternativa a `gh secret set` para entornos sin GitHub CLI.
#
# Uso:
#   GITHUB_TOKEN=<PAT con permisos Actions secrets/vars: write> \
#   python3 scripts/set-android-secrets.py --keystore-dir release-signing/
#
#     --keystore-dir  directorio generado por gen-release-keystore.sh
#                     (contiene lba-release.jks + keystore-passwords.txt)
#     --repo          Lean031110/Samba_Pos_V3-Web (default)
#     --dry-run       muestra qué haría sin tocar nada
#
# Configura:
#   Secrets : ANDROID_KEYSTORE_BASE64, ANDROID_KEY_ALIAS,
#             ANDROID_STORE_PASSWORD, ANDROID_KEY_PASSWORD
#   Variable: ANDROID_SIGNING_ENABLED=true
#
# El token NUNCA se guarda en el repositorio. Requiere PyNaCL
# (pip install pynacl) porque GitHub cifra los secretos con libsodium
# sealed-box usando la clave pública del repositorio.
# =====================================================================
import argparse
import base64
import json
import os
import re
import sys
import urllib.request
import urllib.error

try:
    from nacl import encoding, public
except ImportError:
    sys.exit("FALTA PyNaCL — instala con: pip install pynacl")


def api(token, repo, method, path, body=None):
    url = f"https://api.github.com/repos/{repo}/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, method=method, data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def encrypt_secret(public_key_b64, secret_value):
    """Cifra un valor como GitHub espera (libsodium sealed box)."""
    pk = public.PublicKey(public_key_b64.encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(secret_value.encode())
    return base64.b64encode(sealed).decode()


def parse_passwords_file(path):
    """Extrae los 4 valores de keystore-passwords.txt."""
    text = open(path, encoding="utf-8").read()
    fields = {}
    for line in text.splitlines():
        m = re.match(r"^([A-Za-z ]+?)\s*:\s*(.+)$", line)
        if m:
            fields[m.group(1).strip().lower()] = m.group(2).strip()
    alias = fields.get("alias")
    store_pass = fields.get("store password")
    key_pass = fields.get("key password")
    if not (alias and store_pass and key_pass):
        sys.exit(f"FAIL: no pude leer alias/contraseñas desde {path}")
    return alias, store_pass, key_pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keystore-dir", default="release-signing")
    ap.add_argument("--repo", default="Lean031110/Samba_Pos_V3-Web")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        sys.exit("FAIL: exporta GITHUB_TOKEN=<PAT> antes de ejecutar.")

    ks_dir = args.keystore_dir
    keystore = os.path.join(ks_dir, "lba-release.jks")
    passwords = os.path.join(ks_dir, "keystore-passwords.txt")
    if not os.path.isfile(keystore) or not os.path.isfile(passwords):
        sys.exit(f"FAIL: {ks_dir} no contiene lba-release.jks + keystore-passwords.txt\n"
                 "      Ejecuta antes: bash scripts/gen-release-keystore.sh")

    alias, store_pass, key_pass = parse_passwords_file(passwords)
    keystore_b64 = base64.b64encode(open(keystore, "rb").read()).decode()

    # 1) Clave pública del repositorio (necesaria para cifrar).
    #    ⚠️ ruta correcta: actions/secrets/public-key (la antigua
    #    /actions/public-key responde 404 en PATs fine-grained).
    if args.dry_run:
        print("[DRY-RUN] configuraría:")
        for k, v in [("ANDROID_KEYSTORE_BASE64", f"<{len(keystore_b64)} chars b64>"),
                     ("ANDROID_KEY_ALIAS", alias),
                     ("ANDROID_STORE_PASSWORD", "***"),
                     ("ANDROID_KEY_PASSWORD", "***")]:
            print(f"  secret {k} = {v}")
        print("  var    ANDROID_SIGNING_ENABLED = true")
        return

    status, key_data = api(token, args.repo, "GET", "actions/secrets/public-key")
    if status != 200:
        sys.exit(f"FAIL: public-key HTTP {status}: {key_data}")
    print(f"OK: clave pública del repo obtenida (id {key_data['key_id']})")

    secrets = {
        "ANDROID_KEYSTORE_BASE64": keystore_b64,
        "ANDROID_KEY_ALIAS": alias,
        "ANDROID_STORE_PASSWORD": store_pass,
        "ANDROID_KEY_PASSWORD": key_pass,
    }
    for name, value in secrets.items():
        encrypted = encrypt_secret(key_data["key"], value)
        status, resp = api(token, args.repo, "PUT",
                           f"actions/secrets/{name}",
                           {"encrypted_value": encrypted, "key_id": key_data["key_id"]})
        if status not in (201, 204):
            sys.exit(f"FAIL: secret {name} HTTP {status}: {resp}")
        print(f"OK: secret {name} configurado")

    # 2) Variable pública = interruptor del job release.
    status, resp = api(token, args.repo, "POST", "actions/variables",
                       {"name": "ANDROID_SIGNING_ENABLED", "value": "true"})
    if status == 201:
        print("OK: variable ANDROID_SIGNING_ENABLED=true creada")
    elif status == 409:  # ya existe → actualizar
        status, resp = api(token, args.repo, "PATCH",
                           "actions/variables/ANDROID_SIGNING_ENABLED",
                           {"value": "true"})
        if status == 204:
            print("OK: variable ANDROID_SIGNING_ENABLED=true actualizada")
        else:
            sys.exit(f"FAIL: actualizar variable HTTP {status}: {resp}")
    else:
        sys.exit(f"FAIL: crear variable HTTP {status}: {resp}")

    print("\nLISTO — el próximo push a main ejecutará el job 'Release AAB'")
    print("y publicará el artifact LBApos-release.aab.")


if __name__ == "__main__":
    main()
