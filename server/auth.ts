import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { JsonStore } from './store'
import type { Role } from './security'
import { config, type ServerConfig } from './config'
import type { ServerRepository } from './store'
const scrypt = promisify(nodeScrypt)
export const sessionCookie = 'beatvault_session'
export const csrfCookie = 'beatvault_csrf'
export const sessionMaxAgeSeconds = config.sessionTtlSeconds
export type Account = { id: string; email: string; passwordHash: string; role: Role }
type AccountRepository = Pick<ServerRepository, 'findAccountByEmail' | 'findAccountById' | 'saveAccount'>
type Session = { accountId: string; csrfToken: string; expiresAt: number }
export const hashPassword = async (password: string): Promise<string> => { const salt = randomBytes(16); const key = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt.toString('base64')}$${key.toString('base64')}` }
export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => { const parts = encoded.split('$'); if (parts.length !== 3 || parts[0] !== 'scrypt') return false; try { const expected = Buffer.from(parts[2], 'base64'); const actual = await scrypt(password, Buffer.from(parts[1], 'base64'), expected.length) as Buffer; return expected.length === actual.length && timingSafeEqual(expected, actual) } catch { return false } }
export class AuthService {
  private readonly sessions = new Map<string, Session>()
  constructor(private readonly accounts: AccountRepository = new LocalAccountRepository(), private readonly settings: ServerConfig = config) {}
  async initialize(): Promise<void> { if (!this.settings.demo.enabled) return; const existing = await this.accounts.findAccountByEmail(this.settings.demo.email); if (existing) return; const password = this.settings.demo.password || 'local-demo-password'; await this.accounts.saveAccount({ id: 'local-demo', email: this.settings.demo.email, passwordHash: await hashPassword(password), role: 'creator' }) }
  async login(email: string, password: string): Promise<{ id: string; email: string; role: Role; token: string; csrfToken: string } | undefined> { const account = await this.accounts.findAccountByEmail(email.trim().toLowerCase()); if (!account || !(await verifyPassword(password, account.passwordHash))) return undefined; const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(32).toString('base64url'); this.sessions.set(token, { accountId: account.id, csrfToken, expiresAt: Date.now() + this.settings.sessionTtlSeconds * 1000 }); return { id: account.id, email: account.email, role: account.role || 'creator', token, csrfToken } }
  getCsrf(token: string | undefined): string | undefined { return token ? this.sessions.get(token)?.csrfToken : undefined }
  async accountFor(token: string | undefined): Promise<Account | undefined> { const session = token ? this.sessions.get(token) : undefined; if (!session || session.expiresAt <= Date.now()) { if (token) this.sessions.delete(token); return undefined }; const account = await this.accounts.findAccountById(session.accountId); return account ? { ...account, role: account.role || 'creator' } : undefined }
  logout(token: string | undefined): void { if (token) this.sessions.delete(token) }
  clearSessions(): void { this.sessions.clear() }
  private valid(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === undefined || item.role === 'creator' || item.role === 'admin') }
}
class LocalAccountRepository implements AccountRepository {
  private readonly store = new JsonStore(`${config.dataDirectory}/accounts.json`)
  async findAccountByEmail(email: string) { return (await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string')).find(item => item.email === email) }
  async findAccountById(id: string) { return (await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string')).find(item => item.id === id) }
  async saveAccount(account: Account) { const items = await this.store.read<Account[]>([], item => !!item && typeof (item as Account).id === 'string'); items.push(account); await this.store.write(items) }
}
