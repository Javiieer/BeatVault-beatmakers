import { describe, expect, it } from 'vitest'
import type { Pool, PoolClient } from 'pg'
import { verifyPassword } from './auth'
import { runProductionAdminOperation } from './production-admin'

type TestAccount = { id: string; email: string; passwordHash: string; role: 'admin' | 'creator' }
type TestState = {
  accounts: TestAccount[]
  claimAccountId?: string
  sessions: string[]
  audit: Array<{ action: string; targetId: string; metadata: Record<string, unknown> }>
  failAudit?: boolean
  statements: string[]
  releases: number
}

const productionEnv = (action: 'provision' | 'recover' = 'provision'): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  BEATVAULT_STORAGE_BACKEND: 'postgres',
  DATABASE_URL: 'postgresql://qa:qa@127.0.0.1/beatvault_test_admin',
  BEATVAULT_ADMIN_OPERATION_CONFIRM: action === 'provision' ? 'CREATE_INITIAL_ADMIN' : 'RESET_ADMIN_PASSWORD',
  BEATVAULT_ADMIN_EMAIL: 'admin@example.invalid',
  BEATVAULT_ADMIN_PASSWORD: 'QA-only-admin-password-2026',
})

function fakePool(state: TestState): Pick<Pool, 'connect'> {
  let beforeTransaction: Omit<TestState, 'failAudit' | 'statements' | 'releases'> | undefined
  const client = {
    query: async (queryText: string, values: unknown[] = []) => {
      const query = queryText.replace(/\s+/g, ' ').trim().toLowerCase()
      state.statements.push(query)
      const empty = { rows: [] as Array<Record<string, unknown>>, rowCount: 0 }
      if (query === 'begin') {
        beforeTransaction = { accounts: state.accounts.map(account => ({ ...account })), claimAccountId: state.claimAccountId, sessions: [...state.sessions], audit: [...state.audit] }
        return empty
      }
      if (query === 'commit') { beforeTransaction = undefined; return empty }
      if (query === 'rollback') {
        if (beforeTransaction) {
          state.accounts = beforeTransaction.accounts
          state.claimAccountId = beforeTransaction.claimAccountId
          state.sessions = beforeTransaction.sessions
          state.audit = beforeTransaction.audit
          beforeTransaction = undefined
        }
        return empty
      }
      if (query.startsWith('select pg_advisory_xact_lock')) return empty
      if (query.startsWith('select account_id from admin_bootstrap_claims')) {
        const rows = state.claimAccountId ? [{ account_id: state.claimAccountId }] : []
        return { rows, rowCount: rows.length }
      }
      if (query.startsWith("select id from accounts where lower(email) = $1 and role = 'admin'")) {
        const account = state.accounts.find(value => value.email.toLowerCase() === values[0] && value.role === 'admin')
        const rows = account ? [{ id: account.id }] : []
        return { rows, rowCount: rows.length }
      }
      if (query.startsWith("select id from accounts where role = 'admin'")) {
        const account = state.accounts.find(value => value.role === 'admin')
        const rows = account ? [{ id: account.id }] : []
        return { rows, rowCount: rows.length }
      }
      if (query.startsWith('select id from accounts where lower(email) = $1')) {
        const account = state.accounts.find(value => value.email.toLowerCase() === values[0])
        const rows = account ? [{ id: account.id }] : []
        return { rows, rowCount: rows.length }
      }
      if (query.startsWith('insert into accounts')) {
        state.accounts.push({ id: String(values[0]), email: String(values[1]), passwordHash: String(values[2]), role: 'admin' })
        return { rows: [], rowCount: 1 }
      }
      if (query.startsWith('insert into admin_bootstrap_claims')) {
        state.claimAccountId = String(values[0])
        return { rows: [], rowCount: 1 }
      }
      if (query.startsWith('update accounts set password_hash')) {
        const account = state.accounts.find(value => value.id === values[0] && value.role === 'admin')
        if (!account) return { rows: [], rowCount: 0 }
        account.passwordHash = String(values[1])
        return { rows: [], rowCount: 1 }
      }
      if (query.startsWith('delete from auth_sessions')) {
        state.sessions = state.sessions.filter(accountId => accountId !== values[0])
        return { rows: [], rowCount: 1 }
      }
      if (query.startsWith('insert into audit_events')) {
        if (state.failAudit) throw new Error('simulated audit storage failure')
        state.audit.push({ action: String(values[2]), targetId: String(values[4]), metadata: JSON.parse(String(values[5])) as Record<string, unknown> })
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL in test: ${query}`)
    },
    release: () => { state.releases += 1 },
  }
  return { connect: async () => client as unknown as PoolClient } as Pick<Pool, 'connect'>
}

const emptyState = (): TestState => ({ accounts: [], sessions: [], audit: [], statements: [], releases: 0 })

describe('production admin maintenance operation', () => {
  it('provisions only the first admin and records a durable audit event', async () => {
    const state = emptyState()
    const result = await runProductionAdminOperation('provision', productionEnv(), fakePool(state))
    expect(result).toMatchObject({ action: 'provisioned', email: 'admin@example.invalid' })
    expect(state.accounts).toHaveLength(1)
    expect(state.accounts[0]).toMatchObject({ email: 'admin@example.invalid', role: 'admin' })
    expect(state.accounts[0]?.passwordHash).toMatch(/^scrypt\$/)
    expect(state.accounts[0]?.passwordHash).not.toContain('QA-only-admin-password-2026')
    expect(state.claimAccountId).toBe(state.accounts[0]?.id)
    expect(state.audit).toEqual([{ action: 'admin_bootstrap', targetId: state.accounts[0]!.id, metadata: { operation: 'initial_admin_provision' } }])
    expect(state.statements).toContain('commit')
    expect(state.releases).toBe(1)
  })

  it('refuses a second initial admin without changing the first credential', async () => {
    const state = emptyState()
    const pool = fakePool(state)
    await runProductionAdminOperation('provision', productionEnv(), pool)
    const firstHash = state.accounts[0]?.passwordHash
    await expect(runProductionAdminOperation('provision', productionEnv(), pool)).rejects.toMatchObject({ code: 'ADMIN_INITIAL_ALREADY_PROVISIONED' })
    expect(state.accounts).toHaveLength(1)
    expect(state.accounts[0]?.passwordHash).toBe(firstHash)
    expect(state.audit).toHaveLength(1)
    expect(state.statements).toContain('rollback')
  })

  it('does not promote or overwrite an existing creator account', async () => {
    const state = emptyState()
    state.accounts.push({ id: 'creator-1', email: 'admin@example.invalid', passwordHash: 'existing-hash', role: 'creator' })
    await expect(runProductionAdminOperation('provision', productionEnv(), fakePool(state))).rejects.toMatchObject({ code: 'ADMIN_EMAIL_ALREADY_REGISTERED' })
    expect(state.accounts[0]).toEqual({ id: 'creator-1', email: 'admin@example.invalid', passwordHash: 'existing-hash', role: 'creator' })
    expect(state.claimAccountId).toBeUndefined()
    expect(state.audit).toHaveLength(0)
  })

  it('recovers only an existing admin, revokes all sessions and audits the operation', async () => {
    const state = emptyState()
    state.accounts.push({ id: 'admin-1', email: 'admin@example.invalid', passwordHash: 'old-hash', role: 'admin' })
    state.sessions = ['admin-1', 'admin-1', 'other-account']
    const result = await runProductionAdminOperation('recover', productionEnv('recover'), fakePool(state))
    expect(result).toMatchObject({ action: 'recovered', accountId: 'admin-1' })
    expect(await verifyPassword('QA-only-admin-password-2026', state.accounts[0]!.passwordHash)).toBe(true)
    expect(state.sessions).toEqual(['other-account'])
    expect(state.audit).toEqual([{ action: 'update', targetId: 'admin-1', metadata: { operation: 'admin_password_recovery' } }])
  })

  it('refuses to recover a creator account', async () => {
    const state = emptyState()
    state.accounts.push({ id: 'creator-1', email: 'admin@example.invalid', passwordHash: 'unchanged-hash', role: 'creator' })
    await expect(runProductionAdminOperation('recover', productionEnv('recover'), fakePool(state))).rejects.toMatchObject({ code: 'ADMIN_ACCOUNT_NOT_FOUND' })
    expect(state.accounts[0]?.passwordHash).toBe('unchanged-hash')
    expect(state.sessions).toHaveLength(0)
    expect(state.audit).toHaveLength(0)
  })

  it('rolls back provisioning when the audit insert fails', async () => {
    const state = emptyState()
    state.failAudit = true
    await expect(runProductionAdminOperation('provision', productionEnv(), fakePool(state))).rejects.toMatchObject({ code: 'ADMIN_OPERATION_FAILED' })
    expect(state.accounts).toHaveLength(0)
    expect(state.claimAccountId).toBeUndefined()
    expect(state.audit).toHaveLength(0)
    expect(state.statements).toContain('rollback')
  })

  it('rolls back password and session changes when the recovery audit insert fails', async () => {
    const state = emptyState()
    state.accounts.push({ id: 'admin-1', email: 'admin@example.invalid', passwordHash: 'old-hash', role: 'admin' })
    state.sessions = ['admin-1']
    state.failAudit = true
    await expect(runProductionAdminOperation('recover', productionEnv('recover'), fakePool(state))).rejects.toMatchObject({ code: 'ADMIN_OPERATION_FAILED' })
    expect(state.accounts[0]?.passwordHash).toBe('old-hash')
    expect(state.sessions).toEqual(['admin-1'])
    expect(state.audit).toHaveLength(0)
    expect(state.statements).toContain('rollback')
  })
  it('requires production PostgreSQL configuration and action-specific confirmation before opening a connection', async () => {
    const state = emptyState()
    const pool = fakePool(state)
    await expect(runProductionAdminOperation('provision', { ...productionEnv(), NODE_ENV: 'development' }, pool)).rejects.toMatchObject({ code: 'ADMIN_OPERATION_PRODUCTION_ONLY' })
    await expect(runProductionAdminOperation('recover', { ...productionEnv('recover'), BEATVAULT_ADMIN_OPERATION_CONFIRM: 'CREATE_INITIAL_ADMIN' }, pool)).rejects.toMatchObject({ code: 'ADMIN_OPERATION_CONFIRMATION_REQUIRED' })
    await expect(runProductionAdminOperation(undefined, productionEnv(), pool)).rejects.toMatchObject({ code: 'ADMIN_OPERATION_REQUIRED' })
    expect(state.releases).toBe(0)
  })
})
