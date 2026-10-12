import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ProjectRecord, ProjectStatus } from '../src/domains/core/contracts'
import { StorageQuotaExceededError, type AssetRecord, type AssetState, type Friendship, type ServerRepository, type StorageQuotaRecord } from './store'
import type { Account } from './auth'
import type { CreatorProfile } from '../src/domains/profile'
import type { ChatConversation, DirectMessage } from '../src/domains/chat'
import type { SocialActivity, SocialComment } from '../src/domains/social'

export type SqlResult<Row> = { rows: Row[] }
export interface SqlClient {
  query<Row>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>
}

type ProjectRow = { id: string; owner_id: string; title: string; status: ProjectStatus; updated_at: string }
type CatalogRow = { content_id: string; creator_id: string; type: CatalogEntry['type']; title: string; tag_ids: string[]; preview_ids: string[]; publication_status: CatalogEntry['publicationStatus']; asset_id: string | null; cover_id: CatalogEntry['coverId'] | null; review_note: string | null }
type AccountRow = { id: string; email: string; password_hash: string; role: Account['role']; verification_state: Account['verificationState']; plan_id?: Account['planId']; purchased_plan_ids?: Account['purchasedPlanIds']; verification_token_hash?: string; verification_token_expires_at?: string; reset_token_hash?: string; reset_token_expires_at?: string }
type AssetRow = { id: string; owner_id: string; original_name: string; storage_key: string; mime_type: string; size_bytes: number; content_hash: string; state: AssetState; created_at: string; updated_at: string; preview_storage_key: string | null; preview_mime_type: 'audio/mp4' | null; preview_size_bytes: number | null }
type MessageRow = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }
type SocialCommentRow = { id: string; content_id: string; author_id: string; body: string; created_at: string }

