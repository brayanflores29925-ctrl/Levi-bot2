/**
 * play.js — Buscador y descargador de YouTube
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 */

import ytSearch from 'yt-search'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { obtenerNumeroUsuario } from '../config.js'
import { resolverExterno } from '../fuente-externa.js'
import {
  estaDisponible,
  explicarErrorDescarga,
  mensajeFaltaDependencia,
  tamanoMB,
  LIMITE_MEDIA_MB
} from '../deps.js'

const execFileAsync = promisify(execFile)

const TEMP_DIR = path.join(process.cwd(), 'temp')

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

function limpiarNombre(nombre) {
  return nombre
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

// ── Búsquedas pendientes ────────────────────────────────────────────
// Antes se guardaban solo por chatId. En un grupo, la búsqueda de un
// usuario sobrescribía la del anterior y el primero recibía la canción
// equivocada. Ahora la clave incluye al remitente y caduca a los 10
// minutos, para que un reinicio o un olvido no dejen basura en memoria.
const pendientes = new Map()
const TTL_MS = 10 * 60 * 1000
const LIMITE_PENDIENTES = 300

function clavePendiente(m) {
  const chatId = m?.chat || m?.key?.remoteJid || 'desconocido'
  const numero = obtenerNumeroUsuario(m) || 'anonimo'
  return `${chatId}|${numero}`
}

function limpiarExpirados() {
  const ahora = Date.now()
  for (const [clave, dato] of pendientes) {
    if (ahora > dato.expira) pendientes.delete(clave)
  }
}

function guardarPendiente(m, datos) {
  limpiarExpirados()
  if (pendientes.size >= LIMITE_PENDIENTES) {
    pendientes.delete(pendientes.keys().next().value)
  }
  pendientes.set(clavePendiente(m), { ...datos, expira: Date.now() + TTL_MS })
}

function obtenerPendiente(m) {
  const clave = clavePendiente(m)
  const dato = pendientes.get(clave)
  if (!dato) return null
  if (Date.now() > dato.expira) {
    pendientes.delete(clave)
    return null
  }
  return dato
}

function borrarPendiente(m) {
  pendientes.delete(clavePendiente(m))
}

async function descargar(args, opciones = {}) {
  const { timeout = 300000 } = opciones

  try {
    const resultado = await execFileAsync('yt-dlp', args, {
      timeout,
      maxBuffer: 25 * 1024 * 1024
    })
    return resultado
  } catch (error) {
    console.error('[PLAY] yt-dlp ERROR:', error?.stderr || error?.message)
    throw error
  }
}

/**
 * Formato con tope de 720p. Sin límite, yt-dlp puede traer 4K y el
 * archivo completo se leía a RAM con readFileSync, lo que en un celular
 * tumba el proceso por falta de memoria.
 */
const FORMATO_VIDEO =
  'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720][ext=mp4]/bv*+ba/b'
const FORMATO_AUDIO = 'ba[ext=m4a]/ba/b'

export default {
  name: 'play',
  aliases: ['yt', 'song', 'descargar', 'video'],

  async execute(sock, m, parts, enviar) {
    const chatId = m.key?.remoteJid
    const busqueda = parts.join(' ').trim()

    if (!busqueda) {
      return enviar(
        '⚠️ *PLAY - DESCARGADOR*\n\n' +
          'Escribe el nombre de una canción o vídeo.\n\n' +
          '📌 *Ejemplo:* .play Feliz Navidad'
      )
    }

    try {
      await enviar(`🔎 Buscando: *${busqueda}*...`)

      const resultado = await ytSearch(busqueda)
      const video = resultado.videos?.[0]

      if (!video) {
        return enviar('❌ No se encontraron resultados.')
      }

      guardarPendiente(m, {
        url: video.url,
        title: video.title
      })

      const titulo = video.title
      const canal = video.author?.name || 'Desconocido'
      const duracion = video.timestamp || 'N/A'
      const vistas = video.views ? Number(video.views).toLocaleString() : 'N/A'

      const mensajePortada =
        '╭━━━━━━━━━━━━━━━━━━━━╮\n' +
        '┃     🎵 YOUTUBE PLAY     ┃\n' +
        '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
        `📌 *Título:* ${titulo}\n` +
        `👤 *Canal:* ${canal}\n` +
        `⏱️ *Duración:* ${duracion}\n` +
        `👁️ *Vistas:* ${vistas}\n\n` +
        '👇 *Elige el formato de descarga:*\n\n' +
        '🎬 *.1* → Descargar Vídeo MP4\n' +
        '🎧 *.2* → Descargar Audio MP3\n\n' +
        '⏳ La elección caduca en 10 minutos.'

      try {
        const miniatura = video.thumbnail

        if (miniatura) {
          await sock.sendMessage(
            chatId,
            { image: { url: miniatura }, caption: mensajePortada },
            { quoted: m }
          )
        } else {
          await sock.sendMessage(chatId, { text: mensajePortada }, { quoted: m })
        }
        return
      } catch (errorMenu) {
        console.error('[PLAY] Error enviando menú:', errorMenu)
        return enviar(mensajePortada)
      }
    } catch (error) {
      console.error('[LEVI] ERROR /play:', error)
      return enviar('❌ No se pudo realizar la búsqueda.')
    }
  },

  async seleccionar(sock, m, opcion) {
    const chatId = m.key?.remoteJid
    const opcionFinal = String(opcion).trim()
    const pendiente = obtenerPendiente(m)

    if (!pendiente) {
      return sock.sendMessage(
        chatId,
        {
          text:
            '❌ *NO HAY UNA BÚSQUEDA PENDIENTE*\n\n' +
            'Primero utiliza *.play <nombre de la canción>*.\n\n' +
            'Las búsquedas caducan a los 10 minutos y se pierden si el bot se reinicia.'
        },
        { quoted: m }
      )
    }

    let esVideo = false
    let esAudio = false

    if (opcionFinal === '.1' || opcionFinal === '1' || opcionFinal.includes('1.')) {
      esVideo = true
    } else if (opcionFinal === '.2' || opcionFinal === '2' || opcionFinal.includes('2.')) {
      esAudio = true
    } else {
      return sock.sendMessage(
        chatId,
        { text: '⚠️ *Opción incorrecta*\n\n🎬 *.1* → Vídeo\n🎧 *.2* → Audio' },
        { quoted: m }
      )
    }

    borrarPendiente(m)

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const output = path.join(TEMP_DIR, `play-${id}.${esVideo ? 'mp4' : 'mp3'}`)

    try {
      await sock.sendMessage(
        chatId,
        {
          text: esVideo
            ? '⏳ *Descargando vídeo...* 🎬'
            : '⏳ *Descargando audio...* 🎧'
        },
        { quoted: m }
      )

      // 1) Fuente externa primero: así la IP del servidor no dialoga con
      //    YouTube y no termina bloqueada ni pidiendo "inicia sesión".
      //    Si ninguna fuente externa responde, se cae a yt-dlp local.
      let externo = null
      try {
        externo = await resolverExterno(pendiente.url, esVideo ? 'video' : 'audio')
      } catch (errorExterno) {
        console.error('[PLAY] fuente externa no disponible:', errorExterno?.message)
      }

      if (externo?.urlMedia) {
        const tituloLimpio = limpiarNombre(externo.titulo || pendiente.title)

        if (esVideo) {
          await sock.sendMessage(
            chatId,
            {
              video: { url: externo.urlMedia },
              mimetype: 'video/mp4',
              caption: `📹 *${externo.titulo || pendiente.title}*`
            },
            { quoted: m }
          )
        } else {
          await sock.sendMessage(
            chatId,
            {
              audio: { url: externo.urlMedia },
              mimetype: 'audio/mpeg',
              fileName: `${tituloLimpio}.mp3`,
              ptt: false
            },
            { quoted: m }
          )
        }

        console.log(`[LEVI] PLAY enviado vía ${externo.origen}`)
        return
      }

      // 2) Respaldo local. Sin yt-dlp la descarga no puede empezar, y antes
      //    ese fallo salía disfrazado de "formato no compatible".
      if (!(await estaDisponible('yt-dlp'))) {
        console.error('[PLAY] externa falló y yt-dlp no está instalado.')
        return sock.sendMessage(
          chatId,
          { text: mensajeFaltaDependencia('yt-dlp') },
          { quoted: m }
        )
      }

      const argsBase = [
        '--no-playlist',
        '--force-overwrites',
        '--no-warnings',
        '--max-filesize',
        `${esVideo ? LIMITE_MEDIA_MB : 32}m`
      ]

      if (esVideo) {
        await descargar(
          [
            ...argsBase,
            '-f',
            FORMATO_VIDEO,
            '--merge-output-format',
            'mp4',
            '-o',
            output,
            pendiente.url
          ],
          { timeout: 300000 }
        )
      } else {
        await descargar(
          [
            ...argsBase,
            '-f',
            FORMATO_AUDIO,
            '-x',
            '--audio-format',
            'mp3',
            '--audio-quality',
            '5',
            '-o',
            output,
            pendiente.url
          ],
          { timeout: 300000 }
        )
      }

      if (!fs.existsSync(output)) {
        throw new Error('yt-dlp terminó pero no generó el archivo final.')
      }

      const stats = fs.statSync(output)

      if (!stats.size) {
        throw new Error('El archivo descargado está vacío.')
      }

      const tituloLimpio = limpiarNombre(pendiente.title)

      // Por encima del límite se manda como documento: WhatsApp lo entrega
      // completo y evitamos que la vista previa de video sature el envío.
      if (stats.size > LIMITE_MEDIA_MB * 1024 * 1024) {
        await sock.sendMessage(
          chatId,
          {
            document: fs.readFileSync(output),
            mimetype: esVideo ? 'video/mp4' : 'audio/mpeg',
            fileName: `${tituloLimpio}.${esVideo ? 'mp4' : 'mp3'}`,
            caption: `📦 *${pendiente.title}*\n\n${tamanoMB(stats.size)} MB`
          },
          { quoted: m }
        )
      } else if (esVideo) {
        await sock.sendMessage(
          chatId,
          {
            video: fs.readFileSync(output),
            mimetype: 'video/mp4',
            caption: `📹 *${pendiente.title}*`
          },
          { quoted: m }
        )
      } else {
        await sock.sendMessage(
          chatId,
          {
            audio: fs.readFileSync(output),
            mimetype: 'audio/mpeg',
            fileName: `${tituloLimpio}.mp3`,
            ptt: false
          },
          { quoted: m }
        )
      }

      console.log(
        `[LEVI] PLAY enviado correctamente (${esVideo ? 'Video' : 'Audio'})`
      )
    } catch (error) {
      const fallo = explicarErrorDescarga(error)
      console.error('[LEVI] ERROR selección PLAY:', fallo.tipo, error?.stderr || error?.message)

      await sock.sendMessage(chatId, { text: fallo.texto }, { quoted: m })
    } finally {
      try {
        if (fs.existsSync(output)) fs.unlinkSync(output)
      } catch (errorLimpieza) {
        console.error('[PLAY] No se pudo eliminar temporal:', errorLimpieza.message)
      }
    }
  },

  register(sock) {
    sock.playSelection = (m, opcion) => {
      return this.seleccionar(sock, m, String(opcion).trim())
    }
  }
}
