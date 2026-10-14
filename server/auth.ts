import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { LocalRepository } from './store'
import type { Role } from './security'
import { config, type ServerConfig } from './config'
import type { ServerRepository } from './store'
import { isPlanId, type PlanId } from './plans'
const scrypt = promisify(nodeScrypt)
export const sessionCookie = 'beatvault_session'
export const csrfCookie = 'beatvault_csrf'
export const sessionMaxAgeSeconds = config.sessionTtlSeconds
export type VerificationState = 'unverified' | 'pending' | 'verified'
export type Account = { id: string; email: string; passwordHash: string; role: Role; verificationState: VerificationState; planId?: PlanId; purchasedPlanIds?: PlanId[]; verificationTokenHash?: string; verificationTokenExpiresAt?: number; resetTokenHash?: string; resetTokenExpiresAt?: number }
type AccountRepository = Pick<ServerRepository, 'findAccountByEmail' | 'findAccountById' | 'findAccountByToken' | 'saveAccount' | 'createSession' | 'findSession' | 'deleteSession' | 'deleteExpiredSessions' | 'deleteAccountSessions' | 'clearSessions'>
export const hashPassword = async (password: string): Promise<string> => { const salt = randomBytes(16); const key = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt.toString('base64')}$${key.toString('base64')}` }
export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => { const parts = encoded.split('$'); if (parts.length !== 3 || parts[0] !== 'scrypt') return false; try { const expected = Buffer.from(parts[2], 'base64'); const actual = await scrypt(password, Buffer.from(parts[1], 'base64'), expected.length) as Buffer; return expected.length === actual.length && timingSafeEqual(expected, actual) } catch { return false } }
export class AuthService {
  constructor(private readonly accounts: AccountRepository = new LocalRepository(), private readonly settings: ServerConfig = config) {}
  async initialize(): Promise<void> { await this.accounts.deleteExpiredSessions(Date.now()); if (!this.settings.demo.enabled) return; const existing = await this.accounts.findAccountByEmail(this.settings.demo.email); if (existing) return; const password = this.settings.demo.password || 'local-demo-password'; await this.accounts.saveAccount({ id: 'local-demo', email: this.settings.demo.email, passwordHash: await hashPassword(password), role: 'creator', verificationState: 'unverified', planId: 'free' }) }
  async register(email: string, password: string): Promise<Omit<Account, 'passwordHash'>> { const normalizedEmail = email.trim().toLowerCase(); if (await this.accounts.findAccountByEmail(normalizedEmail)) throw new Error('DUPLICATE_ACCOUNT'); const account: Account = { id: randomBytes(16).toString('hex'), email: normalizedEmail, passwordHash: await hashPassword(password), role: 'creator', verificationState: 'unverified', planId: 'free' }; await this.accounts.saveAccount(account); return { id: account.id, email: account.email, role: account.role, verificationState: account.verificationState, planId: 'free' } }
  async assignPlan(accountId: string, planId: PlanId): Promise<Account | undefined> { const account = await this.accounts.findAccountById(accountId); if (!account) return undefined; const updated = { ...account, planId }; await this.accounts.saveAccount(updated); return updated }
  async assignStaffRole(accountId: string, role: 'creator' | 'community_manager'): Promise<Account | undefined> { const account = await this.accounts.findAccountById(accountId); if (!account || account.role === 'admin') return undefined; const updated = { ...account, role }; await this.accounts.saveAccount(updated); return updated }
  async recordVerifiedPlanPurchase(accountId: string, planId: Exclude<PlanId, 'free'>): Promise<Account | undefined> {
    const account = await this.accounts.findAccountById(accountId)
    if (!account) return undefined
    const purchasedPlanIds = [...new Set([...(account.purchasedPlanIds || []), planId])]
    const updated = { ...account, planId, purchasedPlanIds }
    await this.accounts.saveAccount(updated)
    return updated
  }
  async issueToken(email: string, kind: 'verify' | 'reset'): Promise<string | undefined> { const account = await this.accounts.findAccountByEmail(email.trim().toLowerCase()); if (!account) return undefined; const token = randomBytes(32).toString('base64url'); const patch = kind === 'verify' ? { verificationTokenHash: tokenHash(token), verificationTokenExpiresAt: Date.now() + 30 * 60 * 1000, verificationState: 'pending' as const } : { resetTokenHash: tokenHash(token), resetTokenExpiresAt: Date.now() + 30 * 60 * 1000 }; await this.accounts.saveAccount({ ...account, ...patch }); return token }
  async confirmVerification(token: string): Promise<boolean> { const account = await this.findByToken('verify', token); if (!account) return false; await this.accounts.saveAccount({ ...account, verificationState: 'verified', verificationTokenHash: undefined, verificationTokenExpiresAt: undefined }); return true }
  async resetPassword(token: string, password: string): Promise<boolean> { const account = await this.findByToken('reset', token); if (!account) return false; await this.accounts.saveAccount({ ...account, passwordHash: await hashPassword(password), resetTokenHash: undefined, resetTokenExpiresAt: undefined }); await this.invalidateAccountSessions(account.id); return true }
  async changePassword(accountId: string, currentPassword: string, password: string, keepSession?: string): Promise<boolean> { const account = await this.accounts.findAccountById(accountId); if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) return false; await this.accounts.saveAccount({ ...account, passwordHash: await hashPassword(password) }); await this.invalidateAccountSessions(accountId, keepSession); return true }
  async changeEmail(accountId: string, currentPassword: string, email: string): Promise<Account | undefined> { const account = await this.accounts.findAccountById(accountId); if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) return undefined; const normalizedEmail = email.trim().toLowerCase(); const existing = await this.accounts.findAccountByEmail(normalizedEmail); if (existing && existing.id !== accountId) throw new Error('DUPLICATE_ACCOUNT'); const updated = { ...account, email: normalizedEmail, verificationState: 'unverified' as const, verificationTokenHash: undefined, verificationTokenExpiresAt: undefined }; await this.accounts.saveAccount(updated); return updated }
  async login(email: string, password: string): Promise<{ id: string; email: string; role: Role; verificationState: VerificationState; token: string; csrfToken: string } | undefined> {
    const now = Date.now()
    await this.accounts.deleteExpiredSessions(now)
    const account = await this.accounts.findAccountByEmail(email.trim().toLowerCase())
    if (!account || !(await verifyPassword(password, account.passwordHash))) return undefined
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    await this.accounts.createSession({ tokenHash: tokenHash(token), accountId: account.id, csrfTokenHash: tokenHash(csrfToken), expiresAt: now + this.settings.sessionTtlSeconds * 1000 })
    return { id: account.id, email: account.email, role: account.role || 'creator', verificationState: account.verificationState || 'unverified', token, csrfToken }
  }
  async verifyCsrf(token: string | undefined, supplied: string | undefined): Promise<boolean> { if (!token || !supplied) return false; const session = await this.accounts.findSession(tokenHash(token)); if (!session || session.expiresAt <= Date.now()) return false; const expected = Buffer.from(session.csrfTokenHash, 'hex'); const actual = Buffer.from(tokenHash(supplied), 'hex'); return expected.length === actual.length && timingSafeEqual(expected, actual) }
  async accountFor(token: string | undefined): Promise<Account | undefined> { if (!token) return undefined; const session = await this.accounts.findSession(tokenHash(token)); if (!session || session.expiresAt <= Date.now()) { if (session) await this.accounts.deleteSession(session.tokenHash); return undefined }; const account = await this.accounts.findAccountById(session.accountId); return account ? { ...account, role: account.role || 'creator', verificationState: account.verificationState || 'unverified', planId: account.planId || 'free' } : undefined }
  async logout(token: string | undefined): Promise<void> { if (token) await this.accounts.deleteSession(tokenHash(token)) }
  async clearSessions(): Promise<void> { await this.accounts.clearSessions() }
  private async invalidateAccountSessions(accountId: string, exceptToken?: string): Promise<void> { await this.accounts.deleteAccountSessions(accountId, exceptToken ? tokenHash(exceptToken) : undefined) }
  private async findByToken(kind: 'verify' | 'reset', token: string): Promise<Account | undefined> { const account = await this.accounts.findAccountByToken(kind, tokenHash(token)); if (!account) return undefined; const expiry = kind === 'verify' ? account.verificationTokenExpiresAt : account.resetTokenExpiresAt; return expiry && expiry > Date.now() ? account : undefined }
  private valid(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === undefined || item.role === 'creator' || item.role === 'admin' || item.role === 'community_manager') && (item.planId === undefined || isPlanId(item.planId)) && (item.purchasedPlanIds === undefined || Array.isArray(item.purchasedPlanIds) && item.purchasedPlanIds.every(isPlanId)) }
}
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex')
