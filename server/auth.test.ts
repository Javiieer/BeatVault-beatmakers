import { describe, expect, it } from 'vitest'
import { AuthService, hashPassword, tokenHash, verifyPassword } from './auth'
import { config } from './config'
import { bootstrapAdmin } from './bootstrap'
import { AuditLog } from './security'
import type { Account } from './auth'
describe('password crypto', () => {
 it('hashes and verifies without storing plaintext', async () => { const hash = await hashPassword('a sufficiently long password'); expect(hash).not.toContain('a sufficiently long password'); expect(await verifyPassword('a sufficiently long password', hash)).toBe(true); expect(await verifyPassword('wrong password', hash)).toBe(false) })
 it('rejects malformed hashes', async () => { expect(await verifyPassword('password', 'not-a-hash')).toBe(false) })
 it('hashes tokens one-way and deterministically for lookup', () => { const token = 'a-secret-token'; expect(tokenHash(token)).not.toBe(token); expect(tokenHash(token)).toBe(tokenHash(token)); expect(tokenHash('different')).not.toBe(tokenHash(token)) })
 it('blocks a demo account that remains persisted after demo mode is disabled', async () => {
  const account: Account = { id: 'local-demo', email: 'demo@beatvault.local', passwordHash: await hashPassword('local-demo-password'), role: 'creator', verificationState: 'unverified' }
  let sessionsCreated = 0
  const repository = {
   findAccountByEmail: async (email: string) => email === account.email ? account : undefined,
   deleteExpiredSessions: async () => undefined,
   createSession: async () => { sessionsCreated += 1 },
  }
  const settings = { ...config, demo: { ...config.demo, enabled: false, email: account.email } }
  const auth = new AuthService(repository as never, settings)
  expect(await auth.login(account.email, 'local-demo-password')).toBeUndefined()
  expect(sessionsCreated).toBe(0)
 })
 it('requires the bootstrap token', async () => { await expect(bootstrapAdmin({ NODE_ENV: 'development', BEATVAULT_ADMIN_EMAIL: 'admin@test.local', BEATVAULT_ADMIN_PASSWORD: 'a sufficiently long password' }, { findAccountByEmail: async () => undefined, saveAccount: async () => undefined })).rejects.toThrow('ADMIN_BOOTSTRAP_CONFIGURATION_REQUIRED') })
 it('blocks production bootstrap', async () => { await expect(bootstrapAdmin({ NODE_ENV: 'production', BEATVAULT_ADMIN_EMAIL: 'admin@test.local', BEATVAULT_ADMIN_PASSWORD: 'a sufficiently long password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: '12345678901234567890123456789012' }, { findAccountByEmail: async () => undefined, saveAccount: async () => undefined })).rejects.toThrow('ADMIN_BOOTSTRAP_DISABLED_IN_PRODUCTION') })
 it('creates, promotes and remains idempotent without plaintext password', async () => { let account: Account | undefined; const repository = { findAccountByEmail: async () => account, saveAccount: async (value: Account) => { account = value } }; const audit = new AuditLog(); const env = { NODE_ENV: 'development', BEATVAULT_ADMIN_EMAIL: 'admin@test.local', BEATVAULT_ADMIN_PASSWORD: 'a sufficiently long password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: '12345678901234567890123456789012' }; const first = await bootstrapAdmin(env, repository, audit); expect(first.action).toBe('created'); expect(account?.role).toBe('admin'); expect(account?.verificationState).toBe('verified'); expect(account?.passwordHash).not.toContain(env.BEATVAULT_ADMIN_PASSWORD); const second = await bootstrapAdmin(env, repository, audit); expect(second.action).toBe('already-admin'); expect(audit.entries).toHaveLength(2) })
})
