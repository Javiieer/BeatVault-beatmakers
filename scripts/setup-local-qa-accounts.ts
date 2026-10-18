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
const managerEmail = `qa-manager-${suffix}@beatvault.local`
const adminEmail = `qa-admin-${suffix}@beatvault.local`
const creatorPassword = randomBytes(24).toString('base64url')
const managerPassword = randomBytes(24).toString('base64url')
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

  const managerRegistration = await api('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: managerEmail, password: managerPassword }),
  }, 201)
  const managerData = managerRegistration.payload && typeof managerRegistration.payload === 'object' && 'data' in managerRegistration.payload
    ? managerRegistration.payload.data
    : undefined
  const managerId = managerData && typeof managerData === 'object' && 'id' in managerData && typeof managerData.id === 'string'
    ? managerData.id
    : undefined
  if (typeof managerId !== 'string') throw new Error('El API no devolvió el ID de la cuenta QA Community Manager.')

  const creatorRegistration = await api('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: creatorEmail, password: creatorPassword }),
  }, 201)
  const creatorData = creatorRegistration.payload && typeof creatorRegistration.payload === 'object' && 'data' in creatorRegistration.payload
    ? creatorRegistration.payload.data
    : undefined
  const creatorId = creatorData && typeof creatorData === 'object' && 'id' in creatorData && typeof creatorData.id === 'string'
    ? creatorData.id
    : undefined
  if (typeof creatorId !== 'string') throw new Error('El API no devolvió el ID de la cuenta QA creadora.')

  const admin = await saveProfile(adminEmail, adminPassword, 'BeatVault QA Admin', false)
  await api(`/api/admin/accounts/${encodeURIComponent(managerId)}/role`, {
    method: 'PATCH',
    headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'community_manager' }),
  }, 200)
  const creator = await saveProfile(creatorEmail, creatorPassword, 'BeatVault QA Creator', true)
  const manager = await saveProfile(managerEmail, managerPassword, 'BeatVault QA Community Manager', false)
  const marker = `QA - solicitud de prueba ${suffix}`
  await api('/api/catalog', {
    method: 'POST',
    headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'beat', title: marker, tagIds: ['qa'], publicationStatus: 'pending-review' }),
  })

  const [creatorAdmin, creatorStaff, managerAdmin, managerAdminQueue, managerQueue, adminOverview, adminQueue] = await Promise.all([
    api('/api/admin/overview', { headers: { cookie: creator.cookie } }, 403),
    api('/api/staff/catalog-review', { headers: { cookie: creator.cookie } }, 403),
    api('/api/admin/overview', { headers: { cookie: manager.cookie } }, 403),
    api('/api/admin/catalog-review', { headers: { cookie: manager.cookie } }, 403),
    api('/api/staff/catalog-review', { headers: { cookie: manager.cookie } }),
    api('/api/admin/overview', { headers: { cookie: admin.cookie } }),
    api('/api/admin/catalog-review', { headers: { cookie: admin.cookie } }),
  ])
  if (!adminOverview.response.ok || !adminQueue.response.ok || !JSON.stringify(adminQueue.payload).includes(marker) || !managerQueue.response.ok || !JSON.stringify(managerQueue.payload).includes(marker)) {
    fail('El admin o Community Manager no pudo leer la cola QA. Revisa la consola local del API.')
  }
  if (creatorAdmin.response.status !== 403 || creatorStaff.response.status !== 403 || managerAdmin.response.status !== 403 || managerAdminQueue.response.status !== 403) {
    fail('Una cuenta QA recibió permisos fuera de su rol esperado.')
  }

  console.log('\nCuentas QA creadas y verificadas en el API local. No se guardaron contraseñas en archivos.')
  console.log(`Web local: http://127.0.0.1:5188/#/home`)
  console.log(`Usuario:   ${creatorEmail}`)
  console.log(`Clave:     ${creatorPassword}`)
  console.log(`CM:        ${managerEmail}`)
  console.log(`Clave:     ${managerPassword}`)
  console.log(`Admin:     ${adminEmail}`)
  console.log(`Clave:     ${adminPassword}`)
  console.log(`Elemento pendiente para revisar: ${marker}`)
  console.log('Verificación: creador y CM reciben 403 en Admin; solo el CM accede a la cola de revisión y el admin conserva el panel.')
  console.log('Abre cada cuenta en un perfil de navegador distinto para mantener las tres sesiones activas.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudieron preparar las cuentas QA.')
  process.exitCode = 1
})
