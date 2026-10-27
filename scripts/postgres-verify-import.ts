import { randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { Pool } from 'pg'

const c = JSON.parse(await readFile('.tools/postgresql/local-config.json', 'utf8'))
if (c.host !== '127.0.0.1' || c.database !== 'beatvault_local' || c.active) throw new Error('Verification requires the inactive local import.')
const uploadDirectory = resolve(process.env.BEATVAULT_UPLOAD_DIR || 'data/uploads')
const restoredName = `beatvault_test_import_${randomUUID().replaceAll('-', '')}`
const connection = (database: string) => `postgresql://${encodeURIComponent(c.adminUser)}:${encodeURIComponent(c.adminPassword)}@${c.host}:${c.port}/${database}`
const original = new Pool({ connectionString: connection(c.database), max: 1 })
const restored = new Pool({ connectionString: connection(restoredName), max: 1 })
const backup = JSON.parse(await readFile('artifacts/postgres-last-backup.json', 'utf8')).output as string
const backupRelative = relative(resolve('backups'), resolve(backup))
if (isAbsolute(backupRelative) || backupRelative.startsWith(`..${sep}`) || backupRelative === '..') throw new Error('Backup must be in the local backups folder.')
function pg(tool: string, args: string[]) {
  const result = spawnSync(resolve(`.tools/postgresql/pgsql/bin/${tool}.exe`), ['-h', c.host, '-p', String(c.port), '-U', c.adminUser, ...args], { env: { ...process.env, PGPASSWORD: c.adminPassword }, encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error(`${tool} failed.`, { cause: result.error || result.stderr })
}
let created = false
try {
  pg('createdb', [restoredName]); created = true
  pg('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '-d', restoredName, backup])
  const tables = (await original.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename)
  const counts: Record<string, number> = {}
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Unexpected table identifier.')
    const sql = `SELECT to_jsonb(t)::text AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`
    const before = (await original.query<{ row: string }>(sql)).rows.map(row => row.row)
    const after = (await restored.query<{ row: string }>(sql)).rows.map(row => row.row)
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Restore mismatch: ${table}`)
    counts[table] = before.length
  }
  const snapshots = await original.query<{ file_name: string; sha256: string }>('SELECT file_name,sha256 FROM beatvault_local_import_sources')
  for (const row of snapshots.rows) {
    if (!/^[a-z-]+\.json$/.test(row.file_name)) throw new Error('Invalid source filename.')
    const raw = await readFile(resolve('data/server-local', row.file_name))
    if (createHash('sha256').update(raw).digest('hex') !== row.sha256) throw new Error(`JSON snapshot changed: ${row.file_name}`)
  }
  const assets = await restored.query<{ storage_key: string; content_hash: string; size_bytes: string }>("SELECT storage_key,content_hash,size_bytes FROM assets WHERE state='available'")
  for (const asset of assets.rows) {
    const path = resolve(uploadDirectory, asset.storage_key)
    const within = relative(uploadDirectory, path)
    if (isAbsolute(within) || within.startsWith(`..${sep}`) || within === '..') throw new Error('Asset path escapes uploads.')
    const bytes = await readFile(path)
    if (bytes.length !== Number(asset.size_bytes) || createHash('sha256').update(bytes).digest('hex') !== asset.content_hash) throw new Error('Original audio integrity mismatch.')
  }
  const role = (await original.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', [c.appUser])).rows[0]
  if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole) throw new Error('App role has excessive administrative privileges.')
  await writeFile('artifacts/postgres-import-restore.json', JSON.stringify({ verifiedAt: new Date().toISOString(), backup, tables: counts, exactRowsPreserved: true, jsonSourceUnchanged: true, originalAudioHashesVerified: assets.rows.length, appRoleRestricted: true }, null, 2))
  console.log(`PASS: exact restore of ${tables.length} tables, unchanged JSON source, ${assets.rows.length} original audio hashes and restricted app role.`)
} finally {
  await restored.end(); await original.end()
  if (created) pg('dropdb', [restoredName])
}
