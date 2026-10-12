import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { config } from '../server/config'

const fail = (message: string): never => { throw new Error(message) }

if (config.environment === 'production' || config.storageBackend !== 'json') {
  fail('Este comando solo funciona en desarrollo local con almacenamiento JSON.')
}
if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
  fail('El API debe estar enlazado a localhost para crear cuentas QA.')
}

const apiBase = `http://127.0.0.1:${config.port}`
const suffix = randomBytes(4).toString('hex')
const creatorEmail = `qa-creator-${suffix}@beatvault.local`
const adminEmail = `qa-admin-${suffix}@beatvault.local`
const creatorPassword = randomBytes(24).toString('base64url')
const adminPassword = randomBytes(24).toString('base64url')

type ApiInit = { method?: string; headers?: Record<string, string>; body?: string }

async function api(path: string, init?: ApiInit, expectedStatus?: number) {
  const response = await fetch(`${apiBase}${path}`, init as RequestInit)
  const payload: unknown = await response.json().catch(() => undefined)
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    fail(`${path}: se esperaba HTTP ${expectedStatus} y se recibió HTTP ${response.status}.`)
  }
  if (expectedStatus === undefined && !response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && payload.error && typeof payload.error === 'object' && 'message' in payload.error
      ? String(payload.error.message)
      : `HTTP ${response.status}`
    fail(`${path}: ${message}`)
  }
  return { response, payload }
}

async function login(email: string, password: string) {
  const { response, payload } = await api('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : undefined
  if (!data || typeof data !== 'object' || !('id' in data)) fail(`No se pudo iniciar sesión para ${email}.`)
  const cookies = response.headers.getSetCookie().map(value => value.split(';', 1)[0])
  const csrf = cookies.find(value => value.startsWith('beatvault_csrf='))?.slice('beatvault_csrf='.length)
  if (!csrf || !cookies.some(value => value.startsWith('beatvault_session='))) fail('El API no entregó las cookies locales de sesión/CSRF.')
  return { cookie: cookies.join('; '), csrf: csrf as string }
}

async function saveProfile(email: string, password: string, displayName: string, isPublic: boolean) {
  const session = await login(email, password)
  await api('/api/profile', {
    method: 'PUT',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ displayName, bio: 'Cuenta local de pruebas BeatVault.', location: '', website: '', instagram: '', genres: ['Trap'], coverId: 'lo-fi', avatarId: 'initials', publicProfile: isPublic }),
  })
  return session
}

async function main() {
  await api('/api/health')

  const cli = resolve('node_modules/tsx/dist/cli.mjs')
  const bootstrap = spawnSync(process.execPath, [cli, 'server/admin-bootstrap.ts'], {
    cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      BEATVAULT_HOST: '127.0.0.1',
      BEATVAULT_STORAGE_BACKEND: 'json',
      BEATVAULT_DATA_DIR: config.dataDirectory,
      BEATVAULT_ADMIN_EMAIL: adminEmail,
      BEATVAULT_ADMIN_PASSWORD: adminPassword,
      BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomBytes(32).toString('base64url'),
    },
  })
  if (bootstrap.status !== 0) fail(`No se pudo crear la cuenta admin: ${(bootstrap.stderr || bootstrap.stdout).trim()}`)

  await api('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: creatorEmail, password: creatorPassword }),
  })

  const admin = await saveProfile(adminEmail, adminPassword, 'BeatVault QA Admin', false)
  const creator = await saveProfile(creatorEmail, creatorPassword, 'BeatVault QA Creator', true)
  const marker = `QA - solicitud de prueba ${suffix}`
  await api('/api/catalog', {
    method: 'POST',
    headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'beat', title: marker, tagIds: ['qa'], publicationStatus: 'pending-review' }),
  })

  const [, adminOverview, queue] = await Promise.all([
    api('/api/admin/overview', { headers: { cookie: creator.cookie } }, 403),
    api('/api/admin/overview', { headers: { cookie: admin.cookie } }),
    api('/api/admin/catalog-review', { headers: { cookie: admin.cookie } }),
  ])
  if (!adminOverview.response.ok || !queue.response.ok || !JSON.stringify(queue.payload).includes(marker)) {
    fail('La cuenta administradora no pudo leer la cola QA. Revisa la consola local del API.')
  }

  console.log('\nCuentas QA creadas y verificadas en el API local. No se guardaron contraseñas en archivos.')
  console.log(`Web local: http://127.0.0.1:5188/#/home`)
  console.log(`Usuario:   ${creatorEmail}`)
  console.log(`Clave:     ${creatorPassword}`)
  console.log(`Admin:     ${adminEmail}`)
  console.log(`Clave:     ${adminPassword}`)
  console.log(`Elemento pendiente para revisar: ${marker}`)
  console.log('Verificación: usuario recibe 403 en Admin; admin accede al resumen y ve la cola.')
  console.log('Abre cada cuenta en perfiles de navegador distintos para mantener ambas sesiones activas.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudieron preparar las cuentas QA.')
  process.exitCode = 1
})
