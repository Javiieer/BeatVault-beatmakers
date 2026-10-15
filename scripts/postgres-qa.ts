import { randomUUID } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { PostgresRepository } from '../server/postgres'
import { hashPassword } from '../server/auth'
import { emptyProfile } from '../src/domains/profile'
import { draftOfferTermsVersion, type BeatListingRecord } from '../src/domains/marketplace/sellerListings'
import { config } from '../server/config'

const databaseUrl = process.env.BEATVAULT_TEST_DATABASE_URL ?? ''
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
const managerId = `${fixturePrefix}_manager`
const quotaId = `${fixturePrefix}_quota`
const orderId = randomUUID()
const webhookEventId = `${fixturePrefix}_stripe_event`
const password = 'Postgres-QA-Only-2026!'
const emailFor = (kind: string) => `${fixturePrefix}-${kind}@beatvault.invalid`
const uploadsDir = await mkdtemp(join(tmpdir(), 'beatvault-postgres-qa-'))
const dataDir = join(uploadsDir, 'data')
const uploadDirectory = join(uploadsDir, 'uploads')
const apiDir = process.cwd()
let api: ChildProcess | undefined
let apiOutput = ''
let apiPort = 0
let socialPostId = ''
let profileAvatarUrl = ''
let profileCoverUrl = ''
const socialPostComment = 'PostgreSQL social profile comment'

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

