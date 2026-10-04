/**
 * deps.js — Verificación de dependencias externas y diagnóstico de descargas
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Los comandos de descarga (play, play2, facebook, Instagram, tiktok) ejecutan
 * el programa externo `yt-dlp`, y varios efectos de audio usan `ffmpeg`. Ninguno
 * de los dos se instala con `npm install`: son binarios del sistema. Cuando
 * faltan, el proceso hijo muere con ENOENT y el error se perdía dentro de un
 * catch genérico que decía "formato no compatible", ocultando la causa real.
 *
 * Este módulo hace tres cosas:
 *   1. Sondea los binarios una sola vez y guarda el resultado en caché.
 *   2. Al arranque, avisa en la consola lo que falta y cómo instalarlo.
 *   3. Traduce cualquier fallo de descarga a un mensaje útil para el usuario.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'

const execFileAsync = promisify(execFile)

/** Termux se detecta por su PREFIX; ahí los paquetes se instalan con `pkg`. */
export const ES_TERMUX =
  String(process.env.PREFIX || '').includes('com.termux') ||
  os.platform() === 'android'

/** Tope de tamaño para no saturar la RAM del dispositivo al enviar el archivo. */
export const LIMITE_MEDIA_MB = 64

const cache = new Map()

async function sondear(bin, args) {
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 15000 })
    const version = String(stdout || '')
      .split('\n')
      .map(linea => linea.trim())
      .find(Boolean)
    return { ok: true, version: version || 'desconocida' }
  } catch (error) {
    return {
      ok: false,
      code: error?.code || 'ERROR',
      message: error?.message || String(error)
    }
  }
}

/** Estado de un binario. Se consulta una vez por proceso y se cachea. */
export async function estadoDependencia(bin) {
  if (cache.has(bin)) return cache.get(bin)
  const args = bin === 'ffmpeg' ? ['-version'] : ['--version']
  const estado = await sondear(bin, args)
  cache.set(bin, estado)
  return estado
}

export async function estaDisponible(bin) {
  return (await estadoDependencia(bin)).ok
}

/** Comando exacto para instalar el binario según el entorno. */
export function instruccionInstalacion(bin) {
  if (ES_TERMUX) {
    return bin === 'ffmpeg'
      ? 'pkg install ffmpeg -y'
      : 'pkg install python -y && pip install -U yt-dlp'
  }
  return bin === 'ffmpeg'
    ? 'sudo apt update && sudo apt install ffmpeg -y'
    : 'sudo apt update && sudo apt install python3-pip -y && pip3 install -U yt-dlp'
}

export function mensajeFaltaDependencia(bin) {
  const entorno = ES_TERMUX ? 'Termux' : 'Linux'
  return (
    `⚠️ *Falta instalar \`${bin}\`*\n\n` +
    `Los descargadores del bot dependen de ese programa y no está instalado en el servidor.\n\n` +
    `*Instalación (${entorno}):*\n` +
    `\`\`\`${instruccionInstalacion(bin)}\`\`\`\n\n` +
    `Cuando termine, reinicia el bot.`
  )
}

/**
 * Se llama una vez al arranque. Devuelve un resumen para el log.
 * No lanza excepciones: una dependencia ausente no debe tumbar el bot,
 * solo debe quedar visible en la consola.
 */
export async function verificarDependencias(log = console.log) {
  const resumen = {}

  for (const bin of ['yt-dlp', 'ffmpeg']) {
    const estado = await estadoDependencia(bin)
    resumen[bin] = estado

    if (estado.ok) {
      log('OK', `${bin} listo (${estado.version})`)
    } else if (estado.code === 'ENOENT') {
      log(
        'WARN',
        `${bin} NO instalado → los descargadores fallarán. ` +
          `Instalar con: ${instruccionInstalacion(bin)}`
      )
    } else {
      log('WARN', `${bin} presente pero no respondió: ${estado.message}`)
    }
  }

  return resumen
}

/** Reinicia la caché (útil tras instalar los binarios sin reiniciar el bot). */
export function limpiarCacheDependencias() {
  cache.clear()
}

export function tamanoMB(bytes) {
  return (Number(bytes || 0) / 1024 / 1024).toFixed(1)
}

/**
 * Traduce un fallo de descarga a un mensaje accionable.
 * Devuelve { tipo, texto } para que cada plugin decida cómo presentarlo.
 */
export function explicarErrorDescarga(error, bin = 'yt-dlp') {
  const code = error?.code
  const stderr = String(error?.stderr || '')
  const mensaje = String(error?.message || '')
  const todo = `${stderr}\n${mensaje}`.toLowerCase()

  if (code === 'ENOENT' || /spawn\s+\S*\s*enoent/.test(todo)) {
    return { tipo: 'falta-binario', texto: mensajeFaltaDependencia(bin) }
  }

  if (/ffmpeg|ffprobe/.test(todo) && /not found|no such|couldn't|unable|error/i.test(todo)) {
    return { tipo: 'falta-binario', texto: mensajeFaltaDependencia('ffmpeg') }
  }

  if (error?.killed || code === 'ETIMEDOUT' || /timed?\s?out/.test(todo)) {
    return {
      tipo: 'timeout',
      texto:
        '⏱️ *La descarga expiró.*\n\n' +
        'El archivo es muy grande o la conexión va lenta. Prueba con un video más corto.'
    }
  }

  if (/429|too many requests|rate\s?limit/.test(todo)) {
    return {
      tipo: 'rate-limit',
      texto:
        '🚦 *Demasiadas solicitudes.*\n\n' +
        'La plataforma limitó las descargas temporalmente. Espera unos minutos y reintenta.'
    }
  }

  if (
    /sign in to confirm|please sign in|login|log in|cookies|authentication required|http error 401|http error 403/.test(
      todo
    )
  ) {
    return {
      tipo: 'autenticacion',
      texto:
        '🔒 *Ese contenido pide iniciar sesión.*\n\n' +
        'La plataforma bloqueó la descarga anónima. Verifica que el enlace sea público.'
    }
  }

  if (
    /private video|video unavailable|has been removed|no longer available|not available in your country|geographic/.test(
      todo
    )
  ) {
    return {
      tipo: 'no-disponible',
      texto:
        '🚫 *El contenido no está disponible.*\n\n' +
        'Es privado, fue eliminado o tiene bloqueo regional.'
    }
  }

  if (/unsupported url/.test(todo)) {
    return {
      tipo: 'url-invalida',
      texto:
        '🔗 *Enlace no compatible.*\n\n' +
        'Revisa que sea un enlace público de una plataforma soportada.'
    }
  }

  if (/max-filesize|the file is too large/.test(todo)) {
    return {
      tipo: 'tamano',
      texto: `📦 *El archivo supera el límite de ${LIMITE_MEDIA_MB} MB.*\n\nPrueba con un video más corto o de menor calidad.`
    }
  }

  if (/no space left|enospc/.test(todo)) {
    return {
      tipo: 'disco-lleno',
      texto:
        '💾 *No hay espacio de almacenamiento.*\n\n' +
        'Libera espacio en el dispositivo o vacía la carpeta `temp/`.'
    }
  }

  if (/certificate|self.signed|ssl|unable to verify/.test(todo)) {
    return {
      tipo: 'red',
      texto:
        '🌐 *Error de red o certificado.*\n\n' +
        'Revisa la conexión del servidor y la fecha/hora del sistema.'
    }
  }

  return {
    tipo: 'desconocido',
    texto:
      '❌ *No se pudo completar la descarga.*\n\n' +
      `\`${(mensaje || stderr || 'Error desconocido').replace(/`/g, "'").slice(0, 220)}\``
  }
}
