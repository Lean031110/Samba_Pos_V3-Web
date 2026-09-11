#!/usr/bin/env bash
# =====================================================================
# publish-wiki.sh — Publica wiki/ del repo como GitHub Wiki nativa
# =====================================================================
# Prerrequisito (UNA sola vez, manual):
#   1. Abre https://github.com/Lean031110/Samba_Pos_V3-Web/wiki
#      y crea la primera página (contenido cualquiera, p. ej. "bootstrap").
#      Esto provisiona el repositorio git oculto *.wiki.git.
#   2. Autenticación con permiso de wiki:
#        - PAT CLÁSICO con scope `repo` (los fine-grained NO tienen
#          permiso de wiki), exportado como GITHUB_TOKEN, o
#        - clave SSH configurada (usa la URL SSH automáticamente).
#
# Uso:
#   GITHUB_TOKEN=<pat-clásico> bash scripts/publish-wiki.sh
#   bash scripts/publish-wiki.sh --ssh          # usa SSH en vez de HTTPS
#
# Qué hace:
#   - clona *.wiki.git a .wiki-tmp/
#   - copia wiki/*.md (Home, _Sidebar, todas las páginas)
#   - commit + push (rama master del wiki)
# La fuente de verdad SIEMPRE es wiki/ del repositorio principal:
# edita ahí, vuelve a publicar con este script.
# =====================================================================
set -euo pipefail

REPO="Lean031110/Samba_Pos_V3-Web"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIKI_SRC="$SCRIPT_DIR/../wiki"
TMP="$SCRIPT_DIR/../.wiki-tmp"

test -f "$WIKI_SRC/Home.md" || { echo "FAIL: wiki/Home.md no existe"; exit 1; }

AUTH="false"
if [ "${1:-}" = "--ssh" ]; then AUTH="ssh"; fi
if [ -n "${GITHUB_TOKEN:-}" ]; then AUTH="https"; fi
if [ "$AUTH" = "false" ]; then
  echo "FALTA AUTENTICACIÓN: exporta GITHUB_TOKEN=<pat clásico> o usa --ssh"
  exit 1
fi

if [ "$AUTH" = "ssh" ]; then
  URL="git@github.com:$REPO.wiki.git"
else
  URL="https://${GITHUB_TOKEN}@github.com/${REPO}.wiki.git"
fi

rm -rf "$TMP"
git clone "$URL" "$TMP" 2>&1 | grep -v '^remote:' || true
test -d "$TMP/.git" || { echo "FAIL: no se pudo clonar el wiki (¿creaste la primera página en la UI?)"; exit 1; }

# Copia todas las páginas (md) — la sidebar incluida.
cp "$WIKI_SRC"/*.md "$TMP/"

cd "$TMP"
git config user.name "wiki-publisher"
git config user.email "wiki@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "Sin cambios — el wiki ya está actualizado."
else
  git commit -m "docs(wiki): sincroniza wiki/ del repo ($(date +%F))"
  git push origin master
  echo "OK: wiki publicado → https://github.com/$REPO/wiki"
fi
