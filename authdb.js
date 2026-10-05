import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_PATH = path.join(__dirname, 'authdb.json')

function load() {
  if (!fs.existsSync(AUTH_PATH)) {
    // Antes este archivo nacía con una contraseña fija y débil escrita en el
    // código. Ahora se toma de la variable de entorno LEVI_AUTH_PASSWORD o,
    // en su defecto, se genera una aleatoria que se muestra una sola vez en
    // consola. Nada de eso queda versionado en el repositorio.
    const inicial = {
      password:
        process.env.LEVI_AUTH_PASSWORD ||
        crypto.randomBytes(9).toString('base64url'),
      authorized: []
    }
    fs.writeFileSync(AUTH_PATH, JSON.stringify(inicial, null, 2))
    console.log(
      '[AUTH] authdb.json no existía: se creó con una contraseña nueva. ' +
        'Guárdala; si la pierdes, bórralo y se generará otra al arrancar.'
    )
    return inicial
  }
  return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'))
}

function save(data) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2))
}

export function isAuthorized(sender, ownerNumber) {
  const db = load()
  const number = sender.split('@')[0]
  if (number === ownerNumber) return true
  return db.authorized.includes(number)
}

export function addAuthorized(sender) {
  const db = load()
  const number = sender.split('@')[0].split(':')[0]

  if (!db.authorized.includes(number)) {
    db.authorized.push(number)
    save(db)
  }

  return true
}

export function authorizeUser(sender, password) {
  const db = load()
  const number = sender.split('@')[0]
  if (password !== db.password) return false
  if (!db.authorized.includes(number)) {
    db.authorized.push(number)
    save(db)
  }
  return true
}

export function setPassword(newPassword) {
  const db = load()
  db.password = newPassword
  save(db)
}
