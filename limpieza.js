/**
 * limpieza.js — Limpieza segura de temporales al arrancar
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Adaptado de core/lib/cacheMgmt.js de Lab2experimental (MIT),
 * Copyright (c) 2024 - 2026 ⁱᵃᵐ|𝔇ĕ𝐬†𝓻⊙γ — se conserva el aviso de licencia:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED. See the MIT License para el texto completo.
 *
 * La idea tomada de Lab2 es la misma: recorrer el directorio de forma segura
 * (sin tumbar el bot si un archivo está en uso) y borrar solo lo que ya
 * expiró. Aquí se limita a la carpeta temp/, que es donde los descargadores
 * dejan residuos cuando una descarga falla a medias.
 */

import fs from 'fs'
import path from 'path'

const TEMP_DIR = path.join(process.cwd(), 'temp')
const EDAD_MAX_MS = 24 * 60 * 60 * 1000 // 24 horas

/** Formatea bytes a algo legible (KB/MB/GB). Tomado de cacheMgmt.js. */
export function formatBytes(bytes = 0) {
  if (!bytes || Number.isNaN(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Number(bytes)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/**
 * Borra archivos de temp/ más viejos que EDAD_MAX_MS.
 * Nunca lanza: un fallo de limpieza no debe impedir el arranque.
 * Devuelve { borrados, liberado } para el log.
 */
export function limpiarTemporales(log = console.log) {
  const resultado = { borrados: 0, liberado: 0 }

  try {
    if (!fs.existsSync(TEMP_DIR)) return resultado

    const ahora = Date.now()

    for (const nombre of fs.readdirSync(TEMP_DIR)) {
      const ruta = path.join(TEMP_DIR, nombre)
      try {
        const stats = fs.statSync(ruta)
        if (!stats.isFile()) continue
        if (ahora - stats.mtimeMs < EDAD_MAX_MS) continue

        fs.unlinkSync(ruta)
        resultado.borrados++
        resultado.liberado += stats.size
      } catch {
        // Archivo en uso o permiso denegado: se ignora y sigue.
      }
    }

    if (resultado.borrados) {
      log(
        'INFO',
        `Limpieza de temp/: ${resultado.borrados} archivo(s), ` +
          `${formatBytes(resultado.liberado)} liberados.`
      )
    }
  } catch (error) {
    log('WARN', `No se pudo limpiar temp/: ${error.message}`)
  }

  return resultado
}
