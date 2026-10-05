/**
 * listar-comandos.mjs — Inventario estático de comandos del bot
 * Levi-Bot · Autor: riokuroxi-svg — github.com/riokuroxi-svg
 *
 * Recorre plugins/*.js SIN ejecutarlos y extrae los nombres y alias
 * declarados, replicando las exclusiones que hace index.js al cargar.
 * Sirve para comprobar que una limpieza o migración no se llevó ningún
 * comando por delante: se corre antes y después y se comparan salidas.
 *
 * Uso: node scripts/listar-comandos.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PLUGINS = path.join(raiz, 'plugins')

// Mismo criterio que loadPlugins() en index.js
const EXCLUIDOS = new Set([
  'subbotcore.js',
  'subbotconexion.js',
  'subbotmanager.js',
  'horarioauto.js'
])

function extraer(texto) {
  const nombres = []

  const nombreLista = texto.match(/name:\s*\[([^\]]*)\]/)
  const nombreSimple = texto.match(/name:\s*['"]([^'"]+)['"]/)

  if (nombreLista) {
    for (const pieza of nombreLista[1].matchAll(/['"]([^'"]+)['"]/g)) {
      nombres.push(pieza[1])
    }
  } else if (nombreSimple) {
    nombres.push(nombreSimple[1])
  }

  const aliasLista = texto.match(/aliases:\s*\[([^\]]*)\]/)
  const alias = []
  if (aliasLista) {
    for (const pieza of aliasLista[1].matchAll(/['"]([^'"]+)['"]/g)) {
      alias.push(pieza[1])
    }
  }

  return { nombres, alias }
}

const archivos = fs
  .readdirSync(PLUGINS)
  .filter(f => f.endsWith('.js'))
  .filter(f => !EXCLUIDOS.has(f))
  .sort()

const registro = new Map()
let totalPlugins = 0
let sinNombre = []

for (const archivo of archivos) {
  const texto = fs.readFileSync(path.join(PLUGINS, archivo), 'utf8')
  const { nombres, alias } = extraer(texto)

  if (!nombres.length) {
    sinNombre.push(archivo)
    continue
  }

  totalPlugins++
  for (const n of [...nombres, ...alias]) {
    const clave = n.toLowerCase()
    if (!registro.has(clave)) registro.set(clave, archivo)
  }
}

console.log(`Plugins con comando: ${totalPlugins}`)
console.log(`Nombres + alias registrados: ${registro.size}`)
if (sinNombre.length) {
  console.log(`Archivos sin nombre detectable: ${sinNombre.join(', ')}`)
}
console.log('---')
for (const [nombre, archivo] of [...registro.entries()].sort()) {
  console.log(`${nombre}\t${archivo}`)
}
