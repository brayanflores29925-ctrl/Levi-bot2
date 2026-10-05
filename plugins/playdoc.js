/**
 * playdoc.js — Audio de YouTube entregado como documento
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Antes dependía de una API de terceros encadenada a un proxy ajeno.
 * Ahora usa el mismo yt-dlp local que el resto de descargadores.
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
  argsPotProvider
} from '../deps.js'
import { resolverExterno } from '../fuente-externa.js'

const execFileAsync = promisify(execFile)

function limpiarNombre(nombre) {
  return nombre.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export default {
  name: 'playdoc',

  async execute(sock, m, parts) {
    const chatId = m.chat || m.key?.remoteJid
    const busqueda = parts?.join(' ').trim()

    if (!busqueda) {
      return sock.sendMessage(chatId, {
        text: '❌ Escribe el nombre de una canción.\n\nEjemplo: /playdoc Feliz Navidad'
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
          text: '❌ No encontré esa canción.'
        })
      }

      // Fuente externa primero: la IP del servidor no dialoga con YouTube.
      let externo = null
      try {
        externo = await resolverExterno(video.url, 'audio')
      } catch (errorExterno) {
        console.error('[PLAYDOC] fuente externa no disponible:', errorExterno?.message)
      }

      if (externo?.urlMedia) {
        return sock.sendMessage(chatId, {
          document: { url: externo.urlMedia },
          mimetype: 'audio/mpeg',
          fileName: `${limpiarNombre(externo.titulo || video.title)}.mp3`
        })
      }

      if (!(await estaDisponible('yt-dlp'))) {
        console.error('[PLAYDOC] yt-dlp no está instalado.')
        return sock.sendMessage(chatId, {
          text: mensajeFaltaDependencia('yt-dlp')
        })
      }

      await sock.sendMessage(chatId, {
        text: `⏳ Preparando documento...\n\n📄 *${video.title}*`
      })

      const tempDir = path.join(process.cwd(), 'temp')
      await fs.promises.mkdir(tempDir, { recursive: true })
      const salida = path.join(tempDir, `playdoc-${Date.now()}.mp3`)

      try {
        await execFileAsync(
          'yt-dlp',
          [
            '--no-playlist',
            '--no-warnings',
            '-f',
            'ba[ext=m4a]/ba/b',
            '-x',
            '--audio-format',
            'mp3',
            '--audio-quality',
            '5',
            '--max-filesize',
            '32m',
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
          document: fs.readFileSync(salida),
          mimetype: 'audio/mpeg',
          fileName: `${limpiarNombre(video.title)}.mp3`
        })
      } finally {
        await fs.promises.unlink(salida).catch(() => {})
      }
    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('Error en /playdoc:', fallo.tipo, error?.stderr || error?.message)

      const texto =
        fallo.tipo === 'desconocido'
          ? `❌ Error en /playdoc: ${error?.message || 'fallo desconocido'}`
          : fallo.texto

      await sock.sendMessage(chatId, { text: texto })
    }
  }
}
