/**
 * tiktok.js — Descargador de videos de TikTok
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
  name: 'tiktok',

  async execute(sock, m, parts) {
    const chatId = m.chat || m.key?.remoteJid
    const url = parts?.join(' ').trim()

    if (!url) {
      return sock.sendMessage(chatId, {
        text: '❌ Envía el enlace público de TikTok.\n\nEjemplo: /tiktok https://www.tiktok.com/...'
      }, { quoted: m })
    }

    const tikTokRegex = /^(https?:\/\/)?((www|vm|vt)\.)?tiktok\.com\/.+/i

    if (!tikTokRegex.test(url)) {
      return sock.sendMessage(chatId, {
        text: '❌ El enlace proporcionado no parece ser un enlace válido de TikTok.'
      }, { quoted: m })
    }

    if (!(await estaDisponible('yt-dlp'))) {
      console.error('[TIKTOK] yt-dlp no está instalado.')
      return sock.sendMessage(chatId, {
        text: mensajeFaltaDependencia('yt-dlp')
      }, { quoted: m })
    }

    await sock.sendMessage(chatId, {
      text: '⏳ Procesando TikTok...'
    }, { quoted: m })

    const tempDir = path.join(process.cwd(), 'temp')
    const baseName = `tiktok-${Date.now()}`
    const outputTemplate = path.join(tempDir, `${baseName}.%(ext)s`)

    await fs.promises.mkdir(tempDir, { recursive: true })

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
          'best[ext=mp4]/best',
          '--max-filesize',
          `${LIMITE_MEDIA_MB}m`,
          '-o',
          outputTemplate,
          url
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

      const titulo = lines[0] || 'TikTok'
      let archivo = lines[lines.length - 1]

      if (!archivo || !fs.existsSync(archivo)) {
        const posibles = await fs.promises.readdir(tempDir)

        const candidatos = posibles
          .filter(nombre => nombre.startsWith(baseName + '.'))
          .filter(nombre => /\.(mp4|webm|mkv)$/i.test(nombre))
          .map(nombre => path.join(tempDir, nombre))

        archivo = candidatos[0]
      }

      if (!archivo || !fs.existsSync(archivo)) {
        throw new Error('yt-dlp no produjo el archivo de video esperado.')
      }

      const stats = await fs.promises.stat(archivo)

      if (stats.size === 0) {
        throw new Error('El archivo descargado está vacío.')
      }

      await sock.sendMessage(chatId, {
        video: { url: archivo },
        mimetype: 'video/mp4',
        caption: `📱 ${titulo}`
      }, { quoted: m })

      await fs.promises.unlink(archivo).catch(() => {})

    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('[TIKTOK PLUGIN ERROR]:', fallo.tipo, error?.stderr || error?.message || error)

      // Los tipos ya diagnosticados por deps.js llegan listos para el usuario.
      // Solo el caso sin clasificar conserva el contexto de TikTok.
      const texto =
        fallo.tipo === 'desconocido'
          ? `❌ *No se pudo descargar el video de TikTok.*\n\n${fallo.texto}`
          : fallo.texto

      await sock.sendMessage(chatId, { text: texto }, { quoted: m })
    }
  }
}
