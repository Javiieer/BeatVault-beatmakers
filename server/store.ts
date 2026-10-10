import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ProjectRecord } from '../src/domains/core/contracts'
import { validateCatalogEntry, validateProjectRecord } from './validation'
import { config } from './config'
import type { Account } from './auth'
import { isCreatorProfile, type CreatorProfile } from '../src/domains/profile'
export type AssetState = 'available' | 'missing' | 'metadata-only'
export type AssetRecord = { id: string; ownerId: string; originalName: string; storageKey: string; mimeType: string; sizeBytes: number; contentHash: string; state: AssetState; createdAt: string; updatedAt: string }
export type Friendship = { id: string; requesterId: string; recipientId: string; status: 'pending' | 'accepted'; createdAt: string; updatedAt: string }
export class JsonStore {
  private static readonly queues = new Map<string, Promise<void>>()
  constructor(private readonly file: string) {}
  async read<T>(fallback: T, valid: (value: unknown) => boolean): Promise<T> {
    try { const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8')); return Array.isArray(parsed) && parsed.every(valid) ? parsed as T : fallback }
    catch { return fallback }
  }
  async write<T>(value: T): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try { await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8'); await rename(temporary, this.file) }
    catch (error) { try { await unlink(temporary) } catch { /* temporary file was already moved or removed */ }; throw error }
  }
  async update<T, R>(fallback: T, valid: (value: unknown) => boolean, mutate: (current: T) => { value: T; result: R }): Promise<R> {
    const previous = JsonStore.queues.get(this.file) ?? Promise.resolve()
    let release!: () => void
    const queued = new Promise<void>(resolve => { release = resolve })
    const tail = previous.catch(() => undefined).then(() => queued)
    JsonStore.queues.set(this.file, tail)
    await previous.catch(() => undefined)
    try {
      const current = await this.read(fallback, valid)
      const { value, result } = mutate(current)
      await this.write(value)
      return result
    } finally {
      release()
      if (JsonStore.queues.get(this.file) === tail) JsonStore.queues.delete(this.file)
    }
  }
}
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
  async findProfile(accountId: string) { return (await this.profiles.read<CreatorProfile[]>([], isCreatorProfile)).find(p => p.accountId === accountId) }
  saveProfile(profile: CreatorProfile): Promise<CreatorProfile> {
    return this.profiles.update<CreatorProfile[], CreatorProfile>([], isCreatorProfile, profiles => ({ value: [...profiles.filter(p => p.accountId !== profile.accountId), profile], result: profile }))
  }
  async listPublicProfiles(query: string, excludeAccountId: string) {
    const normalized = query.trim().toLocaleLowerCase()
    return (await this.profiles.read<CreatorProfile[]>([], isCreatorProfile)).filter(profile => profile.publicProfile && profile.accountId !== excludeAccountId && (!normalized || `${profile.displayName} ${profile.bio} ${profile.genres.join(' ')}`.toLocaleLowerCase().includes(normalized))).slice(0, 50)
  }
  listFriendships(accountId: string) { return this.friendships.read<Friendship[]>([], validFriendship).then(items => items.filter(item => item.requesterId === accountId || item.recipientId === accountId)) }
  createFriendship(friendship: Friendship) { return this.friendships.update<Friendship[], Friendship>([], validFriendship, items => {
    if (items.some(item => item.requesterId === friendship.requesterId && item.recipientId === friendship.recipientId || item.requesterId === friendship.recipientId && item.recipientId === friendship.requesterId)) throw new Error('FRIENDSHIP_EXISTS')
    return { value: [...items, friendship], result: friendship }
  }) }
  updateFriendship(id: string, actorId: string, status: Friendship['status']) { return this.friendships.update<Friendship[], Friendship | undefined>([], validFriendship, items => {
    const item = items.find(entry => entry.id === id && entry.recipientId === actorId && entry.status === 'pending')
    if (!item) return { value: items, result: undefined }
    const updated = { ...item, status, updatedAt: new Date().toISOString() }
    return { value: items.map(entry => entry.id === id ? updated : entry), result: updated }
  }) }
  deleteFriendship(id: string, actorId: string, status: Friendship['status']) { return this.friendships.update<Friendship[], boolean>([], validFriendship, items => {
    const next = items.filter(item => item.id !== id || item.status !== status || (item.requesterId !== actorId && item.recipientId !== actorId))
    return { value: next, result: next.length !== items.length }
  }) }
   constructor(private readonly projects = new JsonStore(`${config.dataDirectory}/projects.json`), private readonly catalog = new JsonStore(`${config.dataDirectory}/catalog.json`), private readonly accounts = new JsonStore(`${config.dataDirectory}/accounts.json`), private readonly assets = new JsonStore(`${config.dataDirectory}/assets.json`)) {}
  findAccountByEmail(email: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.email === email)) }
  findAccountById(id: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.id === id)) }
  listAccounts() { return this.accounts.read<Account[]>([], this.validAccount) }
  findAccountByToken(kind: 'verify' | 'reset', hash: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => (kind === 'verify' ? item.verificationTokenHash : item.resetTokenHash) === hash)) }
  async saveAccount(account: Account) { await this.accounts.update<Account[], void>([], this.validAccount, items => { const index = items.findIndex(item => item.id === account.id); if (index >= 0) items[index] = account; else items.push(account); return { value: items, result: undefined } }) }
  private validAccount(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === 'creator' || item.role === 'admin') }
 listProjects(ownerId?: string) { return this.projects.read<ProjectRecord[]>([], validateProjectRecord).then(items => ownerId ? items.filter(item => item.ownerId === ownerId) : items) }
 listCatalog() { return this.catalog.read<CatalogEntry[]>([], validateCatalogEntry) }
  createCatalog(entry: CatalogEntry) { return this.catalog.update<CatalogEntry[], CatalogEntry>([], validateCatalogEntry, items => {
    const existing = entry.assetId && items.find(item => item.creatorId === entry.creatorId && item.assetId === entry.assetId)
    if (existing) return { value: items, result: existing }
    if (items.some(item => item.creatorId === entry.creatorId && item.title.toLowerCase() === entry.title.toLowerCase() && item.type === entry.type)) throw new Error('DUPLICATE_CATALOG')
    return { value: [...items, entry], result: entry }
  }) }
  updateCatalog(id: string, input: CatalogInput, ownerId: string) { return this.catalog.update<CatalogEntry[], CatalogEntry>([], validateCatalogEntry, items => {
    const index = items.findIndex(item => item.contentId === id && item.creatorId === ownerId)
    if (index < 0) throw new Error('CATALOG_NOT_FOUND')
    if (items.some(item => item.contentId !== id && item.creatorId === ownerId && item.title.toLowerCase() === input.title.toLowerCase() && item.type === input.type)) throw new Error('DUPLICATE_CATALOG')
    const updated = { ...items[index], ...input, ...(input.publicationStatus === 'pending-review' ? { reviewNote: undefined } : {}) }
    return { value: items.map((item, itemIndex) => itemIndex === index ? updated : item), result: updated }
  }) }
  reviewCatalog(id: string, status: 'published' | 'rejected', note?: string) { return this.catalog.update<CatalogEntry[], CatalogEntry | undefined>([], validateCatalogEntry, items => {
    const index = items.findIndex(item => item.contentId === id && item.publicationStatus === 'pending-review')
    if (index < 0) return { value: items, result: undefined }
    const updated = { ...items[index], publicationStatus: status, reviewNote: status === 'rejected' ? note : undefined }
    return { value: items.map((item, itemIndex) => itemIndex === index ? updated : item), result: updated }
  }) }
  deleteCatalog(id: string, ownerId: string) { return this.catalog.update<CatalogEntry[], void>([], validateCatalogEntry, items => {
    const next = items.filter(item => item.contentId !== id || item.creatorId !== ownerId)
    if (next.length === items.length) throw new Error('CATALOG_NOT_FOUND')
    return { value: next, result: undefined }
  }) }
  createProject(project: ProjectRecord) { return this.projects.update<ProjectRecord[], ProjectRecord>([], validateProjectRecord, items => {
    if (items.some(item => item.ownerId === project.ownerId && item.title.toLowerCase() === project.title.toLowerCase())) throw new Error('DUPLICATE')
    return { value: [...items, project], result: project }
  }) }
  updateProject(id: string, input: Pick<ProjectRecord, 'title' | 'status'>, ownerId: string) { return this.projects.update<ProjectRecord[], ProjectRecord>([], validateProjectRecord, items => {
    const index = items.findIndex(item => item.id === id && item.ownerId === ownerId)
    if (index < 0) throw new Error('NOT_FOUND')
    if (items.some(item => item.id !== id && item.ownerId === ownerId && item.title.toLowerCase() === input.title.toLowerCase())) throw new Error('DUPLICATE')
    const updated = { ...items[index], ...input, updatedAt: new Date().toISOString() }
    return { value: items.map((item, itemIndex) => itemIndex === index ? updated : item), result: updated }
  }) }
  deleteProject(id: string, ownerId: string) { return this.projects.update<ProjectRecord[], void>([], validateProjectRecord, items => {
    const next = items.filter(item => item.id !== id || item.ownerId !== ownerId)
    if (next.length === items.length) throw new Error('NOT_FOUND')
    return { value: next, result: undefined }
  }) }
  listAssets(ownerId?: string) { return this.assets.read<AssetRecord[]>([], this.validAsset).then(items => ownerId ? items.filter(item => item.ownerId === ownerId) : items) }
  findAsset(id: string, ownerId?: string) { return this.listAssets(ownerId).then(items => items.find(item => item.id === id)) }
  findDuplicateAsset(input: Pick<AssetRecord, 'ownerId' | 'contentHash'>) { return this.listAssets(input.ownerId).then(items => items.find(item => item.contentHash === input.contentHash && item.state !== 'missing')) }
  createAsset(asset: AssetRecord) { return this.assets.update<AssetRecord[], AssetRecord>([], this.validAsset, items => {
    if (items.some(item => item.ownerId === asset.ownerId && item.contentHash === asset.contentHash && item.state !== 'missing')) throw new Error('DUPLICATE_ASSET')
    return { value: [...items, asset], result: asset }
  }) }
  updateAssetState(id: string, state: AssetState) { return this.assets.update<AssetRecord[], void>([], this.validAsset, items => ({ value: items.map(item => item.id === id ? { ...item, state, updatedAt: new Date().toISOString() } : item), result: undefined })) }
  deleteAsset(id: string, ownerId: string) { return this.assets.update<AssetRecord[], void>([], this.validAsset, items => {
    const next = items.filter(item => item.id !== id || item.ownerId !== ownerId)
    if (next.length === items.length) throw new Error('ASSET_NOT_FOUND')
    return { value: next, result: undefined }
  }) }
  private validAsset(value: unknown): value is AssetRecord { const item = value as Partial<AssetRecord>; return !!value && typeof item.id === 'string' && typeof item.ownerId === 'string' && typeof item.originalName === 'string' && typeof item.storageKey === 'string' && typeof item.mimeType === 'string' && typeof item.sizeBytes === 'number' && typeof item.contentHash === 'string' && ['available', 'missing', 'metadata-only'].includes(item.state || '') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' }
}
const validFriendship = (value: unknown): value is Friendship => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Friendship>
  return typeof item.id === 'string' && typeof item.requesterId === 'string' && typeof item.recipientId === 'string' && item.requesterId !== item.recipientId && (item.status === 'pending' || item.status === 'accepted') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}
