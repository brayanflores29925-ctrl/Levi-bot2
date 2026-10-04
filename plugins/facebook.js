/**
 * facebook.js — Descargador de videos de Facebook
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

export default {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl'],

  async execute(sock, m, parts) {
    const chatId = m.chat || m.key?.remoteJid
    const inputUrl = parts?.join(' ').trim()

    if (!inputUrl) {
      return sock.sendMessage(chatId, {
        text:
          '*DESCARGADOR DE FACEBOOK*\n\n' +
          'Proporciona un enlace de Facebook.\n\n' +
          '*Uso:* /facebook <url>\n' +
          '*Ejemplo:* /facebook https://www.facebook.com/share/v/...'
      }, { quoted: m })
    }

    const fbRegex = /^(https?:\/\/)?(www\.|web\.|m\.)?(facebook\.com|fb\.watch)\/.+/i

    if (!fbRegex.test(inputUrl)) {
      return sock.sendMessage(chatId, {
        text: '❌ El enlace proporcionado no es una URL válida de Facebook.'
      }, { quoted: m })
    }

    const tempDir = path.join(process.cwd(), 'temp')
    const outputTemplate = path.join(tempDir, `facebook-${Date.now()}.%(ext)s`)

    await fs.promises.mkdir(tempDir, { recursive: true })

    if (!(await estaDisponible('yt-dlp'))) {
      console.error('[FACEBOOK] yt-dlp no está instalado.')
      return sock.sendMessage(chatId, {
        text: mensajeFaltaDependencia('yt-dlp')
      }, { quoted: m })
    }

    await sock.sendMessage(chatId, {
      text: '⏳ Procesando el video de Facebook...'
    }, { quoted: m })

    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [
          '--no-playlist',
          '--print',
          'title',
          '--print',
          'filename',
          '-f',
          'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
          '--merge-output-format',
          'mp4',
          '--max-filesize',
          `${LIMITE_MEDIA_MB}m`,
          '-o',
          outputTemplate,
          inputUrl
        ],
        {
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024
        }
      )

      const lines = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)

      let titulo = lines[0] || 'Video de Facebook'
      let archivo = lines[lines.length - 1]

      if (!archivo || !fs.existsSync(archivo)) {
        const posibles = await fs.promises.readdir(tempDir)
        const candidatos = posibles
          .filter(nombre => nombre.startsWith(path.basename(outputTemplate).split('.%(ext)s')[0]))
          .filter(nombre => nombre.endsWith('.mp4'))
          .map(nombre => path.join(tempDir, nombre))

        archivo = candidatos[0]
      }

      if (!archivo || !fs.existsSync(archivo)) {
        throw new Error('yt-dlp no produjo el archivo MP4 esperado.')
      }

      const stats = await fs.promises.stat(archivo)

      if (stats.size === 0) {
        throw new Error('El archivo descargado está vacío.')
      }

      await sock.sendMessage(chatId, {
        video: { url: archivo },
        mimetype: 'video/mp4',
        caption:
          `*FACEBOOK DOWNLOADER*\n\n` +
          `*Título:* ${titulo}\n` +
          `*Origen:* Facebook`
      }, { quoted: m })

      await fs.promises.unlink(archivo).catch(() => {})

    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('[FACEBOOK PLUGIN ERROR]:', fallo.tipo, error?.stderr || error?.message || error)

      // Los tipos ya diagnosticados por deps.js llegan listos para el usuario.
      // Solo el caso sin clasificar conserva el contexto de Facebook.
      const texto =
        fallo.tipo === 'desconocido'
          ? `❌ *No se pudo descargar el video de Facebook.*\n\n${fallo.texto}`
          : fallo.texto

      await sock.sendMessage(chatId, { text: texto }, { quoted: m })
    }
  }
}
