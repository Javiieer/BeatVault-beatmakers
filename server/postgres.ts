import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ProjectRecord, ProjectStatus } from '../src/domains/core/contracts'
import type { AssetRecord, AssetState, Friendship, ServerRepository } from './store'
import type { Account } from './auth'
import type { CreatorProfile } from '../src/domains/profile'

export type SqlResult<Row> = { rows: Row[] }
export interface SqlClient {
  query<Row>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>
}

type ProjectRow = { id: string; owner_id: string; title: string; status: ProjectStatus; updated_at: string }
type CatalogRow = { content_id: string; creator_id: string; type: CatalogEntry['type']; title: string; tag_ids: string[]; preview_ids: string[]; publication_status: CatalogEntry['publicationStatus']; asset_id: string | null; cover_id: CatalogEntry['coverId'] | null; review_note: string | null }
type AccountRow = { id: string; email: string; password_hash: string; role: Account['role']; verification_state: Account['verificationState']; verification_token_hash?: string; verification_token_expires_at?: string; reset_token_hash?: string; reset_token_expires_at?: string }
type AssetRow = { id: string; owner_id: string; original_name: string; storage_key: string; mime_type: string; size_bytes: number; content_hash: string; state: AssetState; created_at: string; updated_at: string }

const project = (row: ProjectRow): ProjectRecord => ({ id: row.id, ownerId: row.owner_id, title: row.title, status: row.status, updatedAt: row.updated_at })
const catalog = (row: CatalogRow): CatalogEntry => ({ contentId: row.content_id, creatorId: row.creator_id, type: row.type, title: row.title, tagIds: row.tag_ids, previewIds: row.preview_ids, publicationStatus: row.publication_status, assetId: row.asset_id ?? undefined, coverId: row.cover_id ?? undefined, reviewNote: row.review_note ?? undefined })
const catalogColumns = 'content_id, creator_id, type, title, tag_ids, preview_ids, publication_status, asset_id, cover_id, review_note'

