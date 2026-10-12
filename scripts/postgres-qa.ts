import { randomUUID } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { PostgresRepository } from '../server/postgres'
import { hashPassword } from '../server/auth'
import { emptyProfile } from '../src/domains/profile'
import { config } from '../server/config'

const databaseUrl = process.env.BEATVAULT_TEST_DATABASE_URL
if (!databaseUrl) throw new Error('Define BEATVAULT_TEST_DATABASE_URL para ejecutar la QA PostgreSQL.')
const database = new URL(databaseUrl)
const databaseName = decodeURIComponent(database.pathname.slice(1))
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || !/^beatvault_(test|audit)_[a-zA-Z0-9_-]+$/.test(databaseName)) {
  throw new Error('Por seguridad, la QA solo acepta PostgreSQL local con nombre beatvault_test_* o beatvault_audit_*.')
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message) }
const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 5000 })
const repo = new PostgresRepository(pool)
const fixturePrefix = `pgqa_${randomUUID().replaceAll('-', '').slice(0, 20)}`
const creatorId = `${fixturePrefix}_creator`
const adminId = `${fixturePrefix}_admin`
const outsiderId = `${fixturePrefix}_outsider`
const quotaId = `${fixturePrefix}_quota`
const password = 'Postgres-QA-Only-2026!'
const emailFor = (kind: string) => `${fixturePrefix}-${kind}@beatvault.invalid`
const uploadsDir = await mkdtemp(join(tmpdir(), 'beatvault-postgres-qa-'))
const dataDir = join(uploadsDir, 'data')
const apiDir = process.cwd()
let api: ChildProcess | undefined
let apiOutput = ''
let apiPort = 0

function wavFixture(dataBytes = 32000, marker = 0): Buffer {
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < dataBytes / 2; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI / 20) * 1000), 44 + i * 2)
  if (dataBytes >= 2) buffer.writeInt16LE(marker, 44)
  return buffer
}

const encodedFormats = [
  ['mp3', 'libmp3lame', 'mp3', 'audio/mpeg'],
  ['flac', 'flac', 'flac', 'audio/flac'],
  ['aac', 'aac', 'adts', 'audio/aac'],
  ['m4a', 'aac', 'ipod', 'audio/mp4'],
  ['ogg', 'libvorbis', 'ogg', 'audio/ogg'],
  ['webm', 'libopus', 'webm', 'audio/webm'],
] as const
const hasFfmpeg = spawnSync(config.ffmpegPath, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0

async function freePort(): Promise<number> {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve))
  const address = listener.address()
  assert(address && typeof address !== 'string', 'No se pudo asignar puerto de API.')
  await new Promise<void>(resolve => listener.close(() => resolve()))
  return address.port
}

async function startApi(): Promise<void> {
  apiPort = await freePort()
  apiOutput = ''
  api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: apiDir,
    env: {
      ...process.env,
      NODE_ENV: 'test', BEATVAULT_STORAGE_BACKEND: 'postgres', DATABASE_URL: databaseUrl,
      BEATVAULT_HOST: '127.0.0.1', BEATVAULT_PORT: String(apiPort), BEATVAULT_DEMO_ENABLED: 'false',
      BEATVAULT_RATE_LIMIT: '200', BEATVAULT_CORS_ORIGINS: 'http://127.0.0.1:5187',
      BEATVAULT_UPLOAD_MAX_FILE_BYTES: String(512 * 1024), BEATVAULT_UPLOAD_MAX_REQUEST_BYTES: String(640 * 1024),
      BEATVAULT_STORAGE_QUOTA_BYTES: '250000',
      BEATVAULT_PLAN_CREATOR_STORAGE_BYTES: '100000',
      BEATVAULT_DATA_DIR: dataDir, BEATVAULT_UPLOAD_DIR: join(uploadsDir, 'uploads'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.stdout?.on('data', chunk => { apiOutput = (apiOutput + chunk.toString()).slice(-5000) })
  api.stderr?.on('data', chunk => { apiOutput = (apiOutput + chunk.toString()).slice(-5000) })
  const endpoint = `http://127.0.0.1:${apiPort}/api/ready`
  for (let attempt = 0; attempt < 80; attempt++) {
    if (api.exitCode !== null) throw new Error(`API PostgreSQL no arrancó:\n${apiOutput}`)
    try {
      const response = await fetch(endpoint)
      if (response.ok && (await response.json() as { data?: { storageBackend?: string } }).data?.storageBackend === 'postgres') return
    } catch { /* API is still starting */ }
    await delay(250)
  }
  throw new Error(`Timeout al esperar API PostgreSQL:\n${apiOutput}`)
}

async function stopApi(): Promise<void> {
  if (!api || api.exitCode !== null) return
  const child = api
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => { child.kill('SIGKILL') }, 5000)
    child.once('exit', () => { clearTimeout(timeout); resolve() })
    child.kill('SIGTERM')
  })
  api = undefined
}

