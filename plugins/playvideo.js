/**
 * playvideo.js — Descarga de video de YouTube por nombre
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Antes dependía de una API de terceros encadenada a un proxy ajeno.
 * Ahora usa el mismo yt-dlp local que el resto de descargadores, con
 * los mensajes de error honestos de deps.js.
 */

import ytSearch from 'yt-search'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import {
  estaDisponible,
  explicarErrorDescarga,
  mensajeFaltaDependencia,
  argsPotProvider,
  LIMITE_MEDIA_MB
} from '../deps.js'
import { resolverExterno } from '../fuente-externa.js'

const execFileAsync = promisify(execFile)

export default {
  name: 'playvideo',

  async execute(sock, m, parts) {
    const chatId = m.chat || m.key?.remoteJid
    const busqueda = parts?.join(' ').trim()

    if (!busqueda) {
      return sock.sendMessage(chatId, {
        text: '❌ Escribe el nombre de un video.\n\nEjemplo: /playvideo Feliz Navidad'
      })
    }

    await sock.sendMessage(chatId, {
      text: `🔎 Buscando *${busqueda}*...`
    })

    try {
      const resultado = await ytSearch(busqueda)
      const video = resultado.videos?.[0]

      if (!video) {
        return sock.sendMessage(chatId, {
          text: '❌ No encontré ese video.'
        })
      }

      // Fuente externa primero: la IP del servidor no dialoga con YouTube.
      let externo = null
      try {
        externo = await resolverExterno(video.url, 'video')
      } catch (errorExterno) {
        console.error('[PLAYVIDEO] fuente externa no disponible:', errorExterno?.message)
      }

      if (externo?.urlMedia) {
        return sock.sendMessage(chatId, {
          video: { url: externo.urlMedia },
          mimetype: 'video/mp4',
          caption: `🎬 ${externo.titulo || video.title}`
        })
      }

      if (!(await estaDisponible('yt-dlp'))) {
        console.error('[PLAYVIDEO] yt-dlp no está instalado.')
        return sock.sendMessage(chatId, {
          text: mensajeFaltaDependencia('yt-dlp')
        })
      }

      await sock.sendMessage(chatId, {
        text: `⏳ Descargando video...\n\n🎬 *${video.title}*`
      })

      const tempDir = path.join(process.cwd(), 'temp')
      await fs.promises.mkdir(tempDir, { recursive: true })
      const salida = path.join(tempDir, `playvideo-${Date.now()}.mp4`)

      try {
        await execFileAsync(
          'yt-dlp',
          [
            '--no-playlist',
            '--no-warnings',
            '-f',
            'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720][ext=mp4]/bv*+ba/b',
            '--merge-output-format',
            'mp4',
            '--max-filesize',
            `${LIMITE_MEDIA_MB}m`,
            ...argsPotProvider(),
            '-o',
            salida,
            video.url
          ],
          { timeout: 300000, maxBuffer: 25 * 1024 * 1024 }
        )

        if (!fs.existsSync(salida)) {
          throw new Error('yt-dlp terminó pero no generó el archivo.')
        }

        await sock.sendMessage(chatId, {
          video: { url: salida },
          mimetype: 'video/mp4',
          caption: `🎬 ${video.title}`
        })
      } finally {
        await fs.promises.unlink(salida).catch(() => {})
      }
    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('Error en /playvideo:', fallo.tipo, error?.stderr || error?.message)

      const texto =
        fallo.tipo === 'desconocido'
          ? `❌ Error en /playvideo: ${error?.message || 'fallo desconocido'}`
          : fallo.texto

      await sock.sendMessage(chatId, { text: texto })
    }
  }
}
