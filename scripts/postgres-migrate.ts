import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Pool } from 'pg'

export async function migrateLocalDatabase(connectionString: string, through = 999) {
  const url = new URL(connectionString)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^beatvault_(local|test_[a-zA-Z0-9_]+|audit_[a-zA-Z0-9_]+)$/.test(url.pathname.slice(1))) throw new Error('Migration is restricted to named local BeatVault databases.')
  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(847291361)')
    await client.query('CREATE TABLE IF NOT EXISTS beatvault_schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
    const directory = resolve('db/migrations')
    const files = (await readdir(directory)).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file) && Number(file.slice(0, 3)) <= through).sort()
    for (const file of files) {
      const sql = await readFile(resolve(directory, file), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await client.query<{ checksum: string }>('SELECT checksum FROM beatvault_schema_migrations WHERE version=$1', [file])
      if (existing.rows.length) { if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration checksum changed: ${file}`); continue }
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO beatvault_schema_migrations(version,checksum) VALUES ($1,$2)', [file, checksum])
        await client.query('COMMIT')
        console.log(`Applied ${file}`)
      } catch (error) { await client.query('ROLLBACK'); throw error }
    }
    console.log(`Migration ledger verified through ${Math.min(through, files.length)}.`)
  } finally { await client.query('SELECT pg_advisory_unlock(847291361)').catch(() => undefined); client.release(); await pool.end() }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/postgres-migrate.ts')) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; credentials are never printed.')
  await migrateLocalDatabase(process.env.DATABASE_URL, process.argv.includes('--through-028') ? 28 : 999)
}
