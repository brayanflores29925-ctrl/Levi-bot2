/**
 * Instagram.js — Descargador de Reels, publicaciones y videos de Instagram
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import {
  estaDisponible,
  explicarErrorDescarga,
  mensajeFaltaDependencia,
  LIMITE_MEDIA_MB
} from '../deps.js'

const execFileAsync = promisify(execFile)

// Instagram bloquea la extracción anónima la mayor parte del tiempo. Si el
// usuario exporta sus cookies a cookies.txt en la raíz del bot, se usan
// automáticamente y la descarga vuelve a funcionar.
const COOKIES_FILE = path.join(process.cwd(), 'cookies.txt')

function argsCookies() {
  return fs.existsSync(COOKIES_FILE) ? ['--cookies', COOKIES_FILE] : []
}

export default {
  name: 'Instagram',

  async execute(sock, m, parts) {
    const chatId = m.chat || m.key?.remoteJid
    const url = parts?.join(' ').trim()

    if (!url) {
      return sock.sendMessage(chatId, {
        text: '❌ Envía el enlace público de Instagram.\n\nEjemplo: /Instagram https://www.instagram.com/reel/...'
      })
    }

    if (!/^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\//i.test(url)) {
      return sock.sendMessage(chatId, {
        text: '❌ Enlace de Instagram no válido.\n\nUsa un enlace público de Reel, publicación o video.'
      })
    }

    if (!(await estaDisponible('yt-dlp'))) {
      console.error('[INSTAGRAM] yt-dlp no está instalado.')
      return sock.sendMessage(chatId, {
        text: mensajeFaltaDependencia('yt-dlp')
      })
    }

    await sock.sendMessage(chatId, {
      text: '⏳ Procesando Instagram...'
    })

    const tempDir = path.join(process.cwd(), 'temp')
    await fs.promises.mkdir(tempDir, { recursive: true })

    const id = `instagram-${Date.now()}`
    const outputTemplate = path.join(tempDir, `${id}.%(ext)s`)

    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [
          '--no-playlist',
          '--print', 'title',
          '--print', 'filename',
          '-f', 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
          '--merge-output-format', 'mp4',
          '--max-filesize', `${LIMITE_MEDIA_MB}m`,
          ...argsCookies(),
          '-o', outputTemplate,
          url
        ],
        {
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024
        }
      )

      const archivos = await fs.promises.readdir(tempDir)
      const candidatos = archivos
        .filter(nombre => nombre.startsWith(id + '.'))
        .map(nombre => path.join(tempDir, nombre))
        .filter(archivo => fs.existsSync(archivo))

      if (!candidatos.length) {
        throw new Error('No se encontró el archivo descargado.')
      }

      const archivo = candidatos[0]
      const stat = await fs.promises.stat(archivo)

      if (!stat.size) {
        throw new Error('El archivo descargado está vacío.')
      }

      const lineas = stdout
        .split('\n')
        .map(linea => linea.trim())
        .filter(Boolean)

      const titulo =
        lineas.find(linea =>
          !linea.includes('/') &&
          !linea.includes('\\') &&
          !linea.endsWith('.mp4')
        ) || 'Instagram'

      await sock.sendMessage(chatId, {
        video: { url: archivo },
        mimetype: 'video/mp4',
        fileName: 'instagram.mp4',
        caption: `📸 ${titulo}`
      })

      await fs.promises.unlink(archivo).catch(() => {})

    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('Error en /Instagram:', fallo.tipo, error?.stderr || error?.message)

      // Instagram es el caso donde más falla la vía anónima: si el diagnóstico
      // apunta a autenticación, se indica cómo habilitar las cookies.
      const extraCookies =
        fallo.tipo === 'autenticacion'
          ? '\n\n💡 *Solución:* exporta tus cookies de Instagram a un archivo `cookies.txt` en la raíz del bot y reinicia. El plugin las detecta solo.'
          : ''

      const texto =
        fallo.tipo === 'desconocido'
          ? '❌ No pude descargar el contenido de Instagram.\n\nVerifica que el enlace sea público e inténtalo nuevamente.'
          : fallo.texto

      await sock.sendMessage(chatId, { text: texto + extraCookies })
    }
  }
}
