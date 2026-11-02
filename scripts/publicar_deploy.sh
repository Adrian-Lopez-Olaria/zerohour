#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# publicar_deploy.sh · publica el sitio montado en la rama `deploy` (y SOLO ahí)
#
#   scripts/publicar_deploy.sh <carpeta-montada> <url-del-remoto> "<mensaje>"
#
# Crea un repositorio desechable en la carpeta montada, hace un único commit HUÉRFANO
# y lo empuja con --force a refs/heads/deploy. Así la rama deploy siempre tiene un solo
# commit (el sitio de hoy) y el historial de git no crece con los datos.
#
# Salvaguarda: la rama de destino está fija en el código; este script no puede tocar main.
# Credenciales: si existe GIT_AUTH_HEADER (en Actions, "AUTHORIZATION: basic …" con el
# GITHUB_TOKEN del job), se pasa como cabecera HTTP solo a este push; no se guarda en
# ninguna config ni aparece en la URL.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DIR="${1:?carpeta montada}"
REMOTE="${2:?url del remoto}"
MSG="${3:-deploy}"
readonly TARGET="refs/heads/deploy"          # fijo: nunca main

[ -f "$DIR/web/index.html" ] || { echo "✗ $DIR no contiene un sitio montado"; exit 1; }
[ -f "$DIR/web/data/latest.json" ] || { echo "✗ $DIR no contiene datos"; exit 1; }

cd "$DIR"
rm -rf .git
git init -q
# Byte a byte: sin conversiones de fin de línea (los ficheros de vendor/ y geo/ llevan hash fijado
# en VERSIONS.md y el .gitattributes de main no viaja a este repositorio desechable)
git config core.autocrlf false
git config core.safecrlf false
git checkout -q --orphan deploy
git add -A
git -c user.name="zerohour-bot" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -q -m "$MSG"

if [ -n "${GIT_AUTH_HEADER:-}" ]; then
  git -c "http.extraheader=${GIT_AUTH_HEADER}" push -q --force "$REMOTE" "HEAD:${TARGET}"
else
  git push -q --force "$REMOTE" "HEAD:${TARGET}"
fi
rm -rf .git                                   # el repo desechable no se queda en disco
echo "✓ publicado en deploy: $(git -C "$REMOTE" rev-parse --short deploy 2>/dev/null || echo 'remoto')"