/** SQL-only adapter. A PostgreSQL driver and transaction boundary are injected by a later platform phase. */
export class PostgresRepository implements ServerRepository {
  constructor(private readonly db: SqlClient) {}
  async findProfile(accountId: string) {
    const result = await this.db.query<{ account_id: string; metadata: Omit<CreatorProfile, 'accountId'> }>('SELECT account_id, metadata FROM creator_profiles WHERE account_id = $1', [accountId])
    const row = result.rows[0]
    return row ? { ...row.metadata, accountId: row.account_id } : undefined
  }
  async saveProfile(profile: CreatorProfile) {
    const { accountId, ...metadata } = profile
    await this.db.query('INSERT INTO creator_profiles (account_id, metadata) VALUES ($1, $2) ON CONFLICT (account_id) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = NOW()', [accountId, JSON.stringify(metadata)])
    return profile
  }
  async listPublicProfiles(query: string, excludeAccountId: string) {
    const result = await this.db.query<{ account_id: string; metadata: Omit<CreatorProfile, 'accountId'> }>("SELECT account_id, metadata FROM creator_profiles WHERE account_id <> $1 AND metadata->>'publicProfile' = 'true' AND ($2 = '' OR concat_ws(' ', metadata->>'displayName', metadata->>'bio', metadata->>'genres') ILIKE $3) ORDER BY lower(metadata->>'displayName') LIMIT 50", [excludeAccountId, query.trim(), `%${query.trim()}%`])
    return result.rows.map(row => ({ ...row.metadata, accountId: row.account_id }))
  }
  async listFriendships(accountId: string): Promise<Friendship[]> {
    const result = await this.db.query<Friendship>('SELECT id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt" FROM friendships WHERE requester_id = $1 OR recipient_id = $1', [accountId])
    return result.rows
  }
  async createFriendship(input: Friendship): Promise<Friendship> {
    const result = await this.db.query<Friendship>('INSERT INTO friendships (id, requester_id, recipient_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt"', [input.id, input.requesterId, input.recipientId, input.status, input.createdAt, input.updatedAt])
    return result.rows[0]
  }
  async updateFriendship(id: string, actorId: string, status: Friendship['status']) {
    const result = await this.db.query<Friendship>('UPDATE friendships SET status = $1, updated_at = NOW() WHERE id = $2 AND recipient_id = $3 AND status = $4 RETURNING id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt"', [status, id, actorId, 'pending'])
    return result.rows[0]
  }
  async deleteFriendship(id: string, actorId: string, status: Friendship['status']) {
    const result = await this.db.query('DELETE FROM friendships WHERE id = $1 AND status = $3 AND (requester_id = $2 OR recipient_id = $2) RETURNING id', [id, actorId, status])
    return result.rows.length > 0
  }
  async findAccountByEmail(email: string) { const result = await this.db.query<AccountRow>('SELECT * FROM accounts WHERE email = $1', [email]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async findAccountById(id: string) { const result = await this.db.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [id]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async listAccounts() { const result = await this.db.query<AccountRow>('SELECT * FROM accounts ORDER BY email ASC'); return result.rows.map(account) }
  async findAccountByToken(kind: 'verify' | 'reset', hash: string) { const column = kind === 'verify' ? 'verification_token_hash' : 'reset_token_hash'; const result = await this.db.query<AccountRow>(`SELECT * FROM accounts WHERE ${column} = $1`, [hash]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async saveAccount(input: Account) { await this.db.query('INSERT INTO accounts (id, email, password_hash, role, verification_state, verification_token_hash, verification_token_expires_at, reset_token_hash, reset_token_expires_at) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), $8, to_timestamp($9 / 1000.0)) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, verification_state = EXCLUDED.verification_state, verification_token_hash = EXCLUDED.verification_token_hash, verification_token_expires_at = EXCLUDED.verification_token_expires_at, reset_token_hash = EXCLUDED.reset_token_hash, reset_token_expires_at = EXCLUDED.reset_token_expires_at', [input.id, input.email, input.passwordHash, input.role, input.verificationState, input.verificationTokenHash ?? null, input.verificationTokenExpiresAt ?? null, input.resetTokenHash ?? null, input.resetTokenExpiresAt ?? null]) }

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
  async listCatalog(): Promise<CatalogEntry[]> { const result = await this.db.query<CatalogRow>(`SELECT ${catalogColumns} FROM catalog_assets ORDER BY updated_at DESC`); return result.rows.map(catalog) }
  async createCatalog(input: CatalogEntry): Promise<CatalogEntry> { const result = await this.db.query<CatalogRow>(`INSERT INTO catalog_assets (${catalogColumns}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (creator_id, asset_id) WHERE asset_id IS NOT NULL DO UPDATE SET asset_id = EXCLUDED.asset_id RETURNING ${catalogColumns}`, [input.contentId, input.creatorId, input.type, input.title, input.tagIds, input.previewIds, input.publicationStatus, input.assetId ?? null, input.coverId ?? null, input.reviewNote ?? null]); return catalog(result.rows[0]) }
  async updateCatalog(id: string, input: CatalogInput, ownerId: string): Promise<CatalogEntry> { const result = await this.db.query<CatalogRow>(`UPDATE catalog_assets SET title = $1, type = $2, tag_ids = $3, publication_status = $4, cover_id = COALESCE($7, cover_id), review_note = CASE WHEN $4 = 'pending-review' THEN NULL ELSE review_note END, updated_at = NOW() WHERE content_id = $5 AND creator_id = $6 RETURNING ${catalogColumns}`, [input.title, input.type, input.tagIds, input.publicationStatus, id, ownerId, input.coverId ?? null]); if (!result.rows[0]) throw new Error('CATALOG_NOT_FOUND'); return catalog(result.rows[0]) }
  async reviewCatalog(id: string, status: 'published' | 'rejected', note?: string) { const result = await this.db.query<CatalogRow>(`UPDATE catalog_assets SET publication_status = $1, review_note = $3, updated_at = NOW() WHERE content_id = $2 AND publication_status = 'pending-review' RETURNING ${catalogColumns}`, [status, id, status === 'rejected' ? note ?? null : null]); return result.rows[0] ? catalog(result.rows[0]) : undefined }
  async deleteCatalog(id: string, ownerId: string): Promise<void> { await this.db.query('DELETE FROM catalog_assets WHERE content_id = $1 AND creator_id = $2', [id, ownerId]) }
  async listAssets(ownerId?: string) { const r = await this.db.query<AssetRow>('SELECT id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at FROM assets WHERE ($1::text IS NULL OR owner_id = $1) ORDER BY created_at DESC', [ownerId ?? null]); return r.rows.map(asset) }
  async findAsset(id: string, ownerId?: string) { const r = await this.db.query<AssetRow>('SELECT id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at FROM assets WHERE id = $1 AND ($2::text IS NULL OR owner_id = $2)', [id, ownerId ?? null]); return r.rows[0] ? asset(r.rows[0]) : undefined }
  async findDuplicateAsset(input: Pick<AssetRecord, 'ownerId' | 'contentHash'>) { const r = await this.db.query<AssetRow>('SELECT id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at FROM assets WHERE owner_id = $1 AND content_hash = $2 AND state <> $3 LIMIT 1', [input.ownerId, input.contentHash, 'missing']); return r.rows[0] ? asset(r.rows[0]) : undefined }
  async createAsset(input: AssetRecord) { const r = await this.db.query<AssetRow>('INSERT INTO assets (id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at', [input.id,input.ownerId,input.originalName,input.storageKey,input.mimeType,input.sizeBytes,input.contentHash,input.state,input.createdAt,input.updatedAt]); return asset(r.rows[0]) }
  async updateAssetState(id: string, state: AssetState) { await this.db.query('UPDATE assets SET state = $1, updated_at = NOW() WHERE id = $2', [state, id]) }
  async deleteAsset(id: string, ownerId: string) { const r = await this.db.query('DELETE FROM assets WHERE id = $1 AND owner_id = $2', [id, ownerId]); if (r.rows.length === 0) { /* ownership-safe idempotence */ } }
}
const asset = (row: AssetRow): AssetRecord => ({ id: row.id, ownerId: row.owner_id, originalName: row.original_name, storageKey: row.storage_key, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), contentHash: row.content_hash, state: row.state, createdAt: row.created_at, updatedAt: row.updated_at })
const account = (row: AccountRow): Account => ({ id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, verificationState: row.verification_state || 'unverified', verificationTokenHash: row.verification_token_hash, verificationTokenExpiresAt: row.verification_token_expires_at ? Date.parse(row.verification_token_expires_at) : undefined, resetTokenHash: row.reset_token_hash, resetTokenExpiresAt: row.reset_token_expires_at ? Date.parse(row.reset_token_expires_at) : undefined })
