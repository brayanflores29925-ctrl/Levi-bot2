/**
 * x.js — Descargador de contenido de X / Twitter
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Antes dependía de una API de terceros. Ahora usa yt-dlp local, que
 * soporta enlaces de x.com / twitter.com de forma nativa.
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

export default {
  name: 'x',

  async execute(sock, m, parts) {
    const chatId = m.chat || m.key?.remoteJid
    const url = parts?.join(' ').trim()

    if (!url) {
      return sock.sendMessage(chatId, {
        text: '❌ Envía el enlace público de X/Twitter.\n\nEjemplo: /x https://x.com/...'
      })
    }

    if (!/^https?:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/.+/i.test(url)) {
      return sock.sendMessage(chatId, {
        text: '❌ El enlace no parece ser de X/Twitter.'
      })
    }

    if (!(await estaDisponible('yt-dlp'))) {
      console.error('[X] yt-dlp no está instalado.')
      return sock.sendMessage(chatId, {
        text: mensajeFaltaDependencia('yt-dlp')
      })
    }

    await sock.sendMessage(chatId, {
      text: '⏳ Procesando contenido de X...'
    })

    const tempDir = path.join(process.cwd(), 'temp')
    const baseName = `x-${Date.now()}`
    const outputTemplate = path.join(tempDir, `${baseName}.%(ext)s`)

    await fs.promises.mkdir(tempDir, { recursive: true })

    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [
          '--no-playlist',
          '--no-warnings',
          '--print', 'title',
          '--print', 'filename',
          '-f', 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
          '--merge-output-format', 'mp4',
          '--max-filesize', `${LIMITE_MEDIA_MB}m`,
          '-o', outputTemplate,
          url
        ],
        { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
      )

      const lineas = stdout.split('\n').map(l => l.trim()).filter(Boolean)
      const titulo = lineas[0] || 'X'
      let archivo = lineas[lineas.length - 1]

      if (!archivo || !fs.existsSync(archivo)) {
        const posibles = await fs.promises.readdir(tempDir)
        const candidatos = posibles
          .filter(n => n.startsWith(baseName + '.'))
          .filter(n => /\.(mp4|webm|mkv)$/i.test(n))
          .map(n => path.join(tempDir, n))
        archivo = candidatos[0]
      }

      if (!archivo || !fs.existsSync(archivo)) {
        throw new Error('yt-dlp no produjo el archivo esperado.')
      }

      const stats = await fs.promises.stat(archivo)
      if (!stats.size) throw new Error('El archivo descargado está vacío.')

      await sock.sendMessage(chatId, {
        video: { url: archivo },
        mimetype: 'video/mp4',
        caption: `🐦 ${titulo}`
      })

      await fs.promises.unlink(archivo).catch(() => {})
    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('Error en /x:', fallo.tipo, error?.stderr || error?.message)

      const texto =
        fallo.tipo === 'desconocido'
          ? `❌ Error en /x: ${error?.message || 'fallo desconocido'}`
          : fallo.texto

      await sock.sendMessage(chatId, { text: texto })
    }
  }
}
