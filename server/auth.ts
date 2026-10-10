import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { JsonStore } from './store'
import type { Role } from './security'
import { config, type ServerConfig } from './config'
import type { ServerRepository } from './store'
const scrypt = promisify(nodeScrypt)
export const sessionCookie = 'beatvault_session'
export const csrfCookie = 'beatvault_csrf'
export const sessionMaxAgeSeconds = config.sessionTtlSeconds
export type VerificationState = 'unverified' | 'pending' | 'verified'
export type Account = { id: string; email: string; passwordHash: string; role: Role; verificationState: VerificationState; verificationTokenHash?: string; verificationTokenExpiresAt?: number; resetTokenHash?: string; resetTokenExpiresAt?: number }
type AccountRepository = Pick<ServerRepository, 'findAccountByEmail' | 'findAccountById' | 'findAccountByToken' | 'saveAccount'>
type Session = { accountId: string; csrfToken: string; expiresAt: number }
export const hashPassword = async (password: string): Promise<string> => { const salt = randomBytes(16); const key = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt.toString('base64')}$${key.toString('base64')}` }
export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => { const parts = encoded.split('$'); if (parts.length !== 3 || parts[0] !== 'scrypt') return false; try { const expected = Buffer.from(parts[2], 'base64'); const actual = await scrypt(password, Buffer.from(parts[1], 'base64'), expected.length) as Buffer; return expected.length === actual.length && timingSafeEqual(expected, actual) } catch { return false } }
export class AuthService {
  private readonly sessions = new Map<string, Session>()
  constructor(private readonly accounts: AccountRepository = new LocalAccountRepository(), private readonly settings: ServerConfig = config) {}
  async initialize(): Promise<void> { if (!this.settings.demo.enabled) return; const existing = await this.accounts.findAccountByEmail(this.settings.demo.email); if (existing) return; const password = this.settings.demo.password || 'local-demo-password'; await this.accounts.saveAccount({ id: 'local-demo', email: this.settings.demo.email, passwordHash: await hashPassword(password), role: 'creator', verificationState: 'unverified' }) }
  async register(email: string, password: string): Promise<Omit<Account, 'passwordHash'>> { const normalizedEmail = email.trim().toLowerCase(); if (await this.accounts.findAccountByEmail(normalizedEmail)) throw new Error('DUPLICATE_ACCOUNT'); const account: Account = { id: randomBytes(16).toString('hex'), email: normalizedEmail, passwordHash: await hashPassword(password), role: 'creator', verificationState: 'unverified' }; await this.accounts.saveAccount(account); return { id: account.id, email: account.email, role: account.role, verificationState: account.verificationState } }
  async issueToken(email: string, kind: 'verify' | 'reset'): Promise<string | undefined> { const account = await this.accounts.findAccountByEmail(email.trim().toLowerCase()); if (!account) return undefined; const token = randomBytes(32).toString('base64url'); const patch = kind === 'verify' ? { verificationTokenHash: tokenHash(token), verificationTokenExpiresAt: Date.now() + 30 * 60 * 1000, verificationState: 'pending' as const } : { resetTokenHash: tokenHash(token), resetTokenExpiresAt: Date.now() + 30 * 60 * 1000 }; await this.accounts.saveAccount({ ...account, ...patch }); return token }
  async confirmVerification(token: string): Promise<boolean> { const account = await this.findByToken('verify', token); if (!account) return false; await this.accounts.saveAccount({ ...account, verificationState: 'verified', verificationTokenHash: undefined, verificationTokenExpiresAt: undefined }); return true }
  async resetPassword(token: string, password: string): Promise<boolean> { const account = await this.findByToken('reset', token); if (!account) return false; await this.accounts.saveAccount({ ...account, passwordHash: await hashPassword(password), resetTokenHash: undefined, resetTokenExpiresAt: undefined }); this.invalidateAccountSessions(account.id); return true }
  async changePassword(accountId: string, password: string): Promise<boolean> { const account = await this.accounts.findAccountById(accountId); if (!account) return false; await this.accounts.saveAccount({ ...account, passwordHash: await hashPassword(password) }); this.invalidateAccountSessions(accountId); return true }
  async login(email: string, password: string): Promise<{ id: string; email: string; role: Role; verificationState: VerificationState; token: string; csrfToken: string } | undefined> {
    const now = Date.now()
    for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(token)
    const account = await this.accounts.findAccountByEmail(email.trim().toLowerCase())
    if (!account || !(await verifyPassword(password, account.passwordHash))) return undefined
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    this.sessions.set(token, { accountId: account.id, csrfToken, expiresAt: now + this.settings.sessionTtlSeconds * 1000 })
    return { id: account.id, email: account.email, role: account.role || 'creator', verificationState: account.verificationState || 'unverified', token, csrfToken }
  }
  getCsrf(token: string | undefined): string | undefined { return token ? this.sessions.get(token)?.csrfToken : undefined }
  async accountFor(token: string | undefined): Promise<Account | undefined> { const session = token ? this.sessions.get(token) : undefined; if (!session || session.expiresAt <= Date.now()) { if (token) this.sessions.delete(token); return undefined }; const account = await this.accounts.findAccountById(session.accountId); return account ? { ...account, role: account.role || 'creator', verificationState: account.verificationState || 'unverified' } : undefined }
  logout(token: string | undefined): void { if (token) this.sessions.delete(token) }
  clearSessions(): void { this.sessions.clear() }
  private invalidateAccountSessions(accountId: string): void { for (const [token, session] of this.sessions) if (session.accountId === accountId) this.sessions.delete(token) }
  private async findByToken(kind: 'verify' | 'reset', token: string): Promise<Account | undefined> { const account = await this.accounts.findAccountByToken(kind, tokenHash(token)); if (!account) return undefined; const expiry = kind === 'verify' ? account.verificationTokenExpiresAt : account.resetTokenExpiresAt; return expiry && expiry > Date.now() ? account : undefined }
  private valid(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === undefined || item.role === 'creator' || item.role === 'admin') }
}
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex')
class LocalAccountRepository implements AccountRepository {
  private readonly store = new JsonStore(`${config.dataDirectory}/accounts.json`)
  async findAccountByEmail(email: string) { return (await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string')).find(item => item.email === email) }
  async findAccountById(id: string) { return (await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string')).find(item => item.id === id) }
  async findAccountByToken(kind: 'verify' | 'reset', hash: string) { return (await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string')).find(item => (kind === 'verify' ? item.verificationTokenHash : item.resetTokenHash) === hash) }
  async saveAccount(account: Account) { const items = await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string'); items.push(account); await this.store.write(items) }
}