type Session = { cookie: string; csrf: string }
const base = () => `http://127.0.0.1:${apiPort}`
async function login(email: string): Promise<Session> {
  const response = await fetch(`${base()}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  assert(response.status === 200, `Login PostgreSQL falló (${response.status}).`)
  const cookies = response.headers.getSetCookie()
  const cookie = cookies.map(value => value.split(';')[0]).join('; ')
  const csrf = cookies.find(value => value.startsWith('beatvault_csrf='))?.split(';')[0].split('=')[1]
  assert(cookie && csrf, 'La API no entregó cookies de sesión/CSRF.')
  return { cookie, csrf }
}

async function request(session: Session, path: string, method = 'GET', payload?: unknown, csrf = true): Promise<Response> {
  return fetch(`${base()}${path}`, {
    method,
    headers: {
      cookie: session.cookie,
      ...(method !== 'GET' ? { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': session.csrf } : {}) } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
}

async function rawUpload(session: Session, filename: string, mimeType: string, bytes: Buffer, options: { fields?: Array<[string, string]>; includeContentLength?: boolean } = {}): Promise<{ status: number; body: { data?: { id: string; previewStorageKey?: string }; error?: { code?: string } } }> {
  const boundary = `beatvault-qa-${randomUUID()}`
  const body = Buffer.concat([
    ...(options.fields ?? []).flatMap(([name, value]) => [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)]),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${base()}/api/assets/upload`, {
      method: 'POST',
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': `multipart/form-data; boundary=${boundary}`, ...(options.includeContentLength === false ? {} : { 'content-length': String(body.length) }) },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as { data?: { id: string; previewStorageKey?: string }; error?: { code?: string } } }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(body)
  })
}

async function waitForEvent(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 5000): Promise<string> {
  let text = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      delay(Math.max(1, deadline - Date.now())).then(() => ({ done: true as const, value: undefined })),
    ])
    if (next.done) break
    text += new TextDecoder().decode(next.value)
    if (text.includes('\n\n') && text.includes('data:')) return text
  }
  throw new Error('No llegó el evento SSE esperado.')
}