async function startApi(databaseConnection = databaseUrl, mediaDirectory = uploadDirectory): Promise<void> {
  apiPort = await freePort()
  apiOutput = ''
  api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: apiDir,
    env: {
      ...process.env,
      NODE_ENV: 'test', BEATVAULT_STORAGE_BACKEND: 'postgres', DATABASE_URL: databaseConnection,
      BEATVAULT_HOST: '127.0.0.1', BEATVAULT_PORT: String(apiPort), BEATVAULT_DEMO_ENABLED: 'false',
      BEATVAULT_RATE_LIMIT: '200', BEATVAULT_CORS_ORIGINS: 'http://127.0.0.1:5187',
      BEATVAULT_UPLOAD_MAX_FILE_BYTES: String(512 * 1024), BEATVAULT_UPLOAD_MAX_REQUEST_BYTES: String(640 * 1024),
      BEATVAULT_STORAGE_QUOTA_BYTES: '250000',
      BEATVAULT_PLAN_CREATOR_STORAGE_BYTES: '100000',
      BEATVAULT_DATA_DIR: dataDir, BEATVAULT_UPLOAD_DIR: mediaDirectory,
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

function run(command: string, args: string[], input?: Buffer) {
  return spawnSync(command, args, { input, windowsHide: true, maxBuffer: 128 * 1024 * 1024 })
}

async function verifyBackupRestore(assetId: string, creatorContentId: string, expectedWav: Buffer, expectedArtwork: Buffer, expectedThumbnail: Buffer | undefined, socialId: string): Promise<void> {
  const container = process.env.BEATVAULT_TEST_DATABASE_CONTAINER
  if (!container) {
    console.log('SKIP: PostgreSQL/media restore drill (set BEATVAULT_TEST_DATABASE_CONTAINER to a labeled disposable PostgreSQL 16 container).')
    return
  }
  assert(databaseName.startsWith('beatvault_test_'), 'El ensayo de restauración solo acepta bases beatvault_test_*.')

  const inspected = run('docker', ['inspect', '--format', '{{json .Config.Labels}}|{{.Config.Image}}|{{json .NetworkSettings.Ports}}', container])
  assert(inspected.status === 0, `No se pudo inspeccionar el contenedor de QA: ${inspected.stderr.toString()}`)
  const [labelsText, image, bindingsText] = inspected.stdout.toString().trim().split('|')
  const labels = JSON.parse(labelsText || 'null') as Record<string, string> | null
  const bindings = JSON.parse(bindingsText || 'null') as Record<string, Array<{ HostIp: string; HostPort: string }>> | null
  const sourcePort = database.port || '5432'
  const localBinding = bindings?.['5432/tcp']?.some(binding =>
    ['127.0.0.1', '::1'].includes(binding.HostIp) && binding.HostPort === sourcePort)
  assert(labels?.['beatvault.qa'] === 'true' && image === 'postgres:16' && localBinding,
    'El ensayo requiere un contenedor etiquetado beatvault.qa=true, imagen postgres:16 y puerto publicado solo en loopback que coincida con la URL QA.')

  const restoreDb = `beatvault_test_restore_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const restoreUrl = new URL(databaseUrl)
  restoreUrl.pathname = `/${restoreDb}`
  const backupDirectory = await mkdtemp(join(tmpdir(), 'beatvault-restore-qa-'))
  const dumpPath = join(backupDirectory, 'database.dump')
  const mediaArchive = join(backupDirectory, 'uploads.tar.gz')
  const restoredMedia = join(backupDirectory, 'restored-uploads')
  const username = decodeURIComponent(database.username)
  let restorePool: Pool | undefined
  let targetApiStarted = false
  try {
    await stopApi()
    const dump = run('docker', ['exec', container, 'pg_dump', '-Fc', '--no-owner', '--no-acl', '-U', username, '-d', databaseName])
    assert(dump.status === 0 && dump.stdout.length > 0, `pg_dump falló: ${dump.stderr.toString()}`)
    await writeFile(dumpPath, dump.stdout)

    const mediaBackup = run('tar', ['-czf', mediaArchive, '-C', uploadsDir, 'uploads'])
    assert(mediaBackup.status === 0, `No se pudo respaldar el directorio de audio: ${mediaBackup.stderr.toString()}`)
    assert((await stat(mediaArchive)).size > 0, 'El archivo de respaldo de audios quedó vacío.')
    if (profileAvatarUrl && profileCoverUrl) {
      const profileRow = await pool.query<{ metadata: { avatarImage?: { storageKey?: string; thumbnailStorageKey?: string }; coverImage?: { storageKey?: string; thumbnailStorageKey?: string } } }>('SELECT metadata FROM creator_profiles WHERE account_id = $1', [creatorId])
      const images = profileRow.rows[0]?.metadata
      assert(images?.avatarImage?.storageKey && images.avatarImage.thumbnailStorageKey && images.coverImage?.storageKey && images.coverImage.thumbnailStorageKey, 'El perfil PostgreSQL no conserva las cuatro referencias de avatar/portada.')
      const archiveList = run('tar', ['-tzf', mediaArchive])
      assert(archiveList.status === 0, `No se pudo listar el respaldo de medios: ${archiveList.stderr.toString()}`)
      const archivedNames = archiveList.stdout.toString().split(/\r?\n/).map(name => name.replaceAll('\\', '/').replace(/^\.\//, ''))
      for (const storageKey of [images.avatarImage.storageKey, images.avatarImage.thumbnailStorageKey, images.coverImage.storageKey, images.coverImage.thumbnailStorageKey]) {
        const sourceExists = await stat(join(uploadDirectory, storageKey)).then(() => true, () => false)
        const defaultRootExists = await stat(join(config.uploadDirectory, storageKey)).then(() => true, () => false)
        const archiveMatches = archivedNames.filter(name => name.includes(storageKey.split('/').at(-1) || ''))
        assert(archivedNames.includes(`uploads/${storageKey}`), `El backup de medios no contiene ${storageKey}; sourceInQaRoot=${sourceExists}; sourceInDefaultRoot=${defaultRootExists}; archiveMatches=${archiveMatches.join(',')}`)
      }
    }

    const created = run('docker', ['exec', container, 'createdb', '-U', username, restoreDb])
    assert(created.status === 0, `No se pudo crear la base temporal de restauración: ${created.stderr.toString()}`)
    const restored = run('docker', ['exec', '-i', container, 'pg_restore', '--no-owner', '--no-acl', '-U', username, '-d', restoreDb], await readFile(dumpPath))
    assert(restored.status === 0, `pg_restore falló: ${restored.stderr.toString()}`)

    await mkdir(restoredMedia, { recursive: true })
    const extract = run('tar', ['-xzf', mediaArchive, '-C', restoredMedia])
    assert(extract.status === 0, `No se pudo extraer el respaldo de audios: ${extract.stderr.toString()}`)
    const extractedMedia = join(restoredMedia, 'uploads')
    const sourceAsset = (await pool.query<{ storage_key: string }>('SELECT storage_key FROM assets WHERE id = $1', [assetId])).rows[0]
    assert(sourceAsset?.storage_key, 'No se encontró el original de audio para el ensayo de restauración.')
    const restoredPath = join(extractedMedia, sourceAsset.storage_key)
    assert((await readFile(restoredPath)).equals(expectedWav), 'El respaldo de medios no recuperó exactamente los bytes del audio original.')
    const sourceArtwork = (await pool.query<{ storage_key: string; thumbnail_storage_key: string | null }>('SELECT storage_key, thumbnail_storage_key FROM catalog_artwork WHERE asset_id = $1', [assetId])).rows[0]
    assert(sourceArtwork?.storage_key, 'No se encontró la portada original para el ensayo de restauración.')
    const restoredArtworkPath = join(extractedMedia, sourceArtwork.storage_key)
    assert((await readFile(restoredArtworkPath)).equals(expectedArtwork), 'El respaldo de medios no recuperó exactamente los bytes de la portada.')
    if (expectedThumbnail) {
      assert(sourceArtwork.thumbnail_storage_key, 'No se encontró la miniatura para el ensayo de restauración.')
      assert((await readFile(join(extractedMedia, sourceArtwork.thumbnail_storage_key))).equals(expectedThumbnail), 'El respaldo de medios no recuperó exactamente los bytes de la miniatura.')
    }

    restorePool = new Pool({ connectionString: restoreUrl.toString(), max: 2, connectionTimeoutMillis: 5000 })
    const sourceCounts = await Promise.all(tables.map(async table => [table, Number((await pool.query(`SELECT count(*) AS count FROM public.${table}`)).rows[0].count)] as const))
    const restoredCounts = await Promise.all(tables.map(async table => [table, Number((await restorePool!.query(`SELECT count(*) AS count FROM public.${table}`)).rows[0].count)] as const))
    assert(JSON.stringify(sourceCounts) === JSON.stringify(restoredCounts), 'El respaldo restaurado no conserva las filas de todas las tablas QA.')
    const restoredMessage = await restorePool.query("SELECT 1 FROM direct_messages WHERE body = 'SSE after reconnect' AND sender_id = $1 AND recipient_id = $2", [adminId, creatorId])
    assert(restoredMessage.rowCount === 1, 'El historial de chat no sobrevivió la restauración PostgreSQL.')
    const restoredPackage = await restorePool.query('SELECT purchased_plan_ids FROM accounts WHERE id = $1', [creatorId])
    assert(restoredPackage.rows[0]?.purchased_plan_ids?.includes('studio'), 'El historial de paquetes no sobrevivió la restauración PostgreSQL.')

    await startApi(restoreUrl.toString(), extractedMedia)
    targetApiStarted = true
    const restoredCreator = await login(emailFor('creator'))
    const restoredSocial = (await request(restoredCreator, `/api/posts/${socialId}/social`).then(value => value.json()) as { data: { comments: Array<{ body: string }>; reactionCount: number; reactedByMe: boolean } }).data
    assert(restoredSocial.comments.some(comment => comment.body === socialPostComment) && restoredSocial.reactionCount === 1 && !restoredSocial.reactedByMe, 'La interacción social no sobrevivió a la restauración PostgreSQL.')
    if (profileAvatarUrl && profileCoverUrl) {
      for (const imageUrl of [profileAvatarUrl, profileCoverUrl]) {
        const restoredImage = await fetch(`${base()}${imageUrl}`, { headers: { cookie: restoredCreator.cookie } })
        assert(restoredImage.status === 200 && restoredImage.headers.get('content-type') === 'image/webp' && Number(restoredImage.headers.get('content-length')) > 0, `El avatar o portada no sobrevivió al backup/restore (${imageUrl}: ${restoredImage.status}, ${restoredImage.headers.get('content-type')}).`)
      }
    }
    const restoredDownload = await fetch(`${base()}/api/assets/${assetId}/download`, { headers: { cookie: restoredCreator.cookie } })
    assert(restoredDownload.status === 200 && Buffer.from(await restoredDownload.arrayBuffer()).equals(expectedWav), 'La API restaurada no pudo servir el audio recuperado.')
    const restoredMessages = (await request(restoredCreator, `/api/chat/conversations/${adminId}/messages`).then(value => value.json()) as { data: Array<{ body: string }> }).data
    assert(restoredMessages.some(message => message.body === 'SSE after reconnect'), 'La API restaurada no pudo leer el chat recuperado.')
    const restoredCatalog = (await request(restoredCreator, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string }> } }).data.entries
    assert(restoredCatalog.some(entry => entry.contentId === creatorContentId), 'La API restaurada no pudo leer el catálogo recuperado.')
    const restoredArtwork = await fetch(`${base()}/api/catalog/${creatorContentId}/artwork`, { headers: { cookie: restoredCreator.cookie } })
    assert(restoredArtwork.status === 200 && Buffer.from(await restoredArtwork.arrayBuffer()).equals(expectedArtwork), 'La API restaurada no pudo servir la portada recuperada.')
    if (expectedThumbnail) {
      const restoredThumbnail = await fetch(`${base()}/api/catalog/${creatorContentId}/artwork/thumbnail`, { headers: { cookie: restoredCreator.cookie } })
      assert(restoredThumbnail.status === 200 && restoredThumbnail.headers.get('content-type') === 'image/webp' && Buffer.from(await restoredThumbnail.arrayBuffer()).equals(expectedThumbnail), 'La API restaurada no pudo servir la miniatura WebP recuperada.')
    }
    console.log('PASS: PostgreSQL custom-format backup/restore, table row counts, package history, chat, social post interactions, catalog, audio, original artwork and thumbnail.')
  } finally {
    if (targetApiStarted || api) await stopApi()
    await restorePool?.end()
    const dropped = run('docker', ['exec', container, 'dropdb', '--if-exists', '-U', username, restoreDb])
    if (dropped.status !== 0) console.error(`Restore QA cleanup warning; temporary database ${restoreDb} may need removal: ${dropped.stderr.toString()}`)
    await rm(backupDirectory, { recursive: true, force: true })
  }
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

const tables = ['accounts', 'account_storage_quotas', 'account_storage_usage', 'audit_events', 'assets', 'auth_sessions', 'beat_orders', 'catalog_artwork', 'catalog_assets', 'catalog_activity', 'catalog_comments', 'catalog_reactions', 'creator_profiles', 'direct_messages', 'friendships', 'marketplace_beat_listing_drafts', 'marketplace_beat_listing_evidence', 'marketplace_promotions', 'notifications', 'projects', 'social_posts', 'social_post_comments', 'social_post_reactions', 'social_post_reports', 'stripe_connected_accounts', 'stripe_webhook_events']
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
  await repo.saveAccount({ id: managerId, email: emailFor('manager'), passwordHash: hash, role: 'creator', verificationState: 'verified' })
  await repo.saveProfile({ ...emptyProfile(managerId), displayName: 'QA manager', publicProfile: true })
  await repo.saveAccount({ ...(await repo.findAccountById(creatorId))!, planId: 'studio', purchasedPlanIds: ['creator', 'studio'] })
  assert((await repo.findAccountById(creatorId))?.purchasedPlanIds?.join(',') === 'creator,studio', 'No persistió el historial de paquetes adquiridos.')
  const connectedAccount = { accountId: creatorId, stripeAccountId: `acct_${fixturePrefix}`, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, deauthorized: false, updatedAt: new Date().toISOString() }
  await repo.saveStripeConnectAccount(connectedAccount)
  assert((await repo.findStripeConnectAccountByStripeId(connectedAccount.stripeAccountId))?.accountId === creatorId, 'No persistió la cuenta Stripe Connect.')
  assert(await repo.recordProcessedStripeEvent(webhookEventId, 'account.updated'), 'No registró el evento Stripe inicial.')
  assert(!(await repo.recordProcessedStripeEvent(webhookEventId, 'account.updated')) && await repo.hasProcessedStripeEvent(webhookEventId), 'La deduplicación de eventos Stripe no es idempotente.')
  const testOrder = { id: orderId, buyerId: outsiderId, sellerId: creatorId, contentId: randomUUID(), offerId: 'wav', title: 'PostgreSQL QA beat', amountMinor: 2000, commissionMinor: 100, processingEstimateMinor: 94, applicationFeeMinor: 194, sellerNetMinor: 1806, currency: 'usd' as const, status: 'pending' as const, createdAt: new Date().toISOString() }
  await repo.createBeatOrder(testOrder)
  const paidOrder = await repo.updateBeatOrder(orderId, { status: 'paid', stripePaymentIntentId: `pi_${fixturePrefix}`, paidAt: new Date().toISOString() })
  assert(paidOrder?.status === 'paid' && (await repo.findBeatOrderByPaymentIntentId(`pi_${fixturePrefix}`))?.id === orderId, 'No persistió el estado pagado ni la búsqueda de la orden.')
  await startApi()

  let creator = await login(emailFor('creator'))
  const outsider = await login(emailFor('outsider'))
  let response = await request(creator, `/api/chat/conversations/${adminId}/messages`)
  assert(response.status === 403, 'Chat permitió acceso antes de aceptar amistad.')
  response = await request(creator, '/api/friend-requests', 'POST', { targetId: adminId })
  assert(response.status === 201, 'No se creó la solicitud de amistad.')
  const friendship = (await response.json() as { data: { id: string } }).data
  const admin = await login(emailFor('admin'))
  response = await request(admin, `/api/admin/accounts/${managerId}/role`, 'PATCH', { role: 'community_manager' })
  assert(response.status === 200, 'Admin no pudo asignar Community Manager en PostgreSQL.')
  const manager = await login(emailFor('manager'))
  const approveCatalogAsManager = async (contentId: string, note = 'Reviewed the private Beat preview and upload details.') => {
    const result = await request(manager, `/api/staff/catalog-review/${contentId}`, 'POST', { decision: 'approve', note })
    assert(result.status === 200, `Community Manager no pudo aprobar el Beat ${contentId} (${result.status}).`)
  }
  if (hasFfmpeg) {
    const profileImageBytes = await readFile(resolve(process.cwd(), 'server/fixtures/beat-upload-cover-qa.jpg'))
    for (const kind of ['avatar', 'cover'] as const) {
      const savedImage = await fetch(`${base()}/api/profile/images/${kind}`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'image/jpeg' }, body: new Uint8Array(profileImageBytes) })
      assert(savedImage.status === 200, `No se pudo subir el ${kind} de perfil a PostgreSQL (${savedImage.status}).`)
      const result = (await savedImage.json() as { data: { avatarUrl?: string; coverUrl?: string } }).data
      if (kind === 'avatar') profileAvatarUrl = result.avatarUrl || ''
      else profileCoverUrl = result.coverUrl || ''
    }
    assert(profileAvatarUrl === `/api/profiles/${creatorId}/images/avatar/thumbnail` && profileCoverUrl === `/api/profiles/${creatorId}/images/cover/thumbnail`, 'El perfil no guardó las referencias personalizadas al avatar y portada.')
    const publicAvatar = await fetch(`${base()}${profileAvatarUrl}`, { headers: { cookie: outsider.cookie } })
    const publicCover = await fetch(`${base()}${profileCoverUrl}`, { headers: { cookie: outsider.cookie } })
    assert(publicAvatar.status === 200 && publicCover.status === 200, 'El visitante no pudo ver avatar y portada del perfil público.')
    const privateProfile = await request(creator, '/api/profile', 'PUT', { displayName: 'QA creator', bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'custom', avatarId: 'custom', publicProfile: false })
    assert(privateProfile.status === 200, 'No se pudo cambiar la privacidad del perfil con medios personalizados.')
    const hiddenAvatar = await fetch(`${base()}${profileAvatarUrl}`, { headers: { cookie: outsider.cookie } })
    const hiddenCover = await fetch(`${base()}${profileCoverUrl}`, { headers: { cookie: outsider.cookie } })
    const ownerAvatar = await fetch(`${base()}${profileAvatarUrl}`, { headers: { cookie: creator.cookie } })
    assert(hiddenAvatar.status === 404 && hiddenCover.status === 404 && ownerAvatar.status === 200, 'La privacidad del perfil no protegió sus imágenes del visitante o bloqueó al dueño.')
    const publicProfile = await request(creator, '/api/profile', 'PUT', { displayName: 'QA creator', bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'custom', avatarId: 'custom', publicProfile: true })
    assert(publicProfile.status === 200, 'No se pudo volver a publicar el perfil QA.')
  } else {
    console.log('SKIP: PostgreSQL avatar/cover upload and image backup/restore (FFmpeg unavailable).')
  }
  response = await request(admin, '/api/admin/promotions', 'POST', { name: 'Postgres launch', scope: 'one-shot', percentOff: 10, enabled: true })
  assert(response.status === 201, 'Admin no pudo crear la promoción en PostgreSQL.')
  const promotion = (await response.json() as { data: { id: string; scope: string; percentOff: number } }).data
  assert(promotion.scope === 'one-shot' && promotion.percentOff === 10, 'La promoción no persistió su categoría/descuento en PostgreSQL.')
  const promotions = (await request(admin, '/api/admin/promotions').then(value => value.json()) as { data: Array<{ id: string }> }).data
  assert(promotions.some(item => item.id === promotion.id), 'No se pudo leer la promoción persistida en PostgreSQL.')
  response = await request(admin, `/api/admin/promotions/${promotion.id}`, 'DELETE')
  assert(response.status === 200, 'No se pudo eliminar la promoción de QA PostgreSQL.')
  response = await request(admin, `/api/admin/accounts/${creatorId}/plan`, 'PATCH', { planId: 'creator' })
  assert(response.status === 200, 'Admin no pudo asignar un paquete de prueba en PostgreSQL.')
  const creatorPlan = (await request(creator, '/api/account/plan').then(value => value.json()) as { data: { planId: string; plan: { storageLimitBytes: number | null } } }).data
  const creatorPlanStorage = (await request(creator, '/api/account/storage').then(value => value.json()) as { data: { limitBytes: number | null; quotaSource: string } }).data
  assert(creatorPlan.planId === 'creator' && creatorPlan.plan.storageLimitBytes === 100000 && creatorPlanStorage.limitBytes === 100000 && creatorPlanStorage.quotaSource === 'plan', 'El paquete o su cuota configurada no persistieron en PostgreSQL.')
  response = await request(admin, `/api/admin/accounts/${creatorId}/plan`, 'PATCH', { planId: 'free' })
  assert(response.status === 200, 'No se pudo restaurar el paquete Free de la cuenta QA.')
  response = await request(admin, `/api/friend-requests/${friendship.id}/accept`, 'POST', {})
  assert(response.status === 200, 'No se pudo aceptar la amistad.')
  const creatorFriendNotifications = (await request(creator, '/api/notifications').then(value => value.json()) as { data: { items: Array<{ type: string }> } }).data.items
  const adminFriendNotifications = (await request(admin, '/api/notifications').then(value => value.json()) as { data: { items: Array<{ type: string }> } }).data.items
  assert(creatorFriendNotifications.some(item => item.type === 'friend_request_accepted') && adminFriendNotifications.some(item => item.type === 'friend_request'), 'Las notificaciones de solicitud/aceptación no se persistieron en PostgreSQL.')
  response = await request(creator, `/api/chat/conversations/${adminId}/messages`, 'POST', { body: 'PostgreSQL QA message' }, false)
  assert(response.status === 403, 'Chat permitió envío sin CSRF.')

  response = await request(creator, '/api/posts', 'POST', { kind: 'status', body: 'PostgreSQL creator profile post', audience: 'public' })
  assert(response.status === 201, `No se publicó el estado público de QA (${response.status}).`)
  socialPostId = (await response.json() as { data: { id: string } }).data.id
  const socialFeed = (await request(outsider, '/api/feed').then(value => value.json()) as { data: { posts: Array<{ id: string }> } }).data.posts
  const socialProfile = (await request(outsider, `/api/profiles/${creatorId}/posts`).then(value => value.json()) as { data: { posts: Array<{ id: string }> } }).data.posts
  assert(socialFeed.some(post => post.id === socialPostId) && socialProfile.some(post => post.id === socialPostId), 'El post público no se sincronizó entre Home/feed y el perfil del creador.')
  await pool.query('DROP TRIGGER IF EXISTS beatvault_qa_reject_notification ON notifications')
  await pool.query(`CREATE OR REPLACE FUNCTION beatvault_qa_reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA notification write failure' USING ERRCODE = '23514'; END $$`)
  await pool.query('CREATE TRIGGER beatvault_qa_reject_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION beatvault_qa_reject_notification()')
  try {
    response = await request(outsider, `/api/posts/${socialPostId}/comments`, 'POST', { body: 'This comment must roll back' })
    assert(response.status === 500, 'La inserción artificialmente fallida de una notificación no devolvió error.')
    const rolledBackComment = await pool.query('SELECT id FROM social_post_comments WHERE post_id = $1 AND body = $2', [socialPostId, 'This comment must roll back'])
    assert(rolledBackComment.rows.length === 0, 'El comentario sobrevivió al fallo de la inserción de su notificación PostgreSQL.')
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS beatvault_qa_reject_notification ON notifications')
    await pool.query('DROP FUNCTION IF EXISTS beatvault_qa_reject_notification()')
  }
  response = await request(outsider, `/api/posts/${socialPostId}/comments`, 'POST', { body: socialPostComment })
  assert(response.status === 201, `La segunda cuenta no pudo comentar el post (${response.status}).`)
  response = await request(outsider, `/api/posts/${socialPostId}/reaction`, 'POST', {})
  assert(response.status === 200 && (await response.json() as { data: { reacted: boolean; reactionCount: number } }).data.reacted, 'La segunda cuenta no pudo reaccionar al post PostgreSQL.')
  const creatorInteraction = (await request(creator, `/api/posts/${socialPostId}/social`).then(value => value.json()) as { data: { comments: Array<{ authorName: string; body: string }>; reactionCount: number; reactedByMe: boolean } }).data
  assert(creatorInteraction.comments.some(comment => comment.authorName === 'QA outsider' && comment.body === socialPostComment) && creatorInteraction.reactionCount === 1 && !creatorInteraction.reactedByMe, 'La interacción no se compartió correctamente entre cuentas en PostgreSQL.')
  const creatorSocialNotifications = (await request(creator, '/api/notifications').then(value => value.json()) as { data: { items: Array<{ type: string }> } }).data.items
  assert(creatorSocialNotifications.some(item => item.type === 'social_post_comment') && creatorSocialNotifications.some(item => item.type === 'social_post_reaction'), 'Los comentarios/reacciones no crearon avisos persistentes en PostgreSQL.')
  response = await request(outsider, `/api/posts/${socialPostId}/reaction`, 'POST', {})
  assert(response.status === 200 && !(await response.json() as { data: { reacted: boolean } }).data.reacted, 'Quitar una reacción no devolvió el estado inactivo.')
  response = await request(outsider, `/api/posts/${socialPostId}/reaction`, 'POST', {})
  assert(response.status === 200 && (await response.json() as { data: { reacted: boolean } }).data.reacted, 'No se pudo reactivar una reacción PostgreSQL.')
  const notificationCountAfterRetry = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1 AND actor_id = $2 AND type = 'social_post_reaction' AND resource_id = $3", [creatorId, outsiderId, socialPostId])
  assert(notificationCountAfterRetry.rows[0]?.count === 1, 'Reactivar la misma reacción duplicó la notificación PostgreSQL.')
  response = await request(creator, '/api/posts', 'POST', { kind: 'status', body: 'Private profile post', audience: 'private' })
  assert(response.status === 201, 'No se creó el estado privado PostgreSQL.')
  const privateSocialPostId = (await response.json() as { data: { id: string } }).data.id
  response = await request(outsider, `/api/posts/${privateSocialPostId}/social`)
  assert(response.status === 404, 'Un usuario distinto pudo consultar interacciones de un post privado.')
  response = await request(creator, '/api/posts', 'POST', { kind: 'status', body: 'PostgreSQL reported moderation post', audience: 'public' })
  assert(response.status === 201, 'No se creó el estado reportable para moderación PostgreSQL.')
  const moderationPostId = (await response.json() as { data: { id: string } }).data.id
  response = await request(outsider, `/api/posts/${moderationPostId}/reports`, 'POST', { reason: 'spam', details: 'PostgreSQL moderation QA report.' })
  assert(response.status === 201, 'La segunda cuenta no pudo reportar el post público en PostgreSQL.')
  const openReports = (await request(manager, '/api/social-moderation/reports').then(value => value.json()) as { data: { reports: Array<{ id: string; postId: string }> } }).data.reports
  const moderationReport = openReports.find(report => report.postId === moderationPostId)
  assert(moderationReport, 'Community Manager no recibió el reporte PostgreSQL.')
  response = await request(manager, `/api/social-moderation/posts/${moderationPostId}`, 'PATCH', { status: 'removed', note: 'Confirmed by PostgreSQL QA.' })
  assert(response.status === 200, 'Community Manager no pudo retirar una publicación reportada en PostgreSQL.')
  response = await request(manager, `/api/social-moderation/reports/${moderationReport.id}`, 'PATCH', { status: 'reviewed' })
  assert(response.status === 200 && (await request(outsider, `/api/posts/${moderationPostId}/social`)).status === 404, 'La moderación no ocultó el post o no registró la revisión del reporte.')

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
  const artworkBytes = await readFile(join(apiDir, 'server', 'fixtures', 'beat-upload-cover.jpg'))
  response = await request(admin, `/api/admin/accounts/${creatorId}/storage-quota`, 'PATCH', { limitBytes: 3_000_000 })
  assert(response.status === 200, 'No se pudo asignar cuota temporal suficiente para probar el artwork 4K y su miniatura.')
  const usageBeforeArtwork = (await request(creator, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number } }).data.usedBytes
  response = await fetch(`${base()}/api/assets/${asset.id}/artwork`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'image/jpeg' }, body: new Uint8Array(artworkBytes) })
  assert(response.status === 201, `No se pudo guardar el artwork antes de crear su ficha (${response.status}).`)
  const artworkUpload = (await response.json() as { data: { assetId: string; width: number; height: number; thumbnailAvailable: boolean; thumbnailSizeBytes: number } }).data
  assert(artworkUpload.assetId === asset.id && artworkUpload.width === 4000 && artworkUpload.height === 4000, 'La API no devolvió los metadatos correctos del artwork 4K.')
  const usageWithArtwork = (await request(creator, '/api/account/storage').then(value => value.json()) as { data: { usedBytes: number } }).data.usedBytes
  assert(usageWithArtwork === usageBeforeArtwork + artworkBytes.length + artworkUpload.thumbnailSizeBytes, 'El original y la miniatura no se incluyeron correctamente en el consumo de cuota PostgreSQL.')
  response = await fetch(`${base()}/api/assets/${asset.id}/artwork`, { method: 'POST', headers: { cookie: outsider.cookie, 'x-csrf-token': outsider.csrf, 'content-type': 'image/jpeg' }, body: new Uint8Array(artworkBytes) })
  assert(response.status === 404, 'Otra cuenta pudo agregar artwork al audio privado.')
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
      assert(approved.status === 200, `Admin no pudo aprobar independientemente el preview de ${extension}.`)
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
  const previewCatalog = (await response.json() as { data: { contentId: string; assetId?: string; artworkUrl?: string; audio?: { previewReady?: boolean } } }).data
  assert(previewCatalog.artworkUrl === `/api/catalog/${previewCatalog.contentId}/artwork${artworkUpload.thumbnailAvailable ? '/thumbnail' : ''}`, 'El artwork privado no se adjuntó a la ficha en revisión con su resolución de lista.')
  response = await fetch(`${base()}${previewCatalog.artworkUrl}`, { headers: { cookie: creator.cookie } })
  assert(response.status === 200 && response.headers.get('cache-control') === 'private, no-store' && (!artworkUpload.thumbnailAvailable || response.headers.get('content-type') === 'image/webp'), 'El propietario no pudo ver su artwork privado durante revisión.')
  const staffQueue = (await request(manager, '/api/staff/catalog-review').then(value => value.json()) as { data: Array<{ contentId: string; artworkUrl?: string }> }).data
  const staffEntry = staffQueue.find(item => item.contentId === previewCatalog.contentId)
  assert(staffEntry?.artworkUrl === `/api/staff/catalog-review/${previewCatalog.contentId}/artwork${artworkUpload.thumbnailAvailable ? '/thumbnail' : ''}`, 'La cola CM no recibió la ruta privada de la miniatura.')
  response = await fetch(`${base()}${staffEntry.artworkUrl}`, { headers: { cookie: manager.cookie } })
  assert(response.status === 200 && response.headers.get('cache-control') === 'private, no-store', 'El CM no pudo consultar el artwork privado de la subida pendiente.')
  response = await fetch(`${base()}${staffEntry.artworkUrl}`, { headers: { cookie: outsider.cookie } })
  assert(response.status === 403, 'La ruta de artwork privado no rechazó la cuenta sin rol de revisión.')
  response = await fetch(`${base()}${previewCatalog.artworkUrl}`, { headers: { cookie: outsider.cookie } })
  assert(response.status === 404, 'Otra cuenta pudo ver artwork de un Beat en revisión.')
  const listingInput = {
    description: 'A complete PostgreSQL QA listing description.', genre: 'Hip-Hop', explicitContent: false,
    rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'licensed', sampleSource: 'Licensed QA sample', sampleProofAvailable: false, collaborators: [], declarationAccepted: true },
    offers: [{ id: 'wav', label: 'WAV license', amountMinor: 2000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Commercial use for one released track.', termsVersion: draftOfferTermsVersion, status: 'draft-only' }],
  }
  response = await request(creator, `/api/seller/beat-listings/${previewCatalog.contentId}`, 'PUT', listingInput)
  assert(response.status === 201, 'El creador no pudo crear su borrador privado de venta en PostgreSQL.')
  let listing = (await response.json() as { data: BeatListingRecord }).data
  assert((await repo.findBeatListingDraft(listing.contentId, creatorId))?.offers[0]?.amountMinor === 2000, 'No persistió el borrador de venta del beat.')
  const evidenceForm = new FormData()
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')
  evidenceForm.append('file', new Blob([new Uint8Array(pdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' }), 'qa-rights-proof.pdf')
  response = await fetch(`${base()}/api/seller/beat-listings/${listing.contentId}/evidence`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf }, body: evidenceForm })
  const evidenceResponse = await response.json() as { data?: { id: string; originalName: string }; error?: { code?: string } }
  assert(response.status === 201, `El creador no pudo subir evidencia privada de derechos en PostgreSQL (${response.status}: ${evidenceResponse.error?.code || 'sin detalle'}).`)
  const evidence = evidenceResponse.data!
  assert(evidence.originalName === 'qa-rights-proof.pdf' && (await repo.listSellerEvidence(listing.contentId, creatorId)).some(item => item.id === evidence.id), 'La evidencia de derechos no persistió en PostgreSQL.')
  response = await fetch(`${base()}/api/seller/beat-listings/${listing.contentId}/evidence`, { headers: { cookie: outsider.cookie } })
  assert(response.status === 404, 'Otra cuenta pudo consultar la evidencia privada del vendedor.')
  response = await request(creator, `/api/seller/beat-listings/${listing.contentId}`, 'PUT', { ...listingInput, rights: { ...listingInput.rights, sampleProofAvailable: true } })
  assert(response.status === 200, 'El creador no pudo completar el listing tras aportar evidencia.')
  listing = (await response.json() as { data: BeatListingRecord }).data
  response = await request(manager, '/api/staff/marketplace-review')
  const managerQueue = (await response.json() as { data: Array<{ listing: BeatListingRecord; readyForFinalReview: boolean; evidence: Array<{ id: string }> }> }).data
  const managerItem = managerQueue.find(item => item.listing.contentId === listing.contentId)
  assert(response.status === 200 && managerItem?.readyForFinalReview && managerItem.evidence.some(item => item.id === evidence.id), 'Community Manager no pudo revisar ficha y evidencia en PostgreSQL.')
  response = await fetch(`${base()}/api/staff/marketplace-review/${listing.contentId}/evidence/${evidence.id}`, { headers: { cookie: manager.cookie } })
  assert(response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(pdfBytes) && response.headers.get('cache-control') === 'no-store', 'Community Manager no pudo descargar evidencia privada con controles de caché.')
  response = await request(admin, `/api/admin/marketplace-listings/${listing.contentId}`, 'POST', { decision: 'approve', note: 'Approved before community review.' })
  const prematureApproval = await response.json() as { error?: { code?: string } }
  assert(response.status === 409 && prematureApproval.error?.code === 'COMMUNITY_RECOMMENDATION_REQUIRED', 'El admin aprobó una ficha sin recomendación Community Manager vigente.')
  response = await request(manager, `/api/staff/marketplace-review/${listing.contentId}`, 'POST', { decision: 'recommend', note: 'Rights evidence and revenue shares reviewed.' })
  assert(response.status === 200, 'Community Manager no pudo recomendar la ficha lista.')
  response = await request(admin, '/api/admin/marketplace-listings')
  const adminReviewQueue = (await response.json() as { data: Array<{ listing: BeatListingRecord; recommendationCurrent: boolean; latestRecommendation?: { decision: string; reviewerId: string } }> }).data
  const recommendedItem = adminReviewQueue.find(item => item.listing.contentId === listing.contentId)
  assert(response.status === 200 && recommendedItem?.recommendationCurrent && recommendedItem.latestRecommendation?.decision === 'recommend' && recommendedItem.latestRecommendation.reviewerId === managerId, `La API no reconstruyó la recomendación recién guardada (${JSON.stringify(recommendedItem)}).`)
  response = await request(manager, `/api/admin/marketplace-listings/${listing.contentId}`, 'POST', { decision: 'approve', note: 'Manager cannot finalize approval.' })
  assert(response.status === 403, 'Community Manager pudo realizar la decisión final de admin.')
  response = await request(admin, `/api/admin/marketplace-listings/${listing.contentId}`, 'POST', { decision: 'approve', note: 'Rights declaration reviewed for QA.' })
  const finalDecision = await response.json() as { error?: { code?: string; message?: string } }
  assert(response.status === 200, `Admin no pudo aprobar tras recomendación vigente de CM (${response.status}: ${finalDecision.error?.code || finalDecision.error?.message || 'sin detalle'}).`)
  response = await request(creator, `/api/seller/beat-listings/${listing.contentId}`)
  const sellerReview = (await response.json() as { data: BeatListingRecord }).data.adminReview
  assert(response.status === 200 && sellerReview?.decision === 'approve' && sellerReview.current, 'El vendedor no recibió el estado de aprobación vigente.')
  const outsiderCatalogAfterReview = (await request(outsider, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string; purchaseOffers?: unknown[] }> } }).data.entries
  assert(!outsiderCatalogAfterReview.some(item => item.contentId === listing.contentId), 'La revisión de intake publicó el beat antes de la aprobación de catálogo.')
  await delay(5)
  response = await request(creator, `/api/seller/beat-listings/${listing.contentId}`, 'PUT', { ...listingInput, description: `${listingInput.description} Revised after review.` , rights: { ...listingInput.rights, sampleProofAvailable: true } })
  assert(response.status === 200, 'El creador no pudo actualizar su ficha después de revisión.')
  response = await request(creator, `/api/seller/beat-listings/${listing.contentId}`)
  const staleReview = (await response.json() as { data: BeatListingRecord }).data
  assert(staleReview.communityReview?.current === false && staleReview.adminReview?.current === false, 'Editar la ficha no invalidó las decisiones de revisión anteriores.')
  response = await request(admin, `/api/admin/marketplace-listings/${listing.contentId}`, 'POST', { decision: 'approve', note: 'Must wait for a new CM review.' })
  const staleApproval = await response.json() as { error?: { code?: string } }
  assert(response.status === 409 && staleApproval.error?.code === 'COMMUNITY_RECOMMENDATION_REQUIRED', 'El admin aprobó usando una recomendación obsoleta.')
  const hasProcessedPreview = Boolean(asset.previewStorageKey)
  if (hasProcessedPreview) {
    assert(previewCatalog.audio?.previewReady === true, 'La API no informó que el derivado está listo al dueño.')
    const cmQueue = (await request(manager, '/api/staff/catalog-review').then(value => value.json()) as { data: Array<{ contentId: string; previewAvailable: boolean }> }).data
    assert(cmQueue.some(item => item.contentId === previewCatalog.contentId && item.previewAvailable), 'Community Manager no recibió el Beat en su cola privada con preview disponible.')
    const privatePreview = await fetch(`${base()}/api/staff/catalog-review/${previewCatalog.contentId}/preview`, { headers: { cookie: manager.cookie } })
    assert(privatePreview.status === 200 && privatePreview.headers.get('cache-control') === 'no-store' && privatePreview.headers.get('content-type') === 'audio/mp4', 'El preview de revisión del CM no fue privado o no se pudo reproducir.')
    const creatorOnly = await fetch(`${base()}/api/staff/catalog-review/${previewCatalog.contentId}/preview`, { headers: { cookie: outsider.cookie } })
    assert(creatorOnly.status === 403, 'Una cuenta sin rol de staff pudo escuchar el preview privado de revisión.')
    await approveCatalogAsManager(previewCatalog.contentId)
    const managerPublished = await request(outsider, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string }> } }
    assert(managerPublished.data.entries.some(item => item.contentId === previewCatalog.contentId), 'La aprobación del CM no publicó independientemente el Beat.')
    response = await request(admin, `/api/admin/catalog-review/${previewCatalog.contentId}`, 'POST', { decision: 'approve' })
    assert(response.status === 409, 'La cola permitió una segunda decisión después de publicar por CM.')
    const publicEntry = (await request(outsider, '/api/catalog').then(value => value.json()) as { data: { entries: Array<{ contentId: string; assetId?: string; previewUrl?: string }> } }).data.entries.find(item => item.contentId === previewCatalog.contentId)
    assert(publicEntry?.previewUrl === `/api/catalog/${previewCatalog.contentId}/preview` && publicEntry.assetId === undefined, 'El catálogo no expuso únicamente la URL derivada.')
    response = await fetch(`${base()}${publicEntry.previewUrl}`)
    const derivative = Buffer.from(await response.arrayBuffer())
    assert(response.status === 200 && response.headers.get('content-type') === 'audio/mp4' && derivative.toString('ascii', 4, 8) === 'ftyp' && derivative.length < wav.length, 'El endpoint público no entregó el derivado M4A esperado.')
  } else {
    const communityFailure = await request(manager, `/api/staff/catalog-review/${previewCatalog.contentId}`, 'POST', { decision: 'approve', note: 'Reviewed the uploaded audio preview.' })
    const communityFailureBody = await communityFailure.json() as { error?: { code?: string } }
    assert(communityFailure.status === 409 && communityFailureBody.error?.code === 'PROCESSED_PREVIEW_REQUIRED', 'El CM aprobó un audio sin preview procesado.')
    response = await request(admin, `/api/admin/catalog-review/${previewCatalog.contentId}`, 'POST', { decision: 'approve' })
    const failure = await response.json() as { error?: { code?: string } }
    assert(response.status === 409 && failure.error?.code === 'PROCESSED_PREVIEW_REQUIRED', 'Se aprobó un audio sin derivado procesado.')
    response = await fetch(`${base()}/api/catalog/${previewCatalog.contentId}/preview`)
    assert(response.status === 404, 'El beat pendiente se expuso públicamente sin derivado.')
  }

  response = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} concurrent`, type: 'one-shot', tagIds: [], publicationStatus: 'pending-review' })
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
  response = await request(creator, '/api/catalog', 'POST', { title: `${fixturePrefix} CM rejected`, type: 'beat', tagIds: [], publicationStatus: 'pending-review' })
  assert(response.status === 201, 'No se creó el Beat para probar la decisión independiente del CM.')
  const communityRejected = (await response.json() as { data: { contentId: string } }).data
  response = await request(manager, `/api/staff/catalog-review/${communityRejected.contentId}`, 'POST', { decision: 'reject', note: 'Metadata requires correction.' })
  assert(response.status === 200, 'Community Manager no pudo rechazar independientemente una subida.')
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
  response = await request(creator, '/api/account/plan')
  assert(response.status === 200, 'La sesión PostgreSQL no sobrevivió al reinicio de la API.')
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
  const uploadReviewAudit = await pool.query<{ community: number; admin: number }>("SELECT count(*) FILTER (WHERE action = 'catalog_community_decision' AND actor_id = $1)::int AS community, count(*) FILTER (WHERE action = 'catalog_admin_decision' AND actor_id = $2)::int AS admin FROM audit_events WHERE target_id = ANY($3::text[])", [managerId, adminId, [communityRejected.contentId, rejected.contentId]])
  assert(uploadReviewAudit.rows[0].community >= 1 && uploadReviewAudit.rows[0].admin >= 1, 'No persistieron por separado decisiones independientes de CM y admin sobre subidas.')
  const intakeAudit = await pool.query<{ recommendations: number; decisions: number }>("SELECT count(*) FILTER (WHERE action = 'marketplace_review_recommendation' AND actor_id = $1)::int AS recommendations, count(*) FILTER (WHERE action = 'marketplace_admin_decision' AND actor_id = $2)::int AS decisions FROM audit_events WHERE target_id = $3", [managerId, adminId, previewCatalog.contentId])
  assert(intakeAudit.rows[0].recommendations >= 1 && intakeAudit.rows[0].decisions >= 1, 'No persistieron por separado la recomendación CM y decisión final admin en PostgreSQL.')
  const thumbnailResponse = artworkUpload.thumbnailAvailable ? await fetch(`${base()}${previewCatalog.artworkUrl}`, { headers: { cookie: creator.cookie } }) : undefined
  const thumbnailBytes = thumbnailResponse?.ok ? Buffer.from(await thumbnailResponse.arrayBuffer()) : undefined
  if (artworkUpload.thumbnailAvailable) assert(thumbnailBytes && thumbnailBytes.length === artworkUpload.thumbnailSizeBytes && thumbnailBytes.length < artworkBytes.length, 'La miniatura no redujo el peso transferido del artwork.')
  await verifyBackupRestore(asset.id, previewCatalog.contentId, wav, artworkBytes, thumbnailBytes, socialPostId)
  console.log('PASS: PostgreSQL auth/chat/SSE, creator profile avatar/cover and privacy, transactional notifications and rollback/deduplication, feed/profile sync, social interactions and CM moderation, quota race, audio formats and limits, private Beat artwork/audio review, independent CM/admin Beat approval, and seller listing/evidence review.')
} finally {
  await stopApi()
  try {
    await pool.query('DELETE FROM stripe_webhook_events WHERE event_id = $1', [webhookEventId])
    await pool.query('DELETE FROM beat_orders WHERE id = $1', [orderId])
    await pool.query('DELETE FROM account_storage_quotas WHERE owner_id = ANY($1::text[]) OR updated_by = ANY($1::text[])', [[creatorId, adminId, outsiderId, quotaId]])
    await pool.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [[creatorId, adminId, outsiderId, managerId, quotaId]])
  } catch (error) {
    console.error('QA cleanup warning; the test database may already be unavailable:', error)
  }
  await pool.end()
  await rm(uploadsDir, { recursive: true, force: true })
}
