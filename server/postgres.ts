import type { CatalogEntry } from '../src/domains/catalog/types'
import type { ProjectRecord, ProjectStatus } from '../src/domains/core/contracts'
import type { ServerRepository } from './store'
import type { Account } from './auth'

export type SqlResult<Row> = { rows: Row[] }
export interface SqlClient {
  query<Row>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>
}

type ProjectRow = { id: string; owner_id: string; title: string; status: ProjectStatus; updated_at: string }
type CatalogRow = { content_id: string; creator_id: string; type: CatalogEntry['type']; title: string; tag_ids: string[]; preview_ids: string[]; publication_status: CatalogEntry['publicationStatus'] }
type AccountRow = { id: string; email: string; password_hash: string; role: Account['role'] }

const project = (row: ProjectRow): ProjectRecord => ({ id: row.id, ownerId: row.owner_id, title: row.title, status: row.status, updatedAt: row.updated_at })
const catalog = (row: CatalogRow): CatalogEntry => ({ contentId: row.content_id, creatorId: row.creator_id, type: row.type, title: row.title, tagIds: row.tag_ids, previewIds: row.preview_ids, publicationStatus: row.publication_status })

/** SQL-only adapter. A PostgreSQL driver and transaction boundary are injected by a later platform phase. */
export class PostgresRepository implements ServerRepository {
  constructor(private readonly db: SqlClient) {}
  async findAccountByEmail(email: string) { const result = await this.db.query<AccountRow>('SELECT id, email, password_hash, role FROM accounts WHERE email = $1', [email]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async findAccountById(id: string) { const result = await this.db.query<AccountRow>('SELECT id, email, password_hash, role FROM accounts WHERE id = $1', [id]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async saveAccount(input: Account) { await this.db.query('INSERT INTO accounts (id, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role', [input.id, input.email, input.passwordHash, input.role]) }

  async listProjects(ownerId?: string): Promise<ProjectRecord[]> {
    const result = await this.db.query<ProjectRow>('SELECT id, owner_id, title, status, updated_at FROM projects WHERE ($1::text IS NULL OR owner_id = $1) ORDER BY updated_at DESC', [ownerId ?? null])
    return result.rows.map(project)
  }
  async createProject(input: ProjectRecord): Promise<ProjectRecord> {
    const result = await this.db.query<ProjectRow>('INSERT INTO projects (id, owner_id, title, status, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, owner_id, title, status, updated_at', [input.id, input.ownerId, input.title, input.status, input.updatedAt])
    return project(result.rows[0])
  }
  async updateProject(id: string, input: Pick<ProjectRecord, 'title' | 'status'>, ownerId: string): Promise<ProjectRecord> {
    const result = await this.db.query<ProjectRow>('UPDATE projects SET title = $1, status = $2, updated_at = NOW() WHERE id = $3 AND owner_id = $4 RETURNING id, owner_id, title, status, updated_at', [input.title, input.status, id, ownerId])
    if (!result.rows[0]) throw new Error('NOT_FOUND')
    return project(result.rows[0])
  }
  async deleteProject(id: string, ownerId: string): Promise<void> { await this.db.query('DELETE FROM projects WHERE id = $1 AND owner_id = $2', [id, ownerId]) }
  async listCatalog(): Promise<CatalogEntry[]> { const result = await this.db.query<CatalogRow>('SELECT content_id, creator_id, type, title, tag_ids, preview_ids, publication_status FROM catalog_assets ORDER BY updated_at DESC'); return result.rows.map(catalog) }
  async createCatalog(input: CatalogEntry): Promise<CatalogEntry> { const result = await this.db.query<CatalogRow>('INSERT INTO catalog_assets (content_id, creator_id, type, title, tag_ids, preview_ids, publication_status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING content_id, creator_id, type, title, tag_ids, preview_ids, publication_status', [input.contentId, input.creatorId, input.type, input.title, input.tagIds, input.previewIds, input.publicationStatus]); return catalog(result.rows[0]) }
  async updateCatalog(id: string, input: Pick<CatalogEntry, 'title' | 'type' | 'tagIds' | 'publicationStatus'>, ownerId: string): Promise<CatalogEntry> { const result = await this.db.query<CatalogRow>('UPDATE catalog_assets SET title = $1, type = $2, tag_ids = $3, publication_status = $4, updated_at = NOW() WHERE content_id = $5 AND creator_id = $6 RETURNING content_id, creator_id, type, title, tag_ids, preview_ids, publication_status', [input.title, input.type, input.tagIds, input.publicationStatus, id, ownerId]); if (!result.rows[0]) throw new Error('CATALOG_NOT_FOUND'); return catalog(result.rows[0]) }
  async deleteCatalog(id: string, ownerId: string): Promise<void> { await this.db.query('DELETE FROM catalog_assets WHERE content_id = $1 AND creator_id = $2', [id, ownerId]) }
}
const account = (row: AccountRow): Account => ({ id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role })
