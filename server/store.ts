import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CatalogEntry } from '../src/domains/catalog/types'
import type { ProjectRecord } from '../src/domains/core/contracts'
import { validateCatalogEntry, validateProjectRecord } from './validation'
import { config } from './config'
import type { Account } from './auth'
export class JsonStore { constructor(private readonly file: string) {} async read<T>(fallback: T, valid: (value: unknown) => boolean): Promise<T> { try { const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8')); return Array.isArray(parsed) && parsed.every(valid) ? parsed as T : fallback } catch { return fallback } } async write<T>(value: T): Promise<void> { await mkdir(dirname(this.file), { recursive: true }); const temporary = `${this.file}.${Date.now()}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8'); try { await unlink(this.file) } catch { /* first write */ } await rename(temporary, this.file) } }
export interface ServerRepository {
  findAccountByEmail(email: string): Promise<Account | undefined>
  findAccountById(id: string): Promise<Account | undefined>
  saveAccount(account: Account): Promise<void>
  listProjects(ownerId?: string): Promise<ProjectRecord[]>
  createProject(project: ProjectRecord): Promise<ProjectRecord>
  updateProject(id: string, input: Pick<ProjectRecord, 'title' | 'status'>, ownerId: string): Promise<ProjectRecord>
  deleteProject(id: string, ownerId: string): Promise<void>
  listCatalog(): Promise<CatalogEntry[]>
  createCatalog(entry: CatalogEntry): Promise<CatalogEntry>
  updateCatalog(id: string, input: Pick<CatalogEntry, 'title' | 'type' | 'tagIds' | 'publicationStatus'>, ownerId: string): Promise<CatalogEntry>
  deleteCatalog(id: string, ownerId: string): Promise<void>
}

export class LocalRepository implements ServerRepository {
   constructor(private readonly projects = new JsonStore(`${config.dataDirectory}/projects.json`), private readonly catalog = new JsonStore(`${config.dataDirectory}/catalog.json`), private readonly accounts = new JsonStore(`${config.dataDirectory}/accounts.json`)) {}
  findAccountByEmail(email: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.email === email)) }
  findAccountById(id: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.id === id)) }
  async saveAccount(account: Account) { const items = await this.accounts.read<Account[]>([], this.validAccount); const index = items.findIndex(item => item.id === account.id); if (index >= 0) items[index] = account; else items.push(account); await this.accounts.write(items) }
  private validAccount(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === 'creator' || item.role === 'admin') }
 listProjects(ownerId?: string) { return this.projects.read<ProjectRecord[]>([], validateProjectRecord).then(items => ownerId ? items.filter(item => item.ownerId === ownerId) : items) }
 listCatalog() { return this.catalog.read<CatalogEntry[]>([], validateCatalogEntry) }
  async createCatalog(entry: CatalogEntry) { const items = await this.listCatalog(); if (items.some(item => item.creatorId === entry.creatorId && item.title.toLowerCase() === entry.title.toLowerCase() && item.type === entry.type)) throw new Error('DUPLICATE_CATALOG'); items.push(entry); await this.catalog.write(items); return entry }
  async updateCatalog(id: string, input: Pick<CatalogEntry, 'title' | 'type' | 'tagIds' | 'publicationStatus'>, ownerId: string) { const items = await this.listCatalog(); const index = items.findIndex(item => item.contentId === id && item.creatorId === ownerId); if (index < 0) throw new Error('CATALOG_NOT_FOUND'); if (items.some(item => item.contentId !== id && item.creatorId === ownerId && item.title.toLowerCase() === input.title.toLowerCase() && item.type === input.type)) throw new Error('DUPLICATE_CATALOG'); const updated = { ...items[index], ...input }; items[index] = updated; await this.catalog.write(items); return updated }
  async deleteCatalog(id: string, ownerId: string) { const items = await this.listCatalog(); const next = items.filter(item => item.contentId !== id || item.creatorId !== ownerId); if (next.length === items.length) throw new Error('CATALOG_NOT_FOUND'); await this.catalog.write(next) }
 async createProject(project: ProjectRecord) { const items = await this.listProjects(); if (items.some(item => item.ownerId === project.ownerId && item.title.toLowerCase() === project.title.toLowerCase())) throw new Error('DUPLICATE'); items.push(project); await this.projects.write(items); return project }
 async updateProject(id: string, input: Pick<ProjectRecord, 'title' | 'status'>, ownerId: string) { const items = await this.listProjects(); const index = items.findIndex(item => item.id === id && item.ownerId === ownerId); if (index < 0) throw new Error('NOT_FOUND'); const current = items[index]; if (items.some(item => item.id !== id && item.ownerId === ownerId && item.title.toLowerCase() === input.title.toLowerCase())) throw new Error('DUPLICATE'); const updated = { ...current, ...input, updatedAt: new Date().toISOString() }; items[index] = updated; await this.projects.write(items); return updated }
 async deleteProject(id: string, ownerId: string) { const items = await this.listProjects(); const next = items.filter(item => item.id !== id || item.ownerId !== ownerId); if (next.length === items.length) throw new Error('NOT_FOUND'); await this.projects.write(next) }
}
