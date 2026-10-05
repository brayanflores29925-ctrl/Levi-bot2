# Levi-Bot

Bot de WhatsApp multi-dispositivo con conexión por pairing code (Baileys).

## Requisitos

- Node.js
- `yt-dlp` — lo usan todos los descargadores (play, play2, playvideo, playdoc, facebook, Instagram, tiktok, x). **No se instala con npm.**
- `ffmpeg` — lo usan stickers y efectos de audio/video.

### Instalar en Termux

```
pkg install python ffmpeg -y
pip install -U yt-dlp
```

### Instalar en Linux / VPS

```
sudo apt update && sudo apt install ffmpeg python3-pip -y
pip3 install -U yt-dlp
```

Si falta alguno, el bot te lo dice al arrancar y también en el chat cuando
intentas descargar, con el comando exacto para tu entorno.

## Arrancar

```
npm install
npm start
```

La primera vez pedirá el número de teléfono y mostrará un pairing code.

## Mantenerlo vivo

Hay varios scripts en la raíz. **Usa solo uno a la vez**, si corres dos a la
vez se pisan y reinician el bot en loop:

- `supervisor-levi.sh` — reinicia el bot si termina (recomendado).
- `monitor-levi.sh` — vigila y relanza el supervisor si se cae.
- `watchdog-levi.sh`, `mantener-levi.sh`, `iniciar.sh` — variantes antiguas;
  quedan por compatibilidad, preferí no borrarlas.

## Archivos que NO se suben a Git

Por seguridad, estos archivos viven solo en tu dispositivo y están en
`.gitignore`. Si clonas el repo en otro lado, el bot los crea vacíos al
arrancar:

- `authdb.json` — contraseña y números autorizados. Puedes fijar la
  contraseña con la variable de entorno `LEVI_AUTH_PASSWORD`; si no, se
  genera una aleatoria y se muestra una vez en consola.
- `database.json` — base de usuarios.
- `data/*.json` — estado de runtime (horarios, mensajes, subbots, avisos).

Hay plantillas `authdb.example.json` y `database.example.json` por si
quieres ver el formato esperado.

## Comandos

El inventario completo se genera con:

```
node scripts/listar-comandos.mjs
```
