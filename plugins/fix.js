import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

function ejecutar(comando, cwd = process.cwd(), timeout = 30000) {
  return new Promise(resolve => {
    exec(comando, {
      cwd,
      timeout,
      maxBuffer: 2 * 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        salida: (stdout || stderr || '').trim()
      })
    })
  })
}

async function actualizarBot(nombre, carpeta) {
  const resultado = {
    nombre,
    cambios: false,
    ok: false,
    mensaje: ''
  }

  const repo = await ejecutar('git remote get-url origin', carpeta)
  if (!repo.ok) {
    resultado.mensaje = 'No se pudo comprobar el repositorio.'
    return resultado
  }

  const antes = await ejecutar('git rev-parse HEAD', carpeta)
  if (!antes.ok) {
    resultado.mensaje = 'No se pudo obtener el commit actual.'
    return resultado
  }

  const fetch = await ejecutar('git fetch origin', carpeta, 60000)
  if (!fetch.ok) {
    resultado.mensaje = `Error al consultar GitHub: ${fetch.salida || 'sin detalles'}`
    return resultado
  }

  const estado = await ejecutar(
    'git status --short',
    carpeta
  )

  if (!estado.ok) {
    resultado.mensaje = 'No se pudo comprobar el estado local.'
    return resultado
  }

  const cambiosLocales = estado.salida
    .split('\n')
    .filter(Boolean)
    .filter(linea => !linea.includes('plugins/fix.js.bak'))
    .filter(linea => !linea.includes('.env.save'))
    .filter(linea => !linea.endsWith('.bak'))

  if (cambiosLocales.length > 0) {
    resultado.mensaje =
      'Hay cambios locales. No se hizo pull para evitar sobrescribir archivos.'
    return resultado
  }

  const rama = await ejecutar(
    'git branch --show-current',
    carpeta
  )

  const nombreRama = rama.salida || 'main'

  const remoto = await ejecutar(
    `git rev-parse origin/${nombreRama}`,
    carpeta
  )

  if (!remoto.ok) {
    resultado.mensaje = 'No se pudo comprobar la versión de GitHub.'
    return resultado
  }

  if (antes.salida === remoto.salida) {
    resultado.ok = true
    resultado.mensaje = 'Ya está actualizado.'
    return resultado
  }

  const pull = await ejecutar(
    `git pull --ff-only origin ${nombreRama}`,
    carpeta,
    120000
  )

  if (!pull.ok) {
    resultado.mensaje =
      `No se pudo actualizar: ${pull.salida || 'error desconocido'}`
    return resultado
  }

  resultado.ok = true
  resultado.cambios = true
  resultado.mensaje =
    `Actualizado correctamente.\nAntes: ${antes.salida.slice(0, 7)}\nAhora: ${remoto.salida.slice(0, 7)}`

  return resultado
}

function contarPlugins(carpeta) {
  const pluginsDir = path.join(carpeta, 'plugins')

  if (!fs.existsSync(pluginsDir)) return 0

  return fs
    .readdirSync(pluginsDir)
    .filter(nombre => nombre.endsWith('.js'))
    .length
}

export default {
  name: 'fix',

  async execute(sock, m, args, enviar) {
    const carpetaPrincipal = process.cwd()
    const carpetaSecundaria = path.join(
      path.dirname(carpetaPrincipal),
      'Levi-bot2'
    )

    try {
      const senderActual =
        m.sender ||
        m.key?.participant ||
        m.participant ||
        m.key?.remoteJid ||
        ''

      const numeroDetectado = String(senderActual)
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '')

      const resultados = []

      resultados.push(`🔎 Identificador: ${senderActual}`)
      resultados.push(`🔢 Número: ${numeroDetectado}`)

      resultados.push('')
      resultados.push('📡 *COMPROBANDO ACTUALIZACIONES...*')

      const principal = await actualizarBot(
        'Levi-bot',
        carpetaPrincipal
      )

      resultados.push(
        `\n🛠️ *Levi-bot*\n${principal.mensaje}`
      )

      if (fs.existsSync(carpetaSecundaria)) {
        const secundario = await actualizarBot(
          'Levi-bot2',
          carpetaSecundaria
        )

        resultados.push(
          `\n🛠️ *Levi-bot2*\n${secundario.mensaje}`
        )
      } else {
        resultados.push(
          '\n⚠️ *Levi-bot2*\nCarpeta no encontrada.'
        )
      }

      const index = await ejecutar('node --check index.js')
      resultados.push(
        index.ok
          ? '\n✅ index.js: sintaxis correcta'
          : `\n❌ index.js: ${index.salida || 'error de sintaxis'}`
      )

      const fixCheck = await ejecutar('node --check plugins/fix.js')
      resultados.push(
        fixCheck.ok
          ? '✅ fix.js: sintaxis correcta'
          : `❌ fix.js: ${fixCheck.salida || 'error de sintaxis'}`
      )

      resultados.push(
        `📦 Plugins Levi-bot: ${contarPlugins(carpetaPrincipal)}`
      )

      resultados.push(
        '\n🔐 session/: protegida\n' +
        '🔐 .env: protegido\n' +
        '🔐 No se eliminan archivos locales'
      )

      resultados.push(
        '\n━━━━━━━━━━━━━━━━━━━━\n' +
        '💡 /fix comprueba y actualiza desde GitHub.'
      )

      return await enviar(
        `🛡️ *LEVI BOTS ✓ VERIFICADO*\n\n` +
        `🛠️ *LEVI-BOT FIX*\n\n` +
        resultados.join('\n')
      )

    } catch (error) {
      return await enviar(
        `🛠️ *LEVI-BOT FIX*\n\n` +
        `❌ Error durante la actualización:\n\n` +
        `${error?.message || 'Error desconocido'}`
      )
    }
  }
}
