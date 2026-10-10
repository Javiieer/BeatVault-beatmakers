import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ProjectRecord } from '../src/domains/core/contracts'
import { validateCatalogEntry, validateProjectRecord } from './validation'
import { config } from './config'
import type { Account } from './auth'
import { isCreatorProfile, type CreatorProfile } from '../src/domains/profile'
export type AssetState = 'available' | 'missing' | 'metadata-only'
export type AssetRecord = { id: string; ownerId: string; originalName: string; storageKey: string; mimeType: string; sizeBytes: number; contentHash: string; state: AssetState; createdAt: string; updatedAt: string }
export type Friendship = { id: string; requesterId: string; recipientId: string; status: 'pending' | 'accepted'; createdAt: string; updatedAt: string }
export class JsonStore { constructor(private readonly file: string) {} async read<T>(fallback: T, valid: (value: unknown) => boolean): Promise<T> { try { const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8')); return Array.isArray(parsed) && parsed.every(valid) ? parsed as T : fallback } catch { return fallback } } async write<T>(value: T): Promise<void> { await mkdir(dirname(this.file), { recursive: true }); const temporary = `${this.file}.${Date.now()}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8'); try { await unlink(this.file) } catch { /* first write */ } await rename(temporary, this.file) } }
export interface ServerRepository {
  findProfile(accountId: string): Promise<CreatorProfile | undefined>
  saveProfile(profile: CreatorProfile): Promise<CreatorProfile>
  listPublicProfiles(query: string, excludeAccountId: string): Promise<CreatorProfile[]>
  listFriendships(accountId: string): Promise<Friendship[]>
  createFriendship(friendship: Friendship): Promise<Friendship>
  updateFriendship(id: string, actorId: string, status: Friendship['status']): Promise<Friendship | undefined>
  deleteFriendship(id: string, actorId: string, status: Friendship['status']): Promise<boolean>
  findAccountByEmail(email: string): Promise<Account | undefined>
  findAccountById(id: string): Promise<Account | undefined>
  listAccounts(): Promise<Account[]>
  findAccountByToken(kind: 'verify' | 'reset', hash: string): Promise<Account | undefined>
  saveAccount(account: Account): Promise<void>
  listProjects(ownerId?: string): Promise<ProjectRecord[]>
  createProject(project: ProjectRecord): Promise<ProjectRecord>
  updateProject(id: string, input: Pick<ProjectRecord, 'title' | 'status'>, ownerId: string): Promise<ProjectRecord>
  deleteProject(id: string, ownerId: string): Promise<void>
  listCatalog(): Promise<CatalogEntry[]>
  createCatalog(entry: CatalogEntry): Promise<CatalogEntry>
  updateCatalog(id: string, input: CatalogInput, ownerId: string): Promise<CatalogEntry>
  reviewCatalog(id: string, status: 'published' | 'rejected', note?: string): Promise<CatalogEntry | undefined>
  deleteCatalog(id: string, ownerId: string): Promise<void>
  listAssets(ownerId?: string): Promise<AssetRecord[]>
  findAsset(id: string, ownerId?: string): Promise<AssetRecord | undefined>
  findDuplicateAsset(asset: Pick<AssetRecord, 'ownerId' | 'contentHash'>): Promise<AssetRecord | undefined>
  createAsset(asset: AssetRecord): Promise<AssetRecord>
  updateAssetState(id: string, state: AssetState): Promise<void>
  deleteAsset(id: string, ownerId: string): Promise<void>
}

