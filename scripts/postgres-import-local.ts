import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { PostgresRepository } from '../server/postgres'
import type { Account } from '../server/auth'

// Run only after stopping the JSON API and backing up data/server-local and data/uploads.
// The target must be empty. No source files or passwords are changed.
const c = JSON.parse(await readFile('.tools/postgresql/local-config.json', 'utf8'))
if (c.host !== '127.0.0.1' || c.database !== 'beatvault_local' || c.active) throw new Error('Import requires the inactive local database.')
const source = resolve('data/server-local')
const pool = new Pool({ connectionString: `postgresql://${encodeURIComponent(c.appUser)}:${encodeURIComponent(c.appPassword)}@${c.host}:${c.port}/${c.database}`, max: 1 })
const client = await pool.connect()
const repository = new PostgresRepository({ query: client.query.bind(client) })
const counts: Record<string, number> = {}
const archived: Array<{ file: string; index: number; reason: string }> = []
const files = (await readdir(source)).filter(name => name.endsWith('.json')).sort()
const supported = new Set(['accounts.json', 'assets.json', 'audit.json', 'auth-sessions.json', 'catalog.json', 'friendships.json', 'notification-outbox.json', 'notifications.json', 'profiles.json', 'projects.json', 'social-activities.json', 'social-comments.json', 'social-follows.json', 'social-reactions.json', 'social-stories.json'])
const snapshots = new Map<string, string>()
for (const file of files) {
  const raw = await readFile(resolve(source, file), 'utf8')
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error(`Expected an array: ${file}`)
  if (!supported.has(file) && value.length) throw new Error(`Unmapped nonempty source: ${file}`)
  snapshots.set(file, raw)
}
function rows<T>(file: string): T[] { return JSON.parse(snapshots.get(file) || '[]') as T[] }
async function copy<T>(file: string, action: (row: T) => Promise<unknown>) {
  let index = 0
  for (const row of rows<T>(file)) {
    try { await action(row) } catch (error) { throw new Error(`Import failed: ${file} row ${index}; transaction rolled back.`, { cause: error }) }
    index++
  }
  counts[file] = index
}
try {
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(847291361)')
  const existing = await client.query('SELECT id FROM accounts LIMIT 1')
  if (existing.rows.length) throw new Error('Target already contains accounts; refusing to overwrite data.')
  await client.query('CREATE TABLE beatvault_local_import_sources (file_name text PRIMARY KEY, sha256 text NOT NULL, source_json jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now())')
  await client.query('CREATE TABLE beatvault_local_legacy_records (source_file text NOT NULL, row_index integer NOT NULL, reason text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(source_file,row_index))')
  for (const [file, raw] of snapshots) await client.query('INSERT INTO beatvault_local_import_sources(file_name,sha256,source_json) VALUES($1,$2,$3::jsonb)', [file, createHash('sha256').update(raw).digest('hex'), raw])
  await copy<Account>('accounts.json', row => repository.saveAccount({ ...row, verificationState: row.verificationState || 'unverified' }))
  const accountIds = new Set(rows<Account>('accounts.json').map(row => row.id))
  type Asset = Parameters<typeof repository.createAsset>[0]
  const assets = rows<Asset>('assets.json')
  counts['assets.json'] = 0
  for (const [index, row] of assets.entries()) {
    if (!accountIds.has(row.ownerId)) {
      const reason = 'Legacy asset owner does not exist; preserved without assigning ownership.'
      await client.query('INSERT INTO beatvault_local_legacy_records VALUES($1,$2,$3,$4::jsonb)', ['assets.json', index, reason, JSON.stringify(row)])
      archived.push({ file: 'assets.json', index, reason })
    } else { await repository.createAsset(row); counts['assets.json']++ }
  }
  await copy<Parameters<typeof repository.createProject>[0]>('projects.json', row => repository.createProject(row))
  await copy<Parameters<typeof repository.createCatalog>[0]>('catalog.json', row => repository.createCatalog(row))
  await copy<Parameters<typeof repository.saveProfile>[0]>('profiles.json', row => repository.saveProfile(row))
  await copy<Parameters<typeof repository.createFriendship>[0]>('friendships.json', row => repository.createFriendship(row))
  await copy<Parameters<typeof repository.createSocialComment>[0]>('social-comments.json', row => repository.createSocialComment(row))
  await copy<Parameters<typeof repository.recordSocialActivity>[0]>('social-activities.json', row => repository.recordSocialActivity(row))
  await copy<{ contentId: string; actorId: string; createdAt: string }>('social-reactions.json', row => client.query('INSERT INTO catalog_reactions(content_id,actor_id,created_at) VALUES($1,$2,$3)', [row.contentId, row.actorId, row.createdAt]))
  await copy<{ followerId: string; followingId: string; createdAt: string }>('social-follows.json', row => client.query('INSERT INTO social_account_follows(follower_id,following_id,created_at) VALUES($1,$2,$3)', [row.followerId, row.followingId, row.createdAt]))
  await copy<Parameters<typeof repository.createNotification>[0]>('notifications.json', row => repository.createNotification(row))
  await copy<Parameters<typeof repository.createSession>[0]>('auth-sessions.json', row => repository.createSession(row))
  for (const file of ['notification-outbox.json', 'social-stories.json']) {
    if (rows(file).length) throw new Error(`Source ${file} is no longer empty; add its explicit mapping before importing.`)
    counts[file] = 0
  }
  type Audit = { id: string; timestamp: string; action: string; requestId: string; actorId?: string; targetId?: string; success: boolean; metadata: unknown }
  await copy<Audit>('audit.json', row => client.query('INSERT INTO audit_events(id,timestamp,action,request_id,actor_id,target_id,success,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [row.id, row.timestamp, row.action, row.requestId, row.actorId || null, row.targetId || null, row.success, JSON.stringify(row.metadata || {})]))
  for (const row of rows<Account>('accounts.json')) {
    const stored = await repository.findAccountById(row.id)
    if (!stored || stored.passwordHash !== row.passwordHash || stored.role !== row.role || stored.email !== row.email) throw new Error('Account identity verification failed.')
  }
  // A concurrent JSON write invalidates this snapshot instead of being silently lost.
  for (const [file, raw] of snapshots) if (await readFile(resolve(source, file), 'utf8') !== raw) throw new Error(`Source changed during import: ${file}`)
  await client.query('COMMIT')
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/postgres-local-import.json', JSON.stringify({ importedAt: new Date().toISOString(), counts, archived, accountHashesPreserved: true }, null, 2))
  console.log(JSON.stringify({ counts, archived: archived.length, accountHashesPreserved: true }))
} catch (error) { await client.query('ROLLBACK'); throw error }
finally { client.release(); await pool.end() }
