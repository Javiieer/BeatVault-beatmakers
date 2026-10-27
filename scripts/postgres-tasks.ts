import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { migrateLocalDatabase } from './postgres-migrate'

const c = JSON.parse(await readFile('.tools/postgresql/local-config.json', 'utf8'))
if (c.host !== '127.0.0.1' || c.database !== 'beatvault_local' || c.port !== 55432) throw new Error('Only the private local cluster is supported.')
const task = process.argv[2]
const connection = (name: string, app = false) => `postgresql://${encodeURIComponent(app ? c.appUser : c.adminUser)}:${encodeURIComponent(app ? c.appPassword : c.adminPassword)}@${c.host}:${c.port}/${name}`
if (task === 'migrate' || task === 'qa') {
  const admin = new Pool({ connectionString: connection('postgres'), max: 1 })
  try {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [c.appUser])).rows.length) {
      const quoted = await admin.query("SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text,$2::text) AS sql", [c.appUser, c.appPassword])
      await admin.query(quoted.rows[0].sql)
    }
    const name = task === 'qa' ? 'beatvault_test_native' : c.database
    const owner = task === 'qa' ? c.adminUser : c.appUser
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rows.length) {
      const quoted = await admin.query("SELECT format('CREATE DATABASE %I OWNER %I', $1::text,$2::text) AS sql", [name, owner])
      await admin.query(quoted.rows[0].sql)
    }
    await migrateLocalDatabase(connection(name, task !== 'qa'))
  } finally { await admin.end() }
  if (task === 'qa') {
    process.env.BEATVAULT_TEST_DATABASE_URL = connection('beatvault_test_native')
    process.env.BEATVAULT_TEST_PG_BIN = resolve('.tools/postgresql/pgsql/bin')
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/postgres-qa.ts'], { stdio: 'inherit', env: process.env })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  }
} else if (task === 'qa-browser') {
  const name = `beatvault_test_e2e_${randomUUID().replaceAll('-', '')}`
  const admin = new Pool({ connectionString: connection('postgres'), max: 1 })
  let created = false
  try {
    const quoted = await admin.query("SELECT format('CREATE DATABASE %I OWNER %I', $1::text,$2::text) AS sql", [name, c.appUser])
    await admin.query(quoted.rows[0].sql)
    created = true
    await migrateLocalDatabase(connection(name, true))
    const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--global-timeout=1800000', ...process.argv.slice(3)], {
      stdio: 'inherit', env: { ...process.env, BEATVAULT_E2E_DATABASE_URL: connection(name, true) },
    })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } finally {
    // Only the unique database created by this invocation can be removed.
    if (created) {
      const quoted = await admin.query("SELECT format('DROP DATABASE %I WITH (FORCE)', $1::text) AS sql", [name])
      await admin.query(quoted.rows[0].sql)
    }
    await admin.end()
  }
} else if (task === 'backup') {
  await mkdir('backups', { recursive: true })
  const output = resolve(`backups/postgres-local-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`)
  const result = spawnSync(resolve('.tools/postgresql/pgsql/bin/pg_dump.exe'), ['-h', c.host, '-p', String(c.port), '-U', c.appUser, '-d', c.database, '-Fc', '-f', output], { env: { ...process.env, PGPASSWORD: c.appPassword }, encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error('Local backup failed.', { cause: result.error || result.stderr })
  await writeFile('artifacts/postgres-last-backup.json', JSON.stringify({ output, createdAt: new Date().toISOString() }, null, 2))
  console.log(`Backup created: ${output}`)
} else throw new Error('Expected migrate, qa, qa-browser or backup.')
