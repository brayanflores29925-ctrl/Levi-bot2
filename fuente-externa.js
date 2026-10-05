/**
 * fuente-externa.js — Descarga de YouTube vía un servicio de terceros
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Por qué existe: cuando el bot corre en un servidor con IP fija, extraer
 * directo desde YouTube termina con esa IP bloqueada o pidiendo "inicia
 * sesión". Delegar la extracción en un servicio externo evita que el
 * servidor del bot dialogue con YouTube.
 *
 * Orden de intento:
 *   1. Una instancia de Cobalt propia, si se configura COBALT_URL
 *      (es la opción seria a largo plazo; las públicas están bloqueadas
 *      para YouTube desde 2026).
 *   2. La API alldl, que es la que el bot ya venía usando y que a día de
 *      hoy sirve bytes reales (comprobado: HTTP 206, video/mp4).
 *
 * Si ambas fallan, el llamador cae de vuelta al yt-dlp local de deps.js.
 * Nada de esto lanza sin que el llamador lo pueda capturar.
 */

import axios from 'axios'

const ALLDL_API = 'https://ahm7xmakki.com/api/alldl'
const TIMEOUT_MS = 30000

async function viaCobalt(url, modo) {
  const base = String(process.env.COBALT_URL || '').replace(/\/+$/, '')
  if (!base) throw new Error('COBALT_URL no configurado')

  const cuerpo = {
    url,
    downloadMode: modo === 'audio' ? 'audio' : 'auto',
    audioFormat: 'mp3',
    videoQuality: '720'
  }

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (process.env.COBALT_KEY) headers.Authorization = `Bearer ${process.env.COBALT_KEY}`

  const r = await axios.post(base, cuerpo, { headers, timeout: TIMEOUT_MS })
  const d = r.data || {}

  if (d.status === 'tunnel' || d.status === 'redirect') {
    return { titulo: d.filename || '', urlMedia: d.url, origen: 'cobalt' }
  }
  if (d.status === 'picker' && Array.isArray(d.picker) && d.picker[0]?.url) {
    return { titulo: '', urlMedia: d.picker[0].url, origen: 'cobalt' }
  }
  throw new Error(d.error?.code || 'cobalt: respuesta no util')
}

async function viaAlldl(url, modo) {
  const r = await axios.get(ALLDL_API, { params: { url }, timeout: TIMEOUT_MS })
  const d = r.data || {}
  const info = d.mediaInfo || {}

  const urlMedia = modo === 'audio' ? info.audioUrl : info.videoUrl
  if (!d.success || !urlMedia) {
    throw new Error('alldl: sin enlace de medio')
  }
  return { titulo: info.title || '', urlMedia, origen: 'alldl' }
}

/**
 * Resuelve un enlace de YouTube a un URL de medio directo.
 * modo: 'video' | 'audio'
 * Devuelve { titulo, urlMedia, origen } o lanza si ninguna fuente responde.
 */
export async function resolverExterno(url, modo = 'video') {
  const intentos = [viaCobalt, viaAlldl]
  let ultimoError = null

  for (const fn of intentos) {
    try {
      const resultado = await fn(url, modo)
      if (resultado?.urlMedia) return resultado
    } catch (error) {
      ultimoError = error
    }
  }

  throw ultimoError || new Error('sin fuentes externas disponibles')
}
