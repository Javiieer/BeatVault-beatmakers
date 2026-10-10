import { randomBytes } from 'node:crypto'
import type { ServerConfig } from './config'
import { hashPassword, type Account } from './auth'
import type { ServerRepository } from './store'
import type { AuditLog } from './security'

export type BootstrapResult = { action: 'created' | 'promoted' | 'already-admin'; accountId: string; email: string }

export async function bootstrapAdmin(
  env: NodeJS.ProcessEnv,
  repository: Pick<ServerRepository, 'findAccountByEmail' | 'saveAccount'>,
  audit?: AuditLog,
  settings?: Pick<ServerConfig, 'environment'>,
): Promise<BootstrapResult> {
  const environment = settings?.environment ?? env.NODE_ENV ?? 'development'
  if (environment === 'production') throw new Error('ADMIN_BOOTSTRAP_DISABLED_IN_PRODUCTION')
  const email = env.BEATVAULT_ADMIN_EMAIL?.trim().toLowerCase()
  const password = env.BEATVAULT_ADMIN_PASSWORD
  const bootstrapToken = env.BEATVAULT_ADMIN_BOOTSTRAP_TOKEN
  if (!email || !password || !bootstrapToken) throw new Error('ADMIN_BOOTSTRAP_CONFIGURATION_REQUIRED')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('ADMIN_EMAIL_INVALID')
  if (password.length < 12 || password.length > 128) throw new Error('ADMIN_PASSWORD_INVALID')
  if (bootstrapToken.length < 32) throw new Error('ADMIN_BOOTSTRAP_TOKEN_INVALID')

  const existing = await repository.findAccountByEmail(email)
  const account: Account = existing
    ? { ...existing, role: 'admin', verificationState: 'verified', passwordHash: await hashPassword(password) }
    : { id: randomBytes(16).toString('hex'), email, passwordHash: await hashPassword(password), role: 'admin', verificationState: 'verified' }
  await repository.saveAccount(account)
  const action = existing ? (existing.role === 'admin' && existing.verificationState === 'verified' ? 'already-admin' : 'promoted') : 'created'
  audit?.record('admin_bootstrap', 'admin-bootstrap', account.id)
  return { action, accountId: account.id, email: account.email }
}