const project = (row: ProjectRow): ProjectRecord => ({ id: row.id, ownerId: row.owner_id, title: row.title, status: row.status, updatedAt: row.updated_at })
const catalog = (row: CatalogRow): CatalogEntry => ({ contentId: row.content_id, creatorId: row.creator_id, type: row.type, title: row.title, tagIds: row.tag_ids, previewIds: row.preview_ids, publicationStatus: row.publication_status, assetId: row.asset_id ?? undefined, coverId: row.cover_id ?? undefined, reviewNote: row.review_note ?? undefined })
const catalogColumns = 'content_id, creator_id, type, title, tag_ids, preview_ids, publication_status, asset_id, cover_id, review_note'
const chatMessage = (row: MessageRow): DirectMessage => ({ id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, body: row.body, createdAt: row.created_at, readAt: row.read_at ?? undefined })

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
  async listChatConversations(accountId: string): Promise<ChatConversation[]> {
    const result = await this.db.query<MessageRow & { peer_id: string; unread_count: number }>(`SELECT latest.peer_id, latest.id, latest.sender_id, latest.recipient_id, latest.body, latest.created_at, latest.read_at,
      (SELECT COUNT(*)::int FROM direct_messages unread WHERE unread.sender_id = latest.peer_id AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS unread_count
      FROM (SELECT DISTINCT ON (CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END)
        CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS peer_id, id, sender_id, recipient_id, body, created_at, read_at
        FROM direct_messages WHERE sender_id = $1 OR recipient_id = $1
        ORDER BY CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END, created_at DESC, id DESC) latest
      ORDER BY latest.created_at DESC`, [accountId])
    return result.rows.map(row => ({ peerId: row.peer_id, lastMessage: chatMessage(row), unreadCount: Number(row.unread_count) }))
  }
  async listChatMessages(accountId: string, peerId: string, limit: number): Promise<DirectMessage[]> {
    const result = await this.db.query<MessageRow>('SELECT id, sender_id, recipient_id, body, created_at, read_at FROM direct_messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1) ORDER BY created_at DESC, id DESC LIMIT $3', [accountId, peerId, limit])
    return result.rows.reverse().map(chatMessage)
  }
  async createChatMessage(input: DirectMessage): Promise<DirectMessage> {
    const result = await this.db.query<MessageRow>('INSERT INTO direct_messages (id, sender_id, recipient_id, body, created_at, read_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, sender_id, recipient_id, body, created_at, read_at', [input.id, input.senderId, input.recipientId, input.body, input.createdAt, input.readAt ?? null])
    return chatMessage(result.rows[0])
  }
  async markChatMessagesRead(accountId: string, peerId: string, readAt: string): Promise<number> {
    const result = await this.db.query('UPDATE direct_messages SET read_at = $3 WHERE sender_id = $2 AND recipient_id = $1 AND read_at IS NULL RETURNING id', [accountId, peerId, readAt])
    return result.rows.length
  }
  async listSocialComments(contentId: string): Promise<SocialComment[]> {
    const result = await this.db.query<SocialCommentRow>('SELECT id, content_id, author_id, body, created_at FROM catalog_comments WHERE content_id = $1 ORDER BY created_at ASC LIMIT 100', [contentId])
    return result.rows.map(row => ({ id: row.id, contentId: row.content_id, authorId: row.author_id, authorName: '', body: row.body, createdAt: row.created_at }))
  }
  async createSocialComment(input: SocialComment): Promise<SocialComment> {
    const result = await this.db.query<SocialCommentRow>('INSERT INTO catalog_comments (id, content_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, content_id, author_id, body, created_at', [input.id, input.contentId, input.authorId, input.body, input.createdAt])
    const row = result.rows[0]
    return { id: row.id, contentId: row.content_id, authorId: row.author_id, authorName: input.authorName, body: row.body, createdAt: row.created_at }
  }
  async listSocialReactions(contentId: string): Promise<string[]> {
    const result = await this.db.query<{ actor_id: string }>('SELECT actor_id FROM catalog_reactions WHERE content_id = $1', [contentId])
    return result.rows.map(row => row.actor_id)
  }
  async toggleSocialReaction(contentId: string, actorId: string): Promise<boolean> {
    const inserted = await this.db.query('INSERT INTO catalog_reactions (content_id, actor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING actor_id', [contentId, actorId])
    if (inserted.rows.length) return true
    await this.db.query('DELETE FROM catalog_reactions WHERE content_id = $1 AND actor_id = $2', [contentId, actorId])
    return false
  }
  async recordSocialActivity(activity: SocialActivity): Promise<void> {
    await this.db.query('INSERT INTO catalog_activity (id, content_id, actor_id, type, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [activity.id, activity.contentId, activity.actorId, activity.type, activity.body ?? null, activity.createdAt])
  }
  async listSocialActivity(recipientId: string): Promise<SocialActivity[]> {
    const result = await this.db.query<SocialActivity>(`SELECT e.id::text AS id, e.type, e.content_id AS "contentId", a.title AS "contentTitle", e.actor_id AS "actorId", ''::text AS "actorName", COALESCE(e.body, '') AS body, e.created_at AS "createdAt" FROM catalog_activity e JOIN catalog_assets a ON a.content_id = e.content_id WHERE a.creator_id = $1 AND a.publication_status = 'published' AND e.actor_id <> $1 ORDER BY e.created_at DESC LIMIT 100`, [recipientId])
    return result.rows
  }
  async findAccountByEmail(email: string) { const result = await this.db.query<AccountRow>('SELECT * FROM accounts WHERE email = $1', [email]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async findAccountById(id: string) { const result = await this.db.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [id]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async listAccounts() { const result = await this.db.query<AccountRow>('SELECT * FROM accounts ORDER BY email ASC'); return result.rows.map(account) }
  async findAccountByToken(kind: 'verify' | 'reset', hash: string) { const column = kind === 'verify' ? 'verification_token_hash' : 'reset_token_hash'; const result = await this.db.query<AccountRow>(`SELECT * FROM accounts WHERE ${column} = $1`, [hash]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async saveAccount(input: Account) { await this.db.query('INSERT INTO accounts (id, email, password_hash, role, verification_state, verification_token_hash, verification_token_expires_at, reset_token_hash, reset_token_expires_at, plan_id, purchased_plan_ids) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), $8, to_timestamp($9 / 1000.0), $10, $11) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, verification_state = EXCLUDED.verification_state, verification_token_hash = EXCLUDED.verification_token_hash, verification_token_expires_at = EXCLUDED.verification_token_expires_at, reset_token_hash = EXCLUDED.reset_token_hash, reset_token_expires_at = EXCLUDED.reset_token_expires_at, plan_id = EXCLUDED.plan_id, purchased_plan_ids = EXCLUDED.purchased_plan_ids', [input.id, input.email, input.passwordHash, input.role, input.verificationState, input.verificationTokenHash ?? null, input.verificationTokenExpiresAt ?? null, input.resetTokenHash ?? null, input.resetTokenExpiresAt ?? null, input.planId ?? 'free', JSON.stringify(input.purchasedPlanIds || [])]) }

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
  async listAssets(ownerId?: string) { const r = await this.db.query<AssetRow>('SELECT id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at, preview_storage_key, preview_mime_type, preview_size_bytes FROM assets WHERE ($1::text IS NULL OR owner_id = $1) ORDER BY created_at DESC', [ownerId ?? null]); return r.rows.map(asset) }
  async findAsset(id: string, ownerId?: string) { const r = await this.db.query<AssetRow>('SELECT id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at, preview_storage_key, preview_mime_type, preview_size_bytes FROM assets WHERE id = $1 AND ($2::text IS NULL OR owner_id = $2)', [id, ownerId ?? null]); return r.rows[0] ? asset(r.rows[0]) : undefined }
  async findDuplicateAsset(input: Pick<AssetRecord, 'ownerId' | 'contentHash'>) { const r = await this.db.query<AssetRow>('SELECT id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at, preview_storage_key, preview_mime_type, preview_size_bytes FROM assets WHERE owner_id = $1 AND content_hash = $2 AND state <> $3 LIMIT 1', [input.ownerId, input.contentHash, 'missing']); return r.rows[0] ? asset(r.rows[0]) : undefined }
  async getStorageUsage(ownerId: string) { const r = await this.db.query<{ used_bytes: string | number }>('SELECT used_bytes FROM account_storage_usage WHERE owner_id = $1', [ownerId]); return Number(r.rows[0]?.used_bytes ?? 0) }
  async listStorageUsage() {
    const r = await this.db.query<{ owner_id: string; used_bytes: string | number; original_count: string | number; preview_bytes: string | number; preview_count: string | number }>(`SELECT a.id AS owner_id, COALESCE(u.used_bytes, 0) AS used_bytes,
      COUNT(asset.id) FILTER (WHERE asset.state = 'available') AS original_count,
      COALESCE(SUM(asset.preview_size_bytes) FILTER (WHERE asset.preview_storage_key IS NOT NULL), 0) AS preview_bytes,
      COUNT(asset.id) FILTER (WHERE asset.preview_storage_key IS NOT NULL) AS preview_count
      FROM accounts a LEFT JOIN account_storage_usage u ON u.owner_id = a.id LEFT JOIN assets asset ON asset.owner_id = a.id
      GROUP BY a.id, u.used_bytes ORDER BY COALESCE(u.used_bytes, 0) DESC, a.id`)
    return r.rows.map(row => { const usedBytes = Number(row.used_bytes); const previewBytes = Number(row.preview_bytes); return { ownerId: row.owner_id, usedBytes, originalCount: Number(row.original_count), previewBytes, previewCount: Number(row.preview_count), storedBytes: usedBytes + previewBytes } })
  }
  async getStorageQuota(ownerId: string) { const r = await this.db.query<{ limit_bytes: string | number }>('SELECT limit_bytes FROM account_storage_quotas WHERE owner_id = $1', [ownerId]); return r.rows[0] ? Number(r.rows[0].limit_bytes) : undefined }
  async listStorageQuotas(): Promise<StorageQuotaRecord[]> { const r = await this.db.query<{ owner_id: string; limit_bytes: string | number; updated_by: string; updated_at: string }>('SELECT owner_id, limit_bytes, updated_by, updated_at FROM account_storage_quotas'); return r.rows.map(row => ({ ownerId: row.owner_id, limitBytes: Number(row.limit_bytes), updatedBy: row.updated_by, updatedAt: row.updated_at })) }
  async setStorageQuota(ownerId: string, limitBytes: number | null, updatedBy: string) {
    if (limitBytes !== null && (!Number.isSafeInteger(limitBytes) || limitBytes < 1)) throw new Error('INVALID_STORAGE_QUOTA')
    if (limitBytes === null) { await this.db.query('DELETE FROM account_storage_quotas WHERE owner_id = $1', [ownerId]); return }
    await this.db.query(`INSERT INTO account_storage_quotas (owner_id, limit_bytes, updated_by) VALUES ($1,$2,$3) ON CONFLICT (owner_id) DO UPDATE SET limit_bytes = EXCLUDED.limit_bytes, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, [ownerId, limitBytes, updatedBy])
  }
  async createAsset(input: AssetRecord, limitBytes?: number) {
    const r = await this.db.query<AssetRow>(`WITH quota AS (
      INSERT INTO account_storage_usage (owner_id, used_bytes) VALUES ($2, CASE WHEN $8 = 'available' THEN $6 ELSE 0 END)
      ON CONFLICT (owner_id) DO UPDATE SET used_bytes = account_storage_usage.used_bytes + CASE WHEN $8 = 'available' THEN $6 ELSE 0 END, updated_at = NOW()
      WHERE $14::bigint IS NULL OR account_storage_usage.used_bytes + CASE WHEN $8 = 'available' THEN $6 ELSE 0 END <= $14
      RETURNING owner_id
    )
    INSERT INTO assets (id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at, preview_storage_key, preview_mime_type, preview_size_bytes)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 FROM quota
    RETURNING id, owner_id, original_name, storage_key, mime_type, size_bytes, content_hash, state, created_at, updated_at, preview_storage_key, preview_mime_type, preview_size_bytes`, [input.id,input.ownerId,input.originalName,input.storageKey,input.mimeType,input.sizeBytes,input.contentHash,input.state,input.createdAt,input.updatedAt,input.previewStorageKey ?? null,input.previewMimeType ?? null,input.previewSizeBytes ?? null,limitBytes ?? null])
    if (r.rows[0]) return asset(r.rows[0])
    throw new StorageQuotaExceededError(await this.getStorageUsage(input.ownerId), limitBytes ?? 0, input.sizeBytes)
  }
  async updateAssetState(id: string, state: AssetState) {
    await this.db.query(`WITH prior AS (SELECT owner_id, size_bytes, state FROM assets WHERE id = $1 FOR UPDATE), changed AS (
      UPDATE assets SET state = $2, updated_at = NOW() FROM prior WHERE assets.id = $1
      RETURNING prior.owner_id, prior.size_bytes, prior.state AS old_state, assets.state AS new_state
    ), delta AS (
      SELECT owner_id, CASE WHEN old_state = 'available' AND new_state <> 'available' THEN -size_bytes WHEN old_state <> 'available' AND new_state = 'available' THEN size_bytes ELSE 0 END AS bytes_delta FROM changed
    )
    INSERT INTO account_storage_usage (owner_id, used_bytes)
    SELECT owner_id, GREATEST(0, bytes_delta) FROM delta
    ON CONFLICT (owner_id) DO UPDATE SET used_bytes = GREATEST(0, account_storage_usage.used_bytes + (SELECT bytes_delta FROM delta WHERE delta.owner_id = EXCLUDED.owner_id)), updated_at = NOW()`, [id, state])
  }
  async updateAssetPreview(id: string, preview: Pick<AssetRecord, 'previewStorageKey' | 'previewMimeType' | 'previewSizeBytes'>) { await this.db.query('UPDATE assets SET preview_storage_key = $1, preview_mime_type = $2, preview_size_bytes = $3, updated_at = NOW() WHERE id = $4', [preview.previewStorageKey ?? null, preview.previewMimeType ?? null, preview.previewSizeBytes ?? null, id]) }
  async deleteAsset(id: string, ownerId: string) {
    await this.db.query(`WITH removed AS (DELETE FROM assets WHERE id = $1 AND owner_id = $2 RETURNING owner_id, size_bytes, state)
      UPDATE account_storage_usage usage SET used_bytes = GREATEST(0, usage.used_bytes - CASE WHEN removed.state = 'available' THEN removed.size_bytes ELSE 0 END), updated_at = NOW()
      FROM removed WHERE usage.owner_id = removed.owner_id`, [id, ownerId])
  }
}
const asset = (row: AssetRow): AssetRecord => ({ id: row.id, ownerId: row.owner_id, originalName: row.original_name, storageKey: row.storage_key, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), contentHash: row.content_hash, state: row.state, createdAt: row.created_at, updatedAt: row.updated_at, ...(row.preview_storage_key && row.preview_mime_type && row.preview_size_bytes ? { previewStorageKey: row.preview_storage_key, previewMimeType: row.preview_mime_type, previewSizeBytes: Number(row.preview_size_bytes) } : {}) })
const account = (row: AccountRow): Account => ({ id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, verificationState: row.verification_state || 'unverified', planId: row.plan_id || 'free', purchasedPlanIds: row.purchased_plan_ids || [], verificationTokenHash: row.verification_token_hash, verificationTokenExpiresAt: row.verification_token_expires_at ? Date.parse(row.verification_token_expires_at) : undefined, resetTokenHash: row.reset_token_hash, resetTokenExpiresAt: row.reset_token_expires_at ? Date.parse(row.reset_token_expires_at) : undefined })
