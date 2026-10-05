#!/usr/bin/env bash
# instalar-pot-provider.sh — Instala el proveedor de PO tokens de bgutil
# Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
#
# YouTube exige un "proof-of-origin token" a las IPs de datacenter y sin él
# responde "Sign in to confirm you're not a bot". Este script deja instalado:
#   1. el plugin de yt-dlp que sabe pedir el token, y
#   2. el servidor que lo genera (bgutil-ytdlp-pot-provider).
#
# Detecta Termux vs Linux y elige la vía correcta. Al final te dice el comando
# exacto para dejar el proveedor corriendo; el bot lo detecta solo al arrancar.

set -e

RAMA="2.0.0"
BASE="$HOME/bgutil-ytdlp-pot-provider"

if [ -d /data/data/com.termux ]; then
  echo ">> Termux detectado."
  pkg install -y python nodejs git
  pip install -U yt-dlp bgutil-ytdlp-pot-provider
else
  echo ">> Linux detectado."
  sudo apt update && sudo apt install -y python3-pip git
  pip3 install -U yt-dlp bgutil-ytdlp-pot-provider
fi

if [ ! -d "$BASE" ]; then
  echo ">> Clonando el servidor bgutil (rama $RAMA)..."
  git clone --single-branch --branch "$RAMA" \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$BASE"
fi

echo ">> Compilando el servidor..."
cd "$BASE/server"
npm ci
npx tsc

cat <<'FIN'

============================================================
 Listo. Ahora deja el proveedor corriendo en segundo plano:

   node ~/bgutil-ytdlp-pot-provider/server/build/main.js

 (En Linux con docker también sirve:
   docker run --name bgutil-provider -d --init \
     -p 127.0.0.1:4416:4416 brainicism/bgutil-ytdlp-pot-provider )

 Reinicia el bot. En la consola deberías ver:
   [LEVI] OK POT provider activo en http://127.0.0.1:4416
============================================================
FIN
