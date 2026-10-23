import { randomBytes, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { hashPassword } from './auth'

export type ProductionAdminAction = 'provision' | 'recover'
export type ProductionAdminResult = { action: 'provisioned' | 'recovered'; accountId: string; email: string }

export class ProductionAdminOperationError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ProductionAdminOperationError'
  }
}

const operationLock = 1_384_771_221
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readOperation(actionValue: string | undefined, env: NodeJS.ProcessEnv): { action: ProductionAdminAction; email: string; password: string } {
  if (actionValue !== 'provision' && actionValue !== 'recover') throw new ProductionAdminOperationError('ADMIN_OPERATION_REQUIRED')
  if (env.NODE_ENV !== 'production') throw new ProductionAdminOperationError('ADMIN_OPERATION_PRODUCTION_ONLY')
  if (env.BEATVAULT_STORAGE_BACKEND !== 'postgres') throw new ProductionAdminOperationError('ADMIN_OPERATION_POSTGRES_REQUIRED')
  const databaseUrl = env.DATABASE_URL || env.BEATVAULT_DATABASE_URL
  try {
    const parsed = new URL(databaseUrl || '')
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) throw new Error()
  } catch {
    throw new ProductionAdminOperationError('ADMIN_OPERATION_DATABASE_REQUIRED')
  }
  const expectedConfirmation = actionValue === 'provision' ? 'CREATE_INITIAL_ADMIN' : 'RESET_ADMIN_PASSWORD'
  if (env.BEATVAULT_ADMIN_OPERATION_CONFIRM !== expectedConfirmation) throw new ProductionAdminOperationError('ADMIN_OPERATION_CONFIRMATION_REQUIRED')
  const email = env.BEATVAULT_ADMIN_EMAIL?.trim().toLowerCase() || ''
  if (!emailPattern.test(email) || email.length > 254) throw new ProductionAdminOperationError('ADMIN_EMAIL_INVALID')
  const password = env.BEATVAULT_ADMIN_PASSWORD || ''
  if (password.length < 12 || password.length > 128) throw new ProductionAdminOperationError('ADMIN_PASSWORD_INVALID')
  return { action: actionValue, email, password }
}

async function appendAudit(client: PoolClient, operation: ProductionAdminAction, accountId: string): Promise<void> {
  const timestamp = new Date().toISOString()
  await client.query(
    'INSERT INTO audit_events (id, timestamp, action, request_id, actor_id, target_id, success, metadata) VALUES ($1, $2, $3, $4, NULL, $5, TRUE, $6)',
    [randomUUID(), timestamp, operation === 'provision' ? 'admin_bootstrap' : 'update', `admin-production-${operation}`, accountId, JSON.stringify({ operation: operation === 'provision' ? 'initial_admin_provision' : 'admin_password_recovery' })],
  )
}

export async function runProductionAdminOperation(
  actionValue: string | undefined,
  env: NodeJS.ProcessEnv,
  pool: Pick<Pool, 'connect'>,
): Promise<ProductionAdminResult> {
  const { action, email, password } = readOperation(actionValue, env)
  const passwordHash = await hashPassword(password)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1::integer, 1)', [operationLock])

    let accountId: string
    if (action === 'provision') {
      const claim = await client.query<{ account_id: string }>("SELECT account_id FROM admin_bootstrap_claims WHERE claim_key = 'initial-admin' FOR UPDATE")
      if (claim.rowCount) throw new ProductionAdminOperationError('ADMIN_INITIAL_ALREADY_PROVISIONED')
      const admins = await client.query<{ id: string }>("SELECT id FROM accounts WHERE role = 'admin' LIMIT 1")
      if (admins.rowCount) throw new ProductionAdminOperationError('ADMIN_ALREADY_EXISTS')
      const existingAccount = await client.query<{ id: string }>('SELECT id FROM accounts WHERE lower(email) = $1 LIMIT 1', [email])
      if (existingAccount.rowCount) throw new ProductionAdminOperationError('ADMIN_EMAIL_ALREADY_REGISTERED')

      accountId = randomBytes(16).toString('hex')
      await client.query(
        "INSERT INTO accounts (id, email, password_hash, role, verification_state) VALUES ($1, $2, $3, 'admin', 'verified')",
        [accountId, email, passwordHash],
      )
      await client.query("INSERT INTO admin_bootstrap_claims (claim_key, account_id) VALUES ('initial-admin', $1)", [accountId])
    } else {
      const admin = await client.query<{ id: string }>("SELECT id FROM accounts WHERE lower(email) = $1 AND role = 'admin' LIMIT 1 FOR UPDATE", [email])
      const existing = admin.rows[0]
      if (!existing) throw new ProductionAdminOperationError('ADMIN_ACCOUNT_NOT_FOUND')
      accountId = existing.id
      const updated = await client.query('UPDATE accounts SET password_hash = $2 WHERE id = $1 AND role = \'admin\'', [accountId, passwordHash])
      if (updated.rowCount !== 1) throw new ProductionAdminOperationError('ADMIN_ACCOUNT_NOT_FOUND')
      await client.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId])
    }

    await appendAudit(client, action, accountId)
    await client.query('COMMIT')
    return { action: action === 'provision' ? 'provisioned' : 'recovered', accountId, email }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* retain the original operation failure */ }
    if (error instanceof ProductionAdminOperationError) throw error
    throw new ProductionAdminOperationError('ADMIN_OPERATION_FAILED')
  } finally {
    client.release()
  }
}