const tables = ['accounts', 'account_storage_quotas', 'account_storage_usage', 'audit_events', 'assets', 'catalog_assets', 'catalog_activity', 'catalog_comments', 'catalog_reactions', 'creator_profiles', 'direct_messages', 'friendships', 'projects']
try {
  const schema = await pool.query<{ name: string; exists: boolean }>(
    'SELECT name, to_regclass($1 || \'.\' || name) IS NOT NULL AS exists FROM unnest($2::text[]) AS name',
    ['public', tables],
  )
  assert(schema.rows.every(table => table.exists), `Faltan tablas/migraciones PostgreSQL: ${schema.rows.filter(table => !table.exists).map(table => table.name).join(', ')}`)
  const previewSchema = await pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'preview_storage_key') AS exists")
  assert(previewSchema.rows[0]?.exists, 'Falta la migracion 010_asset_previews.sql.')
  assert(schema.rows.some(table => table.name === 'account_storage_usage' && table.exists), 'Falta la migracion 011_storage_usage.sql.')
  assert(schema.rows.some(table => table.name === 'account_storage_quotas' && table.exists), 'Falta la migracion 012_account_storage_quotas.sql.')
  const planSchema = await pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'plan_id') AS exists")
  assert(planSchema.rows[0]?.exists, 'Falta la columna plan_id de la migracion 013_account_plans.sql.')
  const packageSchema = await pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'purchased_plan_ids') AS exists")
  assert(packageSchema.rows[0]?.exists, 'Falta el historial de paquetes verificados de la migracion 014_verified_package_history.sql.')

  const hash = await hashPassword(password)
  for (const [id, kind, role] of [[creatorId, 'creator', 'creator'], [adminId, 'admin', 'admin'], [outsiderId, 'outsider', 'creator'], [quotaId, 'quota', 'creator']]) {
    await repo.saveAccount({ id, email: emailFor(kind), passwordHash: hash, role: role as 'creator' | 'admin', verificationState: 'verified' })
    await repo.saveProfile({ ...emptyProfile(id), displayName: `QA ${kind}`, publicProfile: true })
  }
  await repo.saveAccount({ ...(await repo.findAccountById(creatorId))!, planId: 'studio', purchasedPlanIds: ['creator', 'studio'] })
  assert((await repo.findAccountById(creatorId))?.purchasedPlanIds?.join(',') === 'creator,studio', 'No persistió el historial de paquetes adquiridos.')
  await startApi()

  let creator = await login(emailFor('creator'))
  let response = await request(creator, `/api/chat/conversations/${adminId}/messages`)
  assert(response.status === 403, 'Chat permitió acceso antes de aceptar amistad.')
  response = await request(creator, '/api/friend-requests', 'POST', { targetId: adminId })
  assert(response.status === 201, 'No se creó la solicitud de amistad.')
  const friendship = (await response.json() as { data: { id: string } }).data
  const admin = await login(emailFor('admin'))
  response = await request(admin, `/api/admin/accounts/${creatorId}/plan`, 'PATCH', { planId: 'creator' })
  assert(response.status === 200, 'Admin no pudo asignar un paquete de prueba en PostgreSQL.')
  const creatorPlan = (await request(creator, '/api/account/plan').then(value => value.json()) as { data: { planId: string; plan: { storageLimitBytes: number | null } } }).data
  const creatorPlanStorage = (await request(creator, '/api/account/storage').then(value => value.json()) as { data: { limitBytes: number | null; quotaSource: string } }).data
  assert(creatorPlan.planId === 'creator' && creatorPlan.plan.storageLimitBytes === 100000 && creatorPlanStorage.limitBytes === 100000 && creatorPlanStorage.quotaSource === 'plan', 'El paquete o su cuota configurada no persistieron en PostgreSQL.')
  response = await request(admin, `/api/admin/accounts/${creatorId}/plan`, 'PATCH', { planId: 'free' })
  assert(response.status === 200, 'No se pudo restaurar el paquete Free de la cuenta QA.')
  response = await request(admin, `/api/friend-requests/${friendship.id}/accept`, 'POST', {})
  assert(response.status === 200, 'No se pudo aceptar la amistad.')
  response = await request(creator, `/api/chat/conversations/${adminId}/messages`, 'POST', { body: 'PostgreSQL QA message' }, false)
  assert(response.status === 403, 'Chat permitió envío sin CSRF.')

  const streamController = new AbortController()
  let streamResponse = await fetch(`${base()}/api/chat/events`, { headers: { cookie: creator.cookie }, signal: streamController.signal })
  assert(streamResponse.status === 200 && streamResponse.headers.get('content-type')?.includes('text/event-stream'), 'No abrió el primer SSE.')
  let streamReader = streamResponse.body!.getReader()
  const connected = await streamReader.read()
  assert(new TextDecoder().decode(connected.value).includes(': connected'), 'El SSE inicial no confirmó conexión.')
  streamController.abort()
  await streamReader.cancel().catch(() => undefined)

  const reconnectController = new AbortController()
  streamResponse = await fetch(`${base()}/api/chat/events`, { headers: { cookie: creator.cookie }, signal: reconnectController.signal })
  assert(streamResponse.status === 200, 'No reconectó el stream SSE.')
  streamReader = streamResponse.body!.getReader()
  const reconnected = await streamReader.read()
  assert(new TextDecoder().decode(reconnected.value).includes(': connected'), 'El SSE reconectado no quedó suscrito.')
  response = await request(admin, `/api/chat/conversations/${creatorId}/messages`, 'POST', { body: 'SSE after reconnect' })
  assert(response.status === 201, 'No se envió el mensaje de prueba SSE.')
  const sseEvent = await waitForEvent(streamReader)
  assert(sseEvent.includes('"type":"message"') && sseEvent.includes(adminId), 'El SSE reconectado no recibió el evento del amigo.')
  reconnectController.abort()
  await streamReader.cancel().catch(() => undefined)

  response = await request(admin, `/api/chat/conversations/${creatorId}/read`, 'POST', {})
  assert(response.status === 200, 'No se pudo marcar leído.')
  const wav = wavFixture()
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(wav).buffer as ArrayBuffer], { type: 'audio/wav' }), 'postgres-qa.wav')
  response = await fetch(`${base()}/api/assets/upload`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf }, body: form })
  assert(response.status === 201, `Upload real falló (${response.status}).`)
  const asset = (await response.json() as { data: { id: string; previewStorageKey?: string } }).data
  assert(asset.previewStorageKey ? true : !hasFfmpeg, 'FFmpeg está disponible, pero la subida WAV no generó un derivado de preview.')
  if (hasFfmpeg) {
    for (const [extension, codec, container, mimeType] of encodedFormats) {
      const sourcePath = join(uploadsDir, `fixture.${extension}`)
      const generated = spawnSync(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25', '-c:a', codec, '-f', container, sourcePath], { windowsHide: true, encoding: 'utf8' })
      assert(generated.status === 0, `No se pudo crear fixture ${extension}: ${generated.stderr}`)
      const bytes = await readFile(sourcePath)
      const upload = new FormData()
      upload.append('file', new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mimeType }), `postgres-qa.${extension}`)
      const uploaded = await fetch(`${base()}/api/assets/upload`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf }, body: upload })
      assert(uploaded.status === 201, `Upload ${extension} falló (${uploaded.status}).`)
      const encodedAsset = (await uploaded.json() as { data: { id: string; mimeType: string; previewStorageKey?: string } }).data
      assert(encodedAsset.mimeType === mimeType, `La API asignó MIME incorrecto a ${extension}: ${encodedAsset.mimeType}.`)
      assert(encodedAsset.previewStorageKey, `No se generó preview M4A para ${extension}.`)
      const original = await fetch(`${base()}/api/assets/${encodedAsset.id}/preview`, { headers: { cookie: creator.cookie, range: 'bytes=0-15' } })
      assert(original.status === 206 && Buffer.from(await original.arrayBuffer()).equals(bytes.subarray(0, 16)), `Original ${extension} no conservó sus bytes privados.`)
      const published = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} ${extension}`, type: 'beat', tagIds: [], assetId: encodedAsset.id, publicationStatus: 'pending-review' })
      assert(published.status === 201, `No se creó publicación para ${extension}.`)
      const publishedEntry = (await published.json() as { data: { contentId: string } }).data
      const approved = await request(admin, `/api/admin/catalog-review/${publishedEntry.contentId}`, 'POST', { decision: 'approve' })
      assert(approved.status === 200, `No se aprobó preview de ${extension}.`)
      const publicPreview = await fetch(`${base()}/api/catalog/${publishedEntry.contentId}/preview`)
      const derivative = Buffer.from(await publicPreview.arrayBuffer())
      assert(publicPreview.status === 200 && publicPreview.headers.get('content-type') === 'audio/mp4' && derivative.toString('ascii', 4, 8) === 'ftyp', `Preview público derivado de ${extension} es inválido.`)
    }
    const forged = new FormData()
    forged.append('file', new Blob(['not audio'], { type: 'audio/mpeg' }), 'forged.mp3')
    const rejected = await fetch(`${base()}/api/assets/upload`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf }, body: forged })
    const rejection = await rejected.json() as { error?: { code?: string } }
    assert(rejected.status === 400 && rejection.error?.code === 'UPLOAD_SIGNATURE', 'La subida multipart aceptó un MP3 con firma falsificada.')
  }
  const malformedWav = Buffer.alloc(16)
  malformedWav.write('RIFF', 0); malformedWav.writeUInt32LE(8, 4); malformedWav.write('WAVE', 8); malformedWav.write('NOPE', 12)
  const malformed = await rawUpload(creator, 'malformed.wav', 'audio/wav', malformedWav)
  assert(malformed.status === 201 && malformed.body.data?.id && !malformed.body.data.previewStorageKey, `El WAV malformado no quedó aislado sin preview (${malformed.status}).`)
  response = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} malformed`, type: 'beat', tagIds: [], assetId: malformed.body.data.id, publicationStatus: 'pending-review' })
  assert(response.status === 201, 'No se creó el elemento pendiente para probar fail-closed del contenedor malformado.')
  const malformedEntry = (await response.json() as { data: { contentId: string } }).data
  response = await request(admin, `/api/admin/catalog-review/${malformedEntry.contentId}`, 'POST', { decision: 'approve' })
  const malformedReview = await response.json() as { error?: { code?: string } }
  assert(response.status === 409 && malformedReview.error?.code === 'PROCESSED_PREVIEW_REQUIRED', 'Se aprobó un contenedor malformado sin preview procesado.')
  response = await fetch(`${base()}/api/catalog/${malformedEntry.contentId}/preview`)
  assert(response.status === 404, 'El preview de un contenedor malformado se expuso públicamente.')

  const oversizedFile = await rawUpload(creator, 'oversized.wav', 'audio/wav', Buffer.alloc(512 * 1024 + 1))
  assert(oversizedFile.status === 413 && oversizedFile.body.error?.code === 'UPLOAD_LIMIT', `El límite por archivo no devolvió 413 (${oversizedFile.status}).`)
  const oversizedRequest = await rawUpload(creator, 'oversized-request.wav', 'audio/wav', Buffer.alloc(16), { fields: Array.from({ length: 8 }, (_, index) => [`field${index}`, 'x'.repeat(80 * 1024)]), includeContentLength: false })
  assert(oversizedRequest.status === 413 && oversizedRequest.body.error?.code === 'UPLOAD_LIMIT', `El límite agregado chunked no devolvió 413 (${oversizedRequest.status}).`)
  response = await fetch(`${base()}/api/assets/${asset.id}/preview`, { headers: { cookie: creator.cookie, range: 'bytes=0-11' } })
  assert(response.status === 206 && Buffer.from(await response.arrayBuffer()).equals(wav.subarray(0, 12)), 'Preview/range de audio no coincide con los bytes originales.')
  const outsider = await login(emailFor('outsider'))
  response = await fetch(`${base()}/api/assets/${asset.id}/preview`, { headers: { cookie: outsider.cookie } })
  assert(response.status === 404, 'Otra cuenta pudo acceder al preview privado.')
  response = await request(creator, `/api/assets/${asset.id}/preview/process`, 'POST', {}, false)
  assert(response.status === 403, 'El reintento de preview aceptó una petición sin CSRF.')
  response = await request(outsider, `/api/assets/${asset.id}/preview/process`, 'POST', {})
  assert(response.status === 404, 'Otra cuenta pudo reintentar el procesamiento del original.')
  response = await request(creator, `/api/assets/${asset.id}/preview/process`, 'POST', {})
  if (asset.previewStorageKey) assert(response.status === 200 && (await response.json() as { data?: { previewReady?: boolean } }).data?.previewReady === true, 'El reintento idempotente del preview listo falló.')
  else {
    const retryFailure = await response.json() as { error?: { code?: string } }
    assert(response.status === 503 && retryFailure.error?.code === 'PREVIEW_PROCESSING_FAILED', 'El reintento sin FFmpeg no falló de forma segura y recuperable.')
  }

  response = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} public preview`, type: 'beat', tagIds: [], assetId: asset.id, publicationStatus: 'pending-review' })
  assert(response.status === 201, 'No se creó el beat vinculado al audio de prueba.')
  const previewCatalog = (await response.json() as { data: { contentId: string; assetId?: string; audio?: { previewReady?: boolean } } }).data
  const hasProcessedPreview = Boolean(asset.previewStorageKey)
  if (hasProcessedPreview) {
    assert(previewCatalog.audio?.previewReady === true, 'La API no informó que el derivado está listo al dueño.')
    response = await request(admin, `/api/admin/catalog-review/${previewCatalog.contentId}`, 'POST', { decision: 'approve' })
    assert(response.status === 200, 'No se pudo aprobar el beat con preview procesado.')
    const publicEntry = (await request(outsider, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string; assetId?: string; previewUrl?: string }> } }).data.entries.find(item => item.contentId === previewCatalog.contentId)
    assert(publicEntry?.previewUrl === `/api/catalog/${previewCatalog.contentId}/preview` && publicEntry.assetId === undefined, 'El catálogo no expuso únicamente la URL derivada.')
    response = await fetch(`${base()}${publicEntry.previewUrl}`)
    const derivative = Buffer.from(await response.arrayBuffer())
    assert(response.status === 200 && response.headers.get('content-type') === 'audio/mp4' && derivative.toString('ascii', 4, 8) === 'ftyp' && derivative.length < wav.length, 'El endpoint público no entregó el derivado M4A esperado.')
  } else {
    response = await request(admin, `/api/admin/catalog-review/${previewCatalog.contentId}`, 'POST', { decision: 'approve' })
    const failure = await response.json() as { error?: { code?: string } }
    assert(response.status === 409 && failure.error?.code === 'PROCESSED_PREVIEW_REQUIRED', 'Se aprobó un audio sin derivado procesado.')
    response = await fetch(`${base()}/api/catalog/${previewCatalog.contentId}/preview`)
    assert(response.status === 404, 'El beat pendiente se expuso públicamente sin derivado.')
  }

  response = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} concurrent`, type: 'beat', tagIds: [], publicationStatus: 'pending-review' })
  assert(response.status === 201, 'No se creó el beat pendiente de prueba.')
  const catalog = (await response.json() as { data: { contentId: string } }).data
  const decisions = await Promise.all([
    request(admin, `/api/admin/catalog-review/${catalog.contentId}`, 'POST', { decision: 'approve' }),
    request(admin, `/api/admin/catalog-review/${catalog.contentId}`, 'POST', { decision: 'reject', reason: 'stale concurrent decision' }),
  ])
  assert(decisions.map(item => item.status).sort().join(',') === '200,409', 'La revisión concurrente no produjo exactamente 200 y 409.')

  response = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} rejected`, type: 'beat', tagIds: [], publicationStatus: 'pending-review' })
  assert(response.status === 201, 'No se creó el beat para verificar privacidad.')
  const rejected = (await response.json() as { data: { contentId: string } }).data
  response = await request(admin, `/api/admin/catalog-review/${rejected.contentId}`, 'POST', { decision: 'reject', reason: 'owner-only QA note' })
  assert(response.status === 200, 'No se pudo rechazar el beat de prueba.')
  const creatorCatalog = (await request(creator, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string; reviewNote?: string }> } }).data.entries
  assert(creatorCatalog.find(entry => entry.contentId === rejected.contentId)?.reviewNote === 'owner-only QA note', 'El creador no recibió su nota privada.')
  const outsiderCatalog = (await request(outsider, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string }> } }).data.entries
  assert(!outsiderCatalog.some(entry => entry.contentId === rejected.contentId), 'La cuenta externa vio el beat rechazado.')

  const quotaAccount = await login(emailFor('quota'))
  response = await request(admin, `/api/admin/accounts/${quotaId}/plan`, 'PATCH', { planId: 'creator' })
  assert(response.status === 200, 'Admin no pudo asignar Creator para la carrera de cuota por paquete.')
  const packageBase = await rawUpload(quotaAccount, 'package-base.wav', 'audio/wav', wavFixture(95956))
  assert(packageBase.status === 201 && packageBase.body.data?.id, `No se pudo crear uso inicial de Creator (${packageBase.status}).`)
  const packageUsage = (await request(quotaAccount, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number; limitBytes: number; availableBytes: number; quotaSource: string } }).data
  assert(packageUsage.usedBytes === 96000 && packageUsage.limitBytes === 100000 && packageUsage.availableBytes === 4000 && packageUsage.quotaSource === 'plan', 'La cuota de paquete no calculó correctamente el espacio restante antes de la carrera.')
  const packageRace = await Promise.all([
    rawUpload(quotaAccount, 'package-race-a.wav', 'audio/wav', wavFixture(2000, 111)),
    rawUpload(quotaAccount, 'package-race-b.wav', 'audio/wav', wavFixture(2000, 222)),
  ])
  assert(packageRace.map(item => item.status).sort().join(',') === '201,409', 'Las subidas simultáneas excedieron la cuota del paquete o fueron ambas rechazadas.')
  assert(packageRace.find(item => item.status === 409)?.body.error?.code === 'STORAGE_QUOTA_EXCEEDED', 'La carrera de paquete no devolvió el error de cuota esperado.')
  const packageRaceWinner = packageRace.find(item => item.status === 201)?.body.data
  assert(packageRaceWinner?.id, 'No se identificó el archivo admitido en la carrera de paquete.')
  const afterPackageRace = (await request(quotaAccount, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number; availableBytes: number; quotaSource: string } }).data
  assert(afterPackageRace.usedBytes === 98044 && afterPackageRace.availableBytes === 1956 && afterPackageRace.quotaSource === 'plan', 'La carrera dejó consumo incorrecto para la cuota de paquete.')
  for (const assetId of [packageBase.body.data.id, packageRaceWinner.id]) {
    response = await request(quotaAccount, `/api/assets/${assetId}`, 'DELETE', {})
    assert(response.status === 200, 'No se pudo limpiar un asset temporal de la prueba de cuota por paquete.')
  }
  assert(await repo.getStorageUsage(quotaId) === 0, 'La limpieza de prueba dejó uso de almacenamiento en la cuenta Creator.')
  response = await request(admin, `/api/admin/accounts/${quotaId}/plan`, 'PATCH', { planId: 'free' })
  assert(response.status === 200, 'No se pudo restablecer Free después de la prueba por paquete.')
  response = await request(admin, `/api/admin/accounts/${quotaId}/storage-quota`, 'PATCH', { limitBytes: 180000 })
  assert(response.status === 200, 'Admin no pudo asignar una cuota individual sobre el límite global.')
  const initialStorage = await rawUpload(quotaAccount, 'quota-base.wav', 'audio/wav', wavFixture(176956))
  assert(initialStorage.status === 201 && initialStorage.body.data?.id, `No se pudo crear uso inicial de cuota (${initialStorage.status}).`)
  const storageBefore = (await request(quotaAccount, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number; limitBytes: number; availableBytes: number; quotaSource: string } }).data
  assert(storageBefore.usedBytes === 177000 && storageBefore.limitBytes === 180000 && storageBefore.availableBytes === 3000 && storageBefore.quotaSource === 'account', 'El endpoint no informó el consumo y cuota individual exactos de esta cuenta.')
  const adminStorage = (await request(admin, '/api/admin/storage').then(value => value.json()) as { data: Array<{ id: string; usedBytes: number; originalCount: number; previewBytes: number; previewCount: number; storedBytes: number }> }).data
  const quotaMetrics = adminStorage.find(item => item.id === quotaId)
  assert(quotaMetrics?.usedBytes === 177000 && quotaMetrics.originalCount === 1 && quotaMetrics.storedBytes === quotaMetrics.usedBytes + quotaMetrics.previewBytes && quotaMetrics.previewCount >= 0, 'Admin no reportó por separado originales, previews y total registrado.')
  await repo.updateAssetState(initialStorage.body.data.id, 'missing')
  assert(await repo.getStorageUsage(quotaId) === 0, 'Marcar un original como ausente no liberó espacio en PostgreSQL.')
  await repo.updateAssetState(initialStorage.body.data.id, 'available')
  assert(await repo.getStorageUsage(quotaId) === 177000, 'Restaurar un original no recuperó su uso en PostgreSQL.')
  const smallWav = wavFixture(2000)
  const racingUploads = await Promise.all([
    rawUpload(quotaAccount, 'quota-race-a.wav', 'audio/wav', smallWav),
    rawUpload(quotaAccount, 'quota-race-b.wav', 'audio/wav', smallWav),
  ])
  assert(racingUploads.map(item => item.status).sort().join(',') === '201,409', 'Las subidas simultáneas rebasaron la cuota o ambas fueron rechazadas.')
  const acceptedQuotaUpload = racingUploads.find(item => item.status === 201)?.body.data
  assert(acceptedQuotaUpload?.id, 'No se recibió el asset admitido durante la carrera de cuota.')
  assert(racingUploads.find(item => item.status === 409)?.body.error?.code === 'STORAGE_QUOTA_EXCEEDED', 'La API no identificó el rechazo por cuota.')
  const storageAfterRace = (await request(quotaAccount, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number; availableBytes: number } }).data
  assert(storageAfterRace.usedBytes === 179044 && storageAfterRace.availableBytes === 956, 'La carrera dejó incorrecto el contador de almacenamiento.')
  response = await request(quotaAccount, `/api/assets/${acceptedQuotaUpload.id}`, 'DELETE', {})
  assert(response.status === 200, 'No se pudo borrar el audio que completaba la cuota.')
  const storageAfterDelete = (await request(quotaAccount, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number; availableBytes: number } }).data
  assert(storageAfterDelete.usedBytes === 177000 && storageAfterDelete.availableBytes === 3000, 'Borrar un asset no liberó su cuota.')

  await stopApi()
  await startApi()
  creator = await login(emailFor('creator'))
  response = await request(creator, `/api/assets/${asset.id}/preview`)
  assert(response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(wav), 'Preview no sobrevivió al reinicio de la API.')
  if (hasProcessedPreview) {
    const publicPreview = await fetch(`${base()}/api/catalog/${previewCatalog.contentId}/preview`)
    assert(publicPreview.status === 200 && (await publicPreview.headers.get('content-type')) === 'audio/mp4', 'Preview público no sobrevivió al reinicio de la API.')
  }
  const messages = (await request(creator, `/api/chat/conversations/${adminId}/messages`).then(value => value.json()) as { data: Array<{ body: string }> }).data
  assert(messages.some(message => message.body === 'SSE after reconnect'), 'El historial no sobrevivió al reinicio de la API.')
  const auditCount = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM audit_events WHERE actor_id = $1 AND metadata->>'resource' = 'catalog-review'", [adminId])
  assert(auditCount.rows[0].count >= 2, 'No persistieron los eventos de auditoría de revisión.')
  console.log('PASS: PostgreSQL auth/chat/SSE, plan assignment and storage resolution, package-quota concurrent upload race, seven audio formats, malformed-container fail-closed, declared/chunked upload limits, atomic account quotas, storage usage and moderation.')
} finally {
  await stopApi()
  try {
    await pool.query('DELETE FROM account_storage_quotas WHERE owner_id = ANY($1::text[]) OR updated_by = ANY($1::text[])', [[creatorId, adminId, outsiderId, quotaId]])
    await pool.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [[creatorId, adminId, outsiderId, quotaId]])
  } catch (error) {
    console.error('QA cleanup warning; the test database may already be unavailable:', error)
  }
  await pool.end()
  await rm(uploadsDir, { recursive: true, force: true })
}