export class LocalRepository implements ServerRepository {
  private readonly profiles = new JsonStore(`${config.dataDirectory}/profiles.json`)
  private readonly friendships = new JsonStore(`${config.dataDirectory}/friendships.json`)
  private profileQueue: Promise<unknown> = Promise.resolve()
  async findProfile(accountId: string) { return (await this.profiles.read<CreatorProfile[]>([], isCreatorProfile)).find(p => p.accountId === accountId) }
  saveProfile(profile: CreatorProfile): Promise<CreatorProfile> {
    const operation = this.profileQueue.then(async () => {
      const profiles = await this.profiles.read<CreatorProfile[]>([], isCreatorProfile)
      await this.profiles.write([...profiles.filter(p => p.accountId !== profile.accountId), profile])
      return profile
    })
    this.profileQueue = operation.catch(() => undefined)
    return operation
  }
  async listPublicProfiles(query: string, excludeAccountId: string) {
    const normalized = query.trim().toLocaleLowerCase()
    return (await this.profiles.read<CreatorProfile[]>([], isCreatorProfile)).filter(profile => profile.publicProfile && profile.accountId !== excludeAccountId && (!normalized || `${profile.displayName} ${profile.bio} ${profile.genres.join(' ')}`.toLocaleLowerCase().includes(normalized))).slice(0, 50)
  }
  listFriendships(accountId: string) { return this.friendships.read<Friendship[]>([], validFriendship).then(items => items.filter(item => item.requesterId === accountId || item.recipientId === accountId)) }
  async createFriendship(friendship: Friendship) {
    const items = await this.friendships.read<Friendship[]>([], validFriendship)
    if (items.some(item => item.requesterId === friendship.requesterId && item.recipientId === friendship.recipientId || item.requesterId === friendship.recipientId && item.recipientId === friendship.requesterId)) throw new Error('FRIENDSHIP_EXISTS')
    await this.friendships.write([...items, friendship]); return friendship
  }
  async updateFriendship(id: string, actorId: string, status: Friendship['status']) {
    const items = await this.friendships.read<Friendship[]>([], validFriendship)
    const item = items.find(entry => entry.id === id && entry.recipientId === actorId && entry.status === 'pending')
    if (!item) return undefined
    const updated = { ...item, status, updatedAt: new Date().toISOString() }
    await this.friendships.write(items.map(entry => entry.id === id ? updated : entry)); return updated
  }
  async deleteFriendship(id: string, actorId: string, status: Friendship['status']) {
    const items = await this.friendships.read<Friendship[]>([], validFriendship)
    const next = items.filter(item => item.id !== id || item.status !== status || (item.requesterId !== actorId && item.recipientId !== actorId))
    if (next.length === items.length) return false
    await this.friendships.write(next); return true
  }
   constructor(private readonly projects = new JsonStore(`${config.dataDirectory}/projects.json`), private readonly catalog = new JsonStore(`${config.dataDirectory}/catalog.json`), private readonly accounts = new JsonStore(`${config.dataDirectory}/accounts.json`), private readonly assets = new JsonStore(`${config.dataDirectory}/assets.json`)) {}
  findAccountByEmail(email: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.email === email)) }
  findAccountById(id: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.id === id)) }
  listAccounts() { return this.accounts.read<Account[]>([], this.validAccount) }
  findAccountByToken(kind: 'verify' | 'reset', hash: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => (kind === 'verify' ? item.verificationTokenHash : item.resetTokenHash) === hash)) }
  async saveAccount(account: Account) { const items = await this.accounts.read<Account[]>([], this.validAccount); const index = items.findIndex(item => item.id === account.id); if (index >= 0) items[index] = account; else items.push(account); await this.accounts.write(items) }
  private validAccount(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === 'creator' || item.role === 'admin') }
 listProjects(ownerId?: string) { return this.projects.read<ProjectRecord[]>([], validateProjectRecord).then(items => ownerId ? items.filter(item => item.ownerId === ownerId) : items) }
 listCatalog() { return this.catalog.read<CatalogEntry[]>([], validateCatalogEntry) }
  async createCatalog(entry: CatalogEntry) { const items = await this.listCatalog(); const existing = entry.assetId && items.find(item => item.creatorId === entry.creatorId && item.assetId === entry.assetId); if (existing) return existing; if (items.some(item => item.creatorId === entry.creatorId && item.title.toLowerCase() === entry.title.toLowerCase() && item.type === entry.type)) throw new Error('DUPLICATE_CATALOG'); items.push(entry); await this.catalog.write(items); return entry }
  async updateCatalog(id: string, input: CatalogInput, ownerId: string) { const items = await this.listCatalog(); const index = items.findIndex(item => item.contentId === id && item.creatorId === ownerId); if (index < 0) throw new Error('CATALOG_NOT_FOUND'); if (items.some(item => item.contentId !== id && item.creatorId === ownerId && item.title.toLowerCase() === input.title.toLowerCase() && item.type === input.type)) throw new Error('DUPLICATE_CATALOG'); const updated = { ...items[index], ...input, ...(input.publicationStatus === 'pending-review' ? { reviewNote: undefined } : {}) }; items[index] = updated; await this.catalog.write(items); return updated }
  async reviewCatalog(id: string, status: 'published' | 'rejected', note?: string) { const items = await this.listCatalog(); const index = items.findIndex(item => item.contentId === id && item.publicationStatus === 'pending-review'); if (index < 0) return undefined; const updated = { ...items[index], publicationStatus: status, reviewNote: status === 'rejected' ? note : undefined }; items[index] = updated; await this.catalog.write(items); return updated }
  async deleteCatalog(id: string, ownerId: string) { const items = await this.listCatalog(); const next = items.filter(item => item.contentId !== id || item.creatorId !== ownerId); if (next.length === items.length) throw new Error('CATALOG_NOT_FOUND'); await this.catalog.write(next) }
 async createProject(project: ProjectRecord) { const items = await this.listProjects(); if (items.some(item => item.ownerId === project.ownerId && item.title.toLowerCase() === project.title.toLowerCase())) throw new Error('DUPLICATE'); items.push(project); await this.projects.write(items); return project }
 async updateProject(id: string, input: Pick<ProjectRecord, 'title' | 'status'>, ownerId: string) { const items = await this.listProjects(); const index = items.findIndex(item => item.id === id && item.ownerId === ownerId); if (index < 0) throw new Error('NOT_FOUND'); const current = items[index]; if (items.some(item => item.id !== id && item.ownerId === ownerId && item.title.toLowerCase() === input.title.toLowerCase())) throw new Error('DUPLICATE'); const updated = { ...current, ...input, updatedAt: new Date().toISOString() }; items[index] = updated; await this.projects.write(items); return updated }
  async deleteProject(id: string, ownerId: string) { const items = await this.listProjects(); const next = items.filter(item => item.id !== id || item.ownerId !== ownerId); if (next.length === items.length) throw new Error('NOT_FOUND'); await this.projects.write(next) }
  listAssets(ownerId?: string) { return this.assets.read<AssetRecord[]>([], this.validAsset).then(items => ownerId ? items.filter(item => item.ownerId === ownerId) : items) }
  findAsset(id: string, ownerId?: string) { return this.listAssets(ownerId).then(items => items.find(item => item.id === id)) }
  findDuplicateAsset(input: Pick<AssetRecord, 'ownerId' | 'contentHash'>) { return this.listAssets(input.ownerId).then(items => items.find(item => item.contentHash === input.contentHash && item.state !== 'missing')) }
  async createAsset(asset: AssetRecord) { const items = await this.listAssets(); if (await this.findDuplicateAsset(asset)) throw new Error('DUPLICATE_ASSET'); items.push(asset); await this.assets.write(items); return asset }
  async updateAssetState(id: string, state: AssetState) { const items = await this.listAssets(); const item = items.find(candidate => candidate.id === id); if (item) { item.state = state; item.updatedAt = new Date().toISOString(); await this.assets.write(items) } }
  async deleteAsset(id: string, ownerId: string) { const items = await this.listAssets(); const next = items.filter(item => item.id !== id || item.ownerId !== ownerId); if (next.length === items.length) throw new Error('ASSET_NOT_FOUND'); await this.assets.write(next) }
  private validAsset(value: unknown): value is AssetRecord { const item = value as Partial<AssetRecord>; return !!value && typeof item.id === 'string' && typeof item.ownerId === 'string' && typeof item.originalName === 'string' && typeof item.storageKey === 'string' && typeof item.mimeType === 'string' && typeof item.sizeBytes === 'number' && typeof item.contentHash === 'string' && ['available', 'missing', 'metadata-only'].includes(item.state || '') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' }
}
const validFriendship = (value: unknown): value is Friendship => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Friendship>
  return typeof item.id === 'string' && typeof item.requesterId === 'string' && typeof item.recipientId === 'string' && item.requesterId !== item.recipientId && (item.status === 'pending' || item.status === 'accepted') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}
