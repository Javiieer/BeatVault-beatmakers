import { randomUUID } from 'node:crypto'
import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ProjectRecord, ProjectStatus } from '../src/domains/core/contracts'
import { StorageQuotaExceededError, type AssetRecord, type AssetState, type BeatOrder, type BeatOrderMutableFields, type Friendship, type ServerRepository, type SessionRecord, type SocialAccountBlock, type SocialAccountState, type StorageQuotaRecord, type StripeConnectRecord, type SocialStoryReportCursor, type SocialStoryReportPage, type MercadoPagoSellerLink, type MercadoPagoOAuthIntent, type MercadoPagoOrderPayment, type MercadoPagoProviderPayment, type MercadoPagoPaymentStatus, type PaymentEnvironment, type ProviderWebhookEvent, isMercadoPagoSellerLink, isMercadoPagoOAuthIntent, isMercadoPagoOrderPayment, isMercadoPagoProviderPayment, type MercadoPagoScope, type MercadoPagoPreferenceReservation, type MercadoPagoPreferenceClaim, type MercadoPagoPreference } from './store'
import type { Account } from './auth'
import { isPurchaseEntitlement } from './purchase-entitlements'
import type { AuditEvent } from './security'
import { applyMarketplaceReview, marketplaceRevision, type MarketplaceReviewState, type MarketplaceReviewWrite } from './marketplace-review-state'
import type { CreatorProfile } from '../src/domains/profile'
import type { ChatConversation, DirectMessage } from '../src/domains/chat'
import type { SocialActivity, SocialComment } from '../src/domains/social'
import type { PromotionRule } from '../src/domains/marketplace/promotions'
import type { BeatListingRecord } from '../src/domains/marketplace/sellerListings'
import { sellerEvidenceMaxFiles, type SellerEvidenceRecord } from '../src/domains/marketplace/sellerEvidence'
import type { ArtworkRecord } from './artwork'
import type { SocialPost, SocialPostComment, SocialPostCursor, SocialPostReport, SocialPostVisibility } from './social-posts'
import { socialStoryMaxActivePerAccount, type SocialStory, type SocialStoryCursor, type SocialStoryReport } from './social-stories'
import { isValidNotificationTimestamp, normalizeNotificationCursor, normalizeNotificationRecord, notificationLimit, type NotificationPage, type NotificationPageOptions, type NotificationRecord, type NotificationSeed } from './notifications'

export type SqlResult<Row> = { rows: Row[]; rowCount?: number }
export interface SqlConnection {
  query<Row>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>
  release(): void
}
export interface SqlClient {
  query<Row>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>
  connect?(): Promise<SqlConnection>
}

type ProjectRow = { id: string; owner_id: string; title: string; status: ProjectStatus; updated_at: string }
type CatalogRow = { content_id: string; creator_id: string; type: CatalogEntry['type']; title: string; tag_ids: string[]; preview_ids: string[]; publication_status: CatalogEntry['publicationStatus']; asset_id: string | null; cover_id: CatalogEntry['coverId'] | null; review_note: string | null }
type AccountRow = { id: string; email: string; password_hash: string; role: Account['role']; verification_state: Account['verificationState']; plan_id?: Account['planId']; purchased_plan_ids?: Account['purchasedPlanIds']; verification_token_hash?: string; verification_token_expires_at?: string; reset_token_hash?: string; reset_token_expires_at?: string }
type AssetRow = { id: string; owner_id: string; original_name: string; storage_key: string; mime_type: string; size_bytes: number; content_hash: string; state: AssetState; created_at: string; updated_at: string; preview_storage_key: string | null; preview_mime_type: 'audio/mp4' | null; preview_size_bytes: number | null }
type MessageRow = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }
type SocialCommentRow = { id: string; content_id: string; author_id: string; body: string; created_at: string }
type SessionRow = { token_hash: string; account_id: string; csrf_token_hash: string; expires_at: string }
type SocialPostRow = { id: string; author_id: string; kind: SocialPost['kind']; body: string; audience: SocialPost['audience']; visibility: SocialPost['visibility']; media_storage_key: string | null; media_mime_type: SocialPost['media'] extends infer M ? M extends { mimeType: infer T } ? T | null : never : never; media_size_bytes: string | number | null; media_sha256: string | null; created_at: string; updated_at: string; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null }
type SocialStoryRow = { id: string; author_id: string; kind: SocialStory['kind']; body: string; audience: SocialStory['audience']; media_storage_key: string | null; media_mime_type: string | null; media_size_bytes: string | number | null; media_sha256: string | null; created_at: string | Date; expires_at: string | Date }
type SocialPostReportRow = { id: string; post_id: string; reporter_id: string; reason: SocialPostReport['reason']; details: string; status: SocialPostReport['status']; created_at: string; reviewed_at: string | null; reviewed_by: string | null }
type SocialStoryReportRow = { id: string; story_id: string; author_id: string; reporter_id: string; story_kind: SocialStoryReport['kind']; story_body: string; story_audience: SocialStoryReport['audience']; story_created_at: string | Date; story_expires_at: string | Date; media_sha256: string | null; evidence_storage_key: string | null; evidence_mime_type: SocialStoryReport['evidenceMimeType'] | null; evidence_size_bytes: string | number | null; evidence_delete_at: string | Date | null; evidence_expired_at: string | Date | null; reason: SocialStoryReport['reason']; details: string; status: SocialStoryReport['status']; created_at: string | Date; reviewed_at: string | Date | null; reviewed_by: string | null }
type SocialPostCommentRow = { id: string; post_id: string; author_id: string; body: string; created_at: string }
type NotificationRow = { unread_count?: string | number; id: string | null; recipient_id: string | null; actor_id: string | null; type: NotificationRecord['type'] | null; resource_type: NotificationRecord['resourceType'] | null; resource_id: string | null; source_id: string | null; event_key: string | null; created_at: string | Date | null; read_at: string | Date | null }
type NotificationMutationRow = { notification_id: string | null; notification_recipient_id: string | null; notification_actor_id: string | null; notification_type: NotificationRecord['type'] | null; notification_resource_type: NotificationRecord['resourceType'] | null; notification_resource_id: string | null; notification_source_id: string | null; notification_event_key: string | null; notification_created_at: string | Date | null; notification_read_at: string | Date | null }

const project = (row: ProjectRow): ProjectRecord => ({ id: row.id, ownerId: row.owner_id, title: row.title, status: row.status, updatedAt: row.updated_at })
const catalog = (row: CatalogRow): CatalogEntry => ({ contentId: row.content_id, creatorId: row.creator_id, type: row.type, title: row.title, tagIds: row.tag_ids, previewIds: row.preview_ids, publicationStatus: row.publication_status, assetId: row.asset_id ?? undefined, coverId: row.cover_id ?? undefined, reviewNote: row.review_note ?? undefined })
const catalogColumns = 'content_id, creator_id, type, title, tag_ids, preview_ids, publication_status, asset_id, cover_id, review_note'
const chatMessage = (row: MessageRow): DirectMessage => ({ id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, body: row.body, createdAt: row.created_at, readAt: row.read_at ?? undefined })
const socialPostColumns = 'id, author_id, kind, body, audience, visibility, media_storage_key, media_mime_type, media_size_bytes, media_sha256, created_at, updated_at, reviewed_at, reviewed_by, review_note'
const socialPost = (row: SocialPostRow): SocialPost => ({ id: row.id, authorId: row.author_id, kind: row.kind, body: row.body, audience: row.audience, visibility: row.visibility, ...(row.media_storage_key ? { media: { storageKey: row.media_storage_key, mimeType: row.media_mime_type as NonNullable<SocialPost['media']>['mimeType'], sizeBytes: Number(row.media_size_bytes), sha256: row.media_sha256! } } : {}), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}), ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}), ...(row.review_note ? { reviewNote: row.review_note } : {}) })
const socialStoryColumns = 'id, author_id, kind, body, audience, media_storage_key, media_mime_type, media_size_bytes, media_sha256, created_at, expires_at'
const socialStory = (row: SocialStoryRow): SocialStory => ({ id: row.id, authorId: row.author_id, kind: row.kind, body: row.body, audience: row.audience, ...(row.media_storage_key ? { media: { storageKey: row.media_storage_key, mimeType: row.media_mime_type as NonNullable<SocialStory['media']>['mimeType'], sizeBytes: Number(row.media_size_bytes), sha256: row.media_sha256! } } : {}), createdAt: timestamp(row.created_at), expiresAt: timestamp(row.expires_at) })
const socialPostReport = (row: SocialPostReportRow): SocialPostReport => ({ id: row.id, postId: row.post_id, reporterId: row.reporter_id, reason: row.reason, details: row.details, status: row.status, createdAt: row.created_at, ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}), ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}) })
const socialStoryReport = (row: SocialStoryReportRow): SocialStoryReport => ({ id: row.id, storyId: row.story_id, authorId: row.author_id, reporterId: row.reporter_id, kind: row.story_kind, body: row.story_body, audience: row.story_audience, storyCreatedAt: timestamp(row.story_created_at), storyExpiresAt: timestamp(row.story_expires_at), ...(row.media_sha256 ? { mediaSha256: row.media_sha256 } : {}), ...(row.evidence_storage_key ? { evidenceStorageKey: row.evidence_storage_key } : {}), ...(row.evidence_mime_type ? { evidenceMimeType: row.evidence_mime_type } : {}), ...(row.evidence_size_bytes !== null ? { evidenceSizeBytes: Number(row.evidence_size_bytes) } : {}), ...(row.evidence_delete_at ? { evidenceDeleteAt: timestamp(row.evidence_delete_at) } : {}), ...(row.evidence_expired_at ? { evidenceExpiredAt: timestamp(row.evidence_expired_at) } : {}), reason: row.reason, details: row.details, status: row.status, createdAt: timestamp(row.created_at), ...(row.reviewed_at ? { reviewedAt: timestamp(row.reviewed_at) } : {}), ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}) })
const timestamp = (value: string | Date): string => value instanceof Date ? value.toISOString() : value
const notification = (row: NotificationRow): NotificationRecord => {
  if (!row.id || !row.recipient_id || !row.actor_id || !row.type || !row.resource_type || !row.resource_id || !row.source_id || !row.event_key || !row.created_at) throw new Error('INVALID_NOTIFICATION_ROW')
  return { id: row.id, recipientId: row.recipient_id, actorId: row.actor_id, type: row.type, resourceType: row.resource_type, resourceId: row.resource_id, sourceId: row.source_id, eventKey: row.event_key, createdAt: timestamp(row.created_at), readAt: row.read_at ? timestamp(row.read_at) : null }
}
const notificationColumns = 'id, recipient_id, actor_id, type, resource_type, resource_id, source_id, event_key, created_at, read_at'
const notificationMutationColumns = `saved.id AS notification_id, saved.recipient_id AS notification_recipient_id, saved.actor_id AS notification_actor_id, saved.type AS notification_type, saved.resource_type AS notification_resource_type, saved.resource_id AS notification_resource_id, saved.source_id AS notification_source_id, saved.event_key AS notification_event_key, saved.created_at AS notification_created_at, saved.read_at AS notification_read_at`
const notificationFromMutation = (row: NotificationMutationRow): NotificationRecord | undefined => row.notification_id ? notification({ id: row.notification_id, recipient_id: row.notification_recipient_id, actor_id: row.notification_actor_id, type: row.notification_type, resource_type: row.notification_resource_type, resource_id: row.notification_resource_id, source_id: row.notification_source_id, event_key: row.notification_event_key, created_at: row.notification_created_at, read_at: row.notification_read_at }) : undefined
const normalizedNotificationSeed = (seed: NotificationSeed | undefined, type: NotificationRecord['type'], resourceType: NotificationRecord['resourceType'], resourceId: string, sourceId: string): NotificationSeed | undefined => {
  if (!seed) return undefined
  const normalized = normalizeNotificationRecord({ ...seed, recipientId: 'recipient', actorId: 'actor', type, resourceType, resourceId, sourceId, eventKey: `${type}:${sourceId}`, readAt: null })
  return { id: normalized.id, type, resourceType, resourceId, sourceId, eventKey: normalized.eventKey, createdAt: normalized.createdAt }
}

/** SQL adapter. Injected pools provide a connection per transaction. */
export class PostgresRepository implements ServerRepository {
  constructor(private readonly db: SqlClient) {}
  private async withTransaction<T>(action: (client: SqlClient) => Promise<T>): Promise<T> {
    if (!this.db.connect) return action(this.db)
    const client = await this.db.connect()
    try {
      await client.query('BEGIN')
      const result = await action(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try { await client.query('ROLLBACK') } catch { /* Keep the original database error. */ }
      throw error
    } finally { client.release() }
  }
  async listFavoriteIds(accountId: string) {
    const result = await this.db.query<{ content_id: string }>('SELECT content_id FROM account_catalog_favorites WHERE account_id=$1 ORDER BY created_at DESC,content_id', [accountId])
    return result.rows.map(item => item.content_id)
  }
  addFavorite(accountId: string, contentId: string, limit: number) {
    return this.withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('catalog-favorites'))", [accountId])
      const entry = await client.query('SELECT content_id FROM catalog_assets WHERE content_id=$1 AND publication_status=$2 FOR SHARE', [contentId, 'published'])
      if (!entry.rows.length) throw new Error('FAVORITE_NOT_AVAILABLE')
      const existing = await client.query('SELECT content_id FROM account_catalog_favorites WHERE account_id=$1 AND content_id=$2', [accountId, contentId])
      if (existing.rows.length) return
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM account_catalog_favorites WHERE account_id=$1', [accountId])
      if (Number(count.rows[0]?.count || 0) >= limit) throw new Error('FAVORITES_LIMIT')
      await client.query('INSERT INTO account_catalog_favorites(account_id,content_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [accountId, contentId])
    })
  }
  async removeFavorite(accountId: string, contentId: string) { await this.db.query('DELETE FROM account_catalog_favorites WHERE account_id=$1 AND content_id=$2', [accountId, contentId]) }
  async findMarketplaceReviewState(contentId: string, ownerId: string) {
    const result = await this.db.query<{ data: MarketplaceReviewState }>('SELECT data FROM marketplace_listing_review_state WHERE content_id=$1 AND owner_id=$2', [contentId, ownerId])
    return result.rows[0]?.data
  }
  private async marketplaceReviewSource(client: SqlClient, contentId: string, ownerId: string) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('marketplace-review'))", [contentId])
    const listing = await client.query<{ data: BeatListingRecord }>('SELECT data FROM marketplace_beat_listing_drafts WHERE content_id=$1 AND owner_id=$2 FOR UPDATE', [contentId, ownerId])
    const evidence = await client.query<{ data: SellerEvidenceRecord }>('SELECT data FROM marketplace_beat_listing_evidence WHERE content_id=$1 AND owner_id=$2 ORDER BY created_at', [contentId, ownerId])
    return { listing: listing.rows[0]?.data, evidence: evidence.rows.map(item => item.data) }
  }
  importMarketplaceReviewState(state: MarketplaceReviewState, expectedRevision: string) {
    return this.withTransaction(async client => {
      const source = await this.marketplaceReviewSource(client, state.contentId, state.ownerId)
      if (!source.listing || marketplaceRevision(source.listing, source.evidence) !== expectedRevision) throw new Error('LISTING_REVISION_CHANGED')
      const result = await client.query<{ data: MarketplaceReviewState }>('INSERT INTO marketplace_listing_review_state(content_id,owner_id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(content_id) DO UPDATE SET content_id=EXCLUDED.content_id RETURNING data', [state.contentId, state.ownerId, JSON.stringify(state)])
      return result.rows[0].data
    })
  }
  saveMarketplaceReview(input: MarketplaceReviewWrite, event: AuditEvent) {
    return this.withTransaction(async client => {
      const source = await this.marketplaceReviewSource(client, input.contentId, input.ownerId)
      if (!source.listing || marketplaceRevision(source.listing, source.evidence) !== input.expectedRevision) throw new Error('LISTING_REVISION_CHANGED')
      const previous = (await client.query<{ data: MarketplaceReviewState }>('SELECT data FROM marketplace_listing_review_state WHERE content_id=$1 AND owner_id=$2', [input.contentId, input.ownerId])).rows[0]?.data
      const actor = (await client.query<{ role: string }>('SELECT role FROM accounts WHERE id=$1', [input.review.reviewerId])).rows[0]
      const recommender = previous?.communityReview ? (await client.query<{ role: string }>('SELECT role FROM accounts WHERE id=$1', [previous.communityReview.reviewerId])).rows[0] : undefined
      const state = applyMarketplaceReview(previous, input, actor?.role, recommender?.role)
      await client.query('INSERT INTO marketplace_listing_review_state(content_id,owner_id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(content_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()', [input.contentId, input.ownerId, JSON.stringify(state)])
      await client.query('INSERT INTO audit_events(id,timestamp,action,request_id,actor_id,target_id,success,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [event.id, event.timestamp, event.action, event.requestId, event.actorId ?? null, event.targetId ?? null, event.success, JSON.stringify(event.metadata)])
      return state
    })
  }
  async drainMarketplaceReviewAudit(): Promise<void> { /* PostgreSQL commits review state and audit together. */ }
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
    const result = await this.db.query<Friendship>('SELECT f.id, f.requester_id AS "requesterId", f.recipient_id AS "recipientId", f.status, f.created_at AS "createdAt", f.updated_at AS "updatedAt" FROM friendships f WHERE (f.requester_id=$1 OR f.recipient_id=$1) AND NOT EXISTS (SELECT 1 FROM social_account_blocks b WHERE (b.blocker_id=f.requester_id AND b.blocked_id=f.recipient_id) OR (b.blocker_id=f.recipient_id AND b.blocked_id=f.requester_id))', [accountId])
    return result.rows
  }
  async createFriendship(input: Friendship): Promise<Friendship> {
    const result = await this.db.query<Friendship>('INSERT INTO friendships (id, requester_id, recipient_id, status, created_at, updated_at) SELECT $1, $2, $3, $4, $5, $6 WHERE NOT EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=$2 AND blocked_id=$3) OR (blocker_id=$3 AND blocked_id=$2)) RETURNING id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt"', [input.id, input.requesterId, input.recipientId, input.status, input.createdAt, input.updatedAt])
    if (!result.rows[0]) throw new Error('SOCIAL_ACCOUNT_BLOCKED')
    return result.rows[0]
  }
  async createFriendshipWithNotification(input: Friendship, inputSeed?: NotificationSeed) {
    const seed = normalizedNotificationSeed(inputSeed, 'friend_request', 'friendship', input.id, input.id)
    const result = await this.db.query<Friendship & NotificationMutationRow>(`WITH created AS (
      INSERT INTO friendships (id, requester_id, recipient_id, status, created_at, updated_at)
      SELECT $1, $2, $3, $4, $5, $6 WHERE NOT EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=$2 AND blocked_id=$3) OR (blocker_id=$3 AND blocked_id=$2))
      RETURNING id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt"
    ), saved AS (
      INSERT INTO notifications (${notificationColumns})
      SELECT $7::uuid, created."recipientId", created."requesterId", 'friend_request', 'friendship', created.id, created.id, 'friend_request:' || created.id, $8::timestamptz, NULL
      FROM created WHERE $7::uuid IS NOT NULL AND created.status = 'pending' AND created."requesterId" <> created."recipientId"
      ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
      RETURNING ${notificationColumns}
    )
    SELECT created.*, ${notificationMutationColumns} FROM created LEFT JOIN saved ON TRUE`, [input.id, input.requesterId, input.recipientId, input.status, input.createdAt, input.updatedAt, seed?.id ?? null, seed?.createdAt ?? null])
    const row = result.rows[0]
    if (!row) throw new Error('SOCIAL_ACCOUNT_BLOCKED')
    const saved = notificationFromMutation(row)
    return { value: { id: row.id, requesterId: row.requesterId, recipientId: row.recipientId, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt }, notifications: saved ? [saved] : [] }
  }
  async updateFriendship(id: string, actorId: string, status: Friendship['status']) {
    const result = await this.db.query<Friendship>('UPDATE friendships SET status = $1, updated_at = NOW() WHERE id = $2 AND recipient_id = $3 AND status = $4 RETURNING id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt"', [status, id, actorId, 'pending'])
    return result.rows[0]
  }
  async acceptFriendshipWithNotification(id: string, actorId: string, inputSeed?: NotificationSeed) {
    const seed = normalizedNotificationSeed(inputSeed, 'friend_request_accepted', 'friendship', id, id)
    const result = await this.db.query<(Friendship & NotificationMutationRow)>(`WITH updated AS (
      UPDATE friendships SET status = 'accepted', updated_at = NOW()
      WHERE id = $1 AND recipient_id = $2 AND status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM social_account_blocks b WHERE (b.blocker_id=friendships.requester_id AND b.blocked_id=friendships.recipient_id) OR (b.blocker_id=friendships.recipient_id AND b.blocked_id=friendships.requester_id))
      RETURNING id, requester_id AS "requesterId", recipient_id AS "recipientId", status, created_at AS "createdAt", updated_at AS "updatedAt"
    ), saved AS (
      INSERT INTO notifications (${notificationColumns})
      SELECT $3::uuid, updated."requesterId", updated."recipientId", 'friend_request_accepted', 'friendship', updated.id, updated.id, 'friend_request_accepted:' || updated.id, $4::timestamptz, NULL
      FROM updated WHERE $3::uuid IS NOT NULL AND updated."requesterId" <> updated."recipientId"
      ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
      RETURNING ${notificationColumns}
    )
    SELECT updated.*, ${notificationMutationColumns} FROM updated LEFT JOIN saved ON TRUE`, [id, actorId, seed?.id ?? null, seed?.createdAt ?? null])
    const row = result.rows[0]
    if (!row) return { value: undefined, notifications: [] }
    const saved = notificationFromMutation(row)
    return { value: { id: row.id, requesterId: row.requesterId, recipientId: row.recipientId, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt }, notifications: saved ? [saved] : [] }
  }
  async deleteFriendship(id: string, actorId: string, status: Friendship['status']) {
    const result = await this.db.query('DELETE FROM friendships WHERE id = $1 AND status = $3 AND (requester_id = $2 OR recipient_id = $2) RETURNING id', [id, actorId, status])
    return result.rows.length > 0
  }
  async listSocialAccountBlocks(accountId: string): Promise<SocialAccountBlock[]> {
    const result = await this.db.query<{ blocker_id: string; blocked_id: string; created_at: string | Date }>('SELECT blocker_id, blocked_id, created_at FROM social_account_blocks WHERE blocker_id=$1 ORDER BY created_at DESC', [accountId])
    return result.rows.map(row => ({ blockerId: row.blocker_id, blockedId: row.blocked_id, createdAt: timestamp(row.created_at) }))
  }
  async areSocialAccountsBlocked(firstAccountId: string, secondAccountId: string) {
    if (firstAccountId === secondAccountId) return false
    const result = await this.db.query<{ blocked: boolean }>('SELECT EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)) AS blocked', [firstAccountId, secondAccountId])
    return Boolean(result.rows[0]?.blocked)
  }
  async createSocialAccountBlock(input: SocialAccountBlock) {
    if (input.blockerId === input.blockedId) throw new Error('SOCIAL_SELF_BLOCK')
    await this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LEAST($1,$2)),hashtext(GREATEST($1,$2)))', [input.blockerId, input.blockedId])
      await client.query('INSERT INTO social_account_blocks(blocker_id,blocked_id,created_at) VALUES($1,$2,$3) ON CONFLICT(blocker_id,blocked_id) DO NOTHING', [input.blockerId, input.blockedId, input.createdAt])
      await client.query('DELETE FROM friendships WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)', [input.blockerId, input.blockedId])
      await client.query('DELETE FROM social_account_follows WHERE (follower_id=$1 AND following_id=$2) OR (follower_id=$2 AND following_id=$1)', [input.blockerId, input.blockedId])
    })
  }
  async deleteSocialAccountBlock(blockerId: string, blockedId: string) {
    return this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LEAST($1,$2)),hashtext(GREATEST($1,$2)))', [blockerId, blockedId])
      const result = await client.query('DELETE FROM social_account_blocks WHERE blocker_id=$1 AND blocked_id=$2 RETURNING blocker_id', [blockerId, blockedId])
      return result.rows.length > 0
    })
  }
  async createSocialAccountBlockWithAudit(input: SocialAccountBlock, event: AuditEvent) {
    if (input.blockerId === input.blockedId) throw new Error('SOCIAL_SELF_BLOCK')
    await this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LEAST($1,$2)),hashtext(GREATEST($1,$2)))', [input.blockerId, input.blockedId])
      await client.query('INSERT INTO social_account_blocks(blocker_id,blocked_id,created_at) VALUES($1,$2,$3) ON CONFLICT(blocker_id,blocked_id) DO NOTHING', [input.blockerId, input.blockedId, input.createdAt])
      await client.query('DELETE FROM friendships WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)', [input.blockerId, input.blockedId])
      await client.query('DELETE FROM social_account_follows WHERE (follower_id=$1 AND following_id=$2) OR (follower_id=$2 AND following_id=$1)', [input.blockerId, input.blockedId])
      await client.query('INSERT INTO audit_events(id,timestamp,action,request_id,actor_id,target_id,success,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [event.id, event.timestamp, event.action, event.requestId, event.actorId ?? null, event.targetId ?? null, event.success, JSON.stringify(event.metadata)])
    })
  }
  async deleteSocialAccountBlockWithAudit(blockerId: string, blockedId: string, event: AuditEvent) {
    return this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LEAST($1,$2)),hashtext(GREATEST($1,$2)))', [blockerId, blockedId])
      const result = await client.query('DELETE FROM social_account_blocks WHERE blocker_id=$1 AND blocked_id=$2 RETURNING blocker_id', [blockerId, blockedId])
      if (!result.rows.length) return false
      await client.query('INSERT INTO audit_events(id,timestamp,action,request_id,actor_id,target_id,success,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [event.id, event.timestamp, event.action, event.requestId, event.actorId ?? null, event.targetId ?? null, event.success, JSON.stringify(event.metadata)])
      return true
    })
  }
  async drainSocialBlockAudit() { /* PostgreSQL commits block state and audit together. */ }
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
    return this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LEAST($1,$2)),hashtext(GREATEST($1,$2)))', [input.senderId, input.recipientId])
      const result = await client.query<MessageRow>('INSERT INTO direct_messages (id, sender_id, recipient_id, body, created_at, read_at) SELECT $1, $2, $3, $4, $5, $6 WHERE NOT EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=$2 AND blocked_id=$3) OR (blocker_id=$3 AND blocked_id=$2)) RETURNING id, sender_id, recipient_id, body, created_at, read_at', [input.id, input.senderId, input.recipientId, input.body, input.createdAt, input.readAt ?? null])
      if (!result.rows[0]) throw new Error('SOCIAL_ACCOUNT_BLOCKED')
      return chatMessage(result.rows[0])
    })
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
  async createNotification(input: NotificationRecord): Promise<NotificationRecord> {
    const record = normalizeNotificationRecord(input)
    const result = await this.db.query<NotificationRow>(`INSERT INTO notifications (${notificationColumns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key RETURNING ${notificationColumns}`, [record.id, record.recipientId, record.actorId, record.type, record.resourceType, record.resourceId, record.sourceId, record.eventKey, record.createdAt, record.readAt])
    return notification(result.rows[0])
  }
  async listNotifications(recipientId: string, options: NotificationPageOptions): Promise<NotificationPage> {
    const limit = notificationLimit(options.limit)
    const cursor = normalizeNotificationCursor(options.cursor)
    const result = await this.db.query<NotificationRow>(`WITH page AS (
      SELECT ${notificationColumns} FROM notifications
      WHERE recipient_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2 OR (created_at = $2 AND id < $3::uuid))
      ORDER BY created_at DESC, id DESC LIMIT $4
    ), unread AS (
      SELECT COUNT(*)::int AS unread_count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL
    )
    SELECT unread.unread_count, page.id, page.recipient_id, page.actor_id, page.type, page.resource_type, page.resource_id, page.source_id, page.event_key, page.created_at, page.read_at
    FROM unread LEFT JOIN page ON TRUE ORDER BY page.created_at DESC NULLS LAST, page.id DESC NULLS LAST`, [recipientId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1])
    const rows = result.rows.filter(row => row.id !== null)
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map(notification)
    const last = items.at(-1)
    return { items, unreadCount: Number(result.rows[0]?.unread_count ?? 0), nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null }
  }
  async markNotificationRead(id: string, recipientId: string, readAt: string): Promise<NotificationRecord | undefined> {
    if (!isValidNotificationTimestamp(readAt)) throw new Error('INVALID_NOTIFICATION_TIMESTAMP')
    const result = await this.db.query<NotificationRow>(`UPDATE notifications SET read_at = COALESCE(read_at, $3) WHERE id = $1 AND recipient_id = $2 RETURNING ${notificationColumns}`, [id, recipientId, new Date(readAt).toISOString()])
    return result.rows[0] ? notification(result.rows[0]) : undefined
  }
  async createSocialPost(input: SocialPost, _mediaLimitBytes: number): Promise<SocialPost> {
    if (input.media && input.media.sizeBytes > _mediaLimitBytes) throw new StorageQuotaExceededError(0, _mediaLimitBytes, input.media.sizeBytes)
    const result = await this.db.query<SocialPostRow>(`INSERT INTO social_posts (${socialPostColumns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${socialPostColumns}`, [input.id, input.authorId, input.kind, input.body, input.audience, input.visibility, input.media?.storageKey ?? null, input.media?.mimeType ?? null, input.media?.sizeBytes ?? null, input.media?.sha256 ?? null, input.createdAt, input.updatedAt, input.reviewedAt ?? null, input.reviewedBy ?? null, input.reviewNote ?? null])
    return socialPost(result.rows[0])
  }
  async findSocialPost(id: string) { const result = await this.db.query<SocialPostRow>(`SELECT ${socialPostColumns} FROM social_posts WHERE id = $1`, [id]); return result.rows[0] ? socialPost(result.rows[0]) : undefined }
  async listSocialPosts(options: { authorId?: string; cursor?: SocialPostCursor; limit: number; moderationOnly?: boolean; publishedOnly?: boolean }) {
    const visibilityFilter = options.moderationOnly ? "visibility = 'pending-review'" : options.publishedOnly ? "visibility = 'published'" : 'TRUE'
    const result = await this.db.query<SocialPostRow>(`SELECT ${socialPostColumns} FROM social_posts WHERE ($1::text IS NULL OR author_id = $1) AND ${visibilityFilter} AND ($2::timestamptz IS NULL OR created_at < $2 OR (created_at = $2 AND id < $3::uuid)) ORDER BY created_at DESC, id DESC LIMIT $4`, [options.authorId ?? null, options.cursor?.createdAt ?? null, options.cursor?.id ?? null, options.limit])
    return result.rows.map(socialPost)
  }
  async getSocialAccountState(accountId: string): Promise<SocialAccountState> {
    const [follows, bookmarks] = await Promise.all([
      this.db.query<{ following_id: string }>('SELECT following_id FROM social_account_follows WHERE follower_id = $1 ORDER BY following_id ASC LIMIT 500', [accountId]),
      this.db.query<{ post_id: string }>('SELECT post_id FROM social_post_bookmarks WHERE account_id = $1 ORDER BY created_at DESC, post_id DESC LIMIT 1000', [accountId]),
    ])
    return { followedAccountIds: follows.rows.map(row => row.following_id), bookmarkedPostIds: bookmarks.rows.map(row => row.post_id) }
  }
  followSocialAccount(followerId: string, followingId: string, maxFollows: number): Promise<void> {
    if (followerId === followingId) return Promise.reject(new Error('SOCIAL_SELF_FOLLOW'))
    return this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LEAST($1,$2)),hashtext(GREATEST($1,$2)))', [followerId, followingId])
      const blocked = await client.query<{ blocked: boolean }>('SELECT EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)) AS blocked', [followerId, followingId])
      if (blocked.rows[0]?.blocked) throw new Error('SOCIAL_ACCOUNT_BLOCKED')
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext('social-follows'))", [followerId])
      const existing = await client.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM social_account_follows WHERE follower_id = $1 AND following_id = $2) AS exists', [followerId, followingId])
      if (existing.rows[0]?.exists) return
      const count = await client.query<{ count: number | string }>('SELECT count(*)::int AS count FROM social_account_follows WHERE follower_id = $1', [followerId])
      if (Number(count.rows[0]?.count || 0) >= maxFollows) throw new Error('SOCIAL_FOLLOW_LIMIT')
      await client.query('INSERT INTO social_account_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT (follower_id, following_id) DO NOTHING', [followerId, followingId])
    })
  }
  async unfollowSocialAccount(followerId: string, followingId: string): Promise<void> {
    await this.db.query('DELETE FROM social_account_follows WHERE follower_id = $1 AND following_id = $2', [followerId, followingId])
  }
  bookmarkSocialPost(accountId: string, postId: string, maxBookmarks: number): Promise<void> {
    return this.withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext('social-bookmarks'))", [accountId])
      const existing = await client.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM social_post_bookmarks WHERE account_id = $1 AND post_id = $2) AS exists', [accountId, postId])
      if (existing.rows[0]?.exists) return
      const count = await client.query<{ count: number | string }>('SELECT count(*)::int AS count FROM social_post_bookmarks WHERE account_id = $1', [accountId])
      if (Number(count.rows[0]?.count || 0) >= maxBookmarks) throw new Error('SOCIAL_BOOKMARK_LIMIT')
      await client.query('INSERT INTO social_post_bookmarks (account_id, post_id) VALUES ($1, $2) ON CONFLICT (account_id, post_id) DO NOTHING', [accountId, postId])
    })
  }
  async unbookmarkSocialPost(accountId: string, postId: string): Promise<void> {
    await this.db.query('DELETE FROM social_post_bookmarks WHERE account_id = $1 AND post_id = $2', [accountId, postId])
  }
  async deleteSocialPost(id: string, authorId: string) { const result = await this.db.query<SocialPostRow>(`DELETE FROM social_posts WHERE id = $1 AND author_id = $2 RETURNING ${socialPostColumns}`, [id, authorId]); return result.rows[0] ? socialPost(result.rows[0]) : undefined }
  async reviewSocialPost(id: string, status: Extract<SocialPostVisibility, 'published' | 'rejected' | 'removed'>, staffId: string, note?: string) {
    const result = await this.db.query<SocialPostRow>(`UPDATE social_posts SET visibility = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3, updated_at = NOW() WHERE id = $4 AND visibility <> 'removed' AND ($1 <> 'published' OR visibility = 'pending-review') RETURNING ${socialPostColumns}`, [status, staffId, note?.slice(0, 500) ?? null, id])
    return result.rows[0] ? socialPost(result.rows[0]) : undefined
  }
  async createSocialStory(input: SocialStory, mediaLimitBytes: number): Promise<SocialStory> {
    if (input.media && input.media.sizeBytes > mediaLimitBytes) throw new StorageQuotaExceededError(0, mediaLimitBytes, input.media.sizeBytes)
    const inserted = await this.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.authorId])
      const count = await client.query<{ count: number | string }>('SELECT COUNT(*)::int AS count FROM social_stories WHERE author_id = $1 AND expires_at > $2', [input.authorId, input.createdAt])
      if (Number(count.rows[0]?.count || 0) >= socialStoryMaxActivePerAccount) throw new Error('SOCIAL_STORY_LIMIT')
      const result = await client.query<SocialStoryRow>(`INSERT INTO social_stories (${socialStoryColumns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${socialStoryColumns}`, [input.id, input.authorId, input.kind, input.body, input.audience, input.media?.storageKey ?? null, input.media?.mimeType ?? null, input.media?.sizeBytes ?? null, input.media?.sha256 ?? null, input.createdAt, input.expiresAt])
      return result.rows[0]
    })
    return socialStory(inserted)
  }
  async findSocialStory(id: string) {
    const result = await this.db.query<SocialStoryRow>(`SELECT ${socialStoryColumns} FROM social_stories WHERE id = $1`, [id])
    return result.rows[0] ? socialStory(result.rows[0]) : undefined
  }
  async listSocialStories(options: { expiresAfter?: string; cursor?: SocialStoryCursor; limit: number }) {
    const result = await this.db.query<SocialStoryRow>(`SELECT ${socialStoryColumns} FROM social_stories WHERE ($1::timestamptz IS NULL OR expires_at > $1) AND ($2::timestamptz IS NULL OR created_at < $2 OR (created_at = $2 AND id < $3::uuid)) ORDER BY created_at DESC, id DESC LIMIT $4`, [options.expiresAfter ?? null, options.cursor?.createdAt ?? null, options.cursor?.id ?? null, options.limit])
    return result.rows.map(socialStory)
  }
  async deleteSocialStory(id: string, authorId: string) {
    const result = await this.db.query<SocialStoryRow>(`DELETE FROM social_stories WHERE id = $1 AND author_id = $2 RETURNING ${socialStoryColumns}`, [id, authorId])
    return result.rows[0] ? socialStory(result.rows[0]) : undefined
  }
  async deleteExpiredSocialStories(now: string) {
    const result = await this.db.query<SocialStoryRow>(`DELETE FROM social_stories WHERE expires_at <= $1 RETURNING ${socialStoryColumns}`, [now])
    return result.rows.map(socialStory)
  }
  async listSocialPostComments(postId: string, limit = 100): Promise<SocialPostComment[]> {
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 100
    const result = await this.db.query<SocialPostCommentRow>('SELECT id, post_id, author_id, body, created_at FROM (SELECT id, post_id, author_id, body, created_at FROM social_post_comments WHERE post_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) recent ORDER BY created_at ASC, id ASC', [postId, safeLimit])
    return result.rows.map(row => ({ id: row.id, postId: row.post_id, authorId: row.author_id, body: row.body, createdAt: row.created_at }))
  }
  async createSocialPostComment(input: SocialPostComment): Promise<SocialPostComment> {
    const result = await this.db.query<SocialPostCommentRow>('INSERT INTO social_post_comments (id, post_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, post_id, author_id, body, created_at', [input.id, input.postId, input.authorId, input.body, input.createdAt])
    const row = result.rows[0]
    return { id: row.id, postId: row.post_id, authorId: row.author_id, body: row.body, createdAt: row.created_at }
  }
  async createSocialPostCommentWithNotification(input: SocialPostComment, inputSeed?: NotificationSeed) {
    const seed = normalizedNotificationSeed(inputSeed, 'social_post_comment', 'post', input.postId, input.id)
    const result = await this.db.query<SocialPostCommentRow & NotificationMutationRow>(`WITH created AS (
      INSERT INTO social_post_comments (id, post_id, author_id, body, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, post_id, author_id, body, created_at
    ), saved AS (
      INSERT INTO notifications (${notificationColumns})
      SELECT $6::uuid, post.author_id, created.author_id, 'social_post_comment', 'post', created.post_id, created.id, 'social_post_comment:' || created.id, $7::timestamptz, NULL
      FROM created JOIN social_posts post ON post.id = created.post_id
      WHERE $6::uuid IS NOT NULL AND post.author_id <> created.author_id
      ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
      RETURNING ${notificationColumns}
    )
    SELECT created.*, ${notificationMutationColumns} FROM created LEFT JOIN saved ON TRUE`, [input.id, input.postId, input.authorId, input.body, input.createdAt, seed?.id ?? null, seed?.createdAt ?? null])
    const row = result.rows[0]
    if (!row) throw new Error('SOCIAL_POST_COMMENT_CREATE_FAILED')
    const saved = notificationFromMutation(row)
    return { value: { id: row.id, postId: row.post_id, authorId: row.author_id, body: row.body, createdAt: row.created_at }, notifications: saved ? [saved] : [] }
  }
  async listSocialPostReactions(postId: string): Promise<string[]> {
    const result = await this.db.query<{ actor_id: string }>('SELECT actor_id FROM social_post_reactions WHERE post_id = $1 AND active = TRUE ORDER BY created_at ASC, actor_id ASC', [postId])
    return result.rows.map(row => row.actor_id)
  }
  async getSocialPostReactionSummary(postId: string, actorId: string) {
    const result = await this.db.query<{ reaction_count: number | string; reacted_by_me: boolean }>('SELECT COUNT(*) FILTER (WHERE active)::int AS reaction_count, EXISTS (SELECT 1 FROM social_post_reactions mine WHERE mine.post_id = $1 AND mine.actor_id = $2 AND mine.active = TRUE) AS reacted_by_me FROM social_post_reactions WHERE post_id = $1', [postId, actorId])
    return { reactionCount: Number(result.rows[0]?.reaction_count || 0), reactedByMe: result.rows[0]?.reacted_by_me === true }
  }
  async toggleSocialPostReaction(postId: string, actorId: string): Promise<boolean> {
    const result = await this.db.query<{ active: boolean }>('INSERT INTO social_post_reactions (post_id, actor_id, active, created_at, updated_at) VALUES ($1, $2, TRUE, NOW(), NOW()) ON CONFLICT (post_id, actor_id) DO UPDATE SET active = NOT social_post_reactions.active, updated_at = NOW() RETURNING active', [postId, actorId])
    return result.rows[0]?.active ?? false
  }
  async toggleSocialPostReactionWithNotification(postId: string, actorId: string, inputSeed?: NotificationSeed) {
    const sourceId = `${postId}:${actorId}`
    const seed = normalizedNotificationSeed(inputSeed, 'social_post_reaction', 'post', postId, sourceId)
    const result = await this.db.query<{ active: boolean } & NotificationMutationRow>(`WITH changed AS (
      INSERT INTO social_post_reactions (post_id, actor_id, active, created_at, updated_at)
      VALUES ($1, $2, TRUE, NOW(), NOW())
      ON CONFLICT (post_id, actor_id) DO UPDATE SET active = NOT social_post_reactions.active, updated_at = NOW()
      RETURNING post_id, actor_id, active
    ), saved AS (
      INSERT INTO notifications (${notificationColumns})
      SELECT $3::uuid, post.author_id, changed.actor_id, 'social_post_reaction', 'post', changed.post_id, changed.post_id || ':' || changed.actor_id, 'social_post_reaction:' || changed.post_id || ':' || changed.actor_id, $4::timestamptz, NULL
      FROM changed JOIN social_posts post ON post.id = changed.post_id
      WHERE changed.active = TRUE AND $3::uuid IS NOT NULL AND post.author_id <> changed.actor_id
      ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
      RETURNING ${notificationColumns}
    )
    SELECT changed.active, ${notificationMutationColumns} FROM changed LEFT JOIN saved ON TRUE`, [postId, actorId, seed?.id ?? null, seed?.createdAt ?? null])
    const row = result.rows[0]
    const saved = row ? notificationFromMutation(row) : undefined
    return { value: row?.active ?? false, notifications: saved ? [saved] : [] }
  }
  async drainNotificationOutbox(): Promise<NotificationRecord[]> { return [] }
  async createSocialPostReport(input: SocialPostReport) {
    const result = await this.db.query<SocialPostReportRow>('INSERT INTO social_post_reports (id, post_id, reporter_id, reason, details, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, post_id, reporter_id, reason, details, status, created_at, reviewed_at, reviewed_by', [input.id, input.postId, input.reporterId, input.reason, input.details, input.status, input.createdAt])
    return socialPostReport(result.rows[0])
  }
  async deleteSocialPostReport(id: string, reporterId: string) { const result = await this.db.query('DELETE FROM social_post_reports WHERE id = $1 AND reporter_id = $2 RETURNING id', [id, reporterId]); return result.rows.length > 0 }
  async listSocialPostReports(status?: SocialPostReport['status']) {
    const result = await this.db.query<SocialPostReportRow>('SELECT id, post_id, reporter_id, reason, details, status, created_at, reviewed_at, reviewed_by FROM social_post_reports WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT 500', [status ?? null])
    return result.rows.map(socialPostReport)
  }
  async reviewSocialPostReport(id: string, status: Extract<SocialPostReport['status'], 'reviewed' | 'dismissed'>, staffId: string) {
    const result = await this.db.query<SocialPostReportRow>('UPDATE social_post_reports SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 AND status = \'open\' RETURNING id, post_id, reporter_id, reason, details, status, created_at, reviewed_at, reviewed_by', [status, staffId, id])
    return result.rows[0] ? socialPostReport(result.rows[0]) : undefined
  }
  async reviewSocialPostReportWithAudit(id: string, status: Extract<SocialPostReport['status'], 'reviewed' | 'dismissed'>, staffId: string, event: AuditEvent) {
    return this.withTransaction(async client => {
      const result = await client.query<SocialPostReportRow>('UPDATE social_post_reports SET status=$1, reviewed_by=$2, reviewed_at=$3 WHERE id=$4 AND status=\'open\' RETURNING id, post_id, reporter_id, reason, details, status, created_at, reviewed_at, reviewed_by', [status, staffId, event.timestamp, id])
      if (!result.rows[0]) return undefined
      await client.query('INSERT INTO audit_events(id,timestamp,action,request_id,actor_id,target_id,success,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [event.id, event.timestamp, event.action, event.requestId, event.actorId ?? null, event.targetId ?? null, event.success, JSON.stringify(event.metadata)])
      return socialPostReport(result.rows[0])
    })
  }
  async createSocialStoryReport(input: SocialStoryReport) {
    const result = await this.db.query<SocialStoryReportRow>(`INSERT INTO social_story_reports (id,story_id,author_id,reporter_id,story_kind,story_body,story_audience,story_created_at,story_expires_at,media_sha256,evidence_storage_key,evidence_mime_type,evidence_size_bytes,evidence_delete_at,reason,details,status,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING id,story_id,author_id,reporter_id,story_kind,story_body,story_audience,story_created_at,story_expires_at,media_sha256,evidence_storage_key,evidence_mime_type,evidence_size_bytes,evidence_delete_at,evidence_expired_at,reason,details,status,created_at,reviewed_at,reviewed_by`, [input.id, input.storyId, input.authorId, input.reporterId, input.kind, input.body, input.audience, input.storyCreatedAt, input.storyExpiresAt, input.mediaSha256 ?? null, input.evidenceStorageKey ?? null, input.evidenceMimeType ?? null, input.evidenceSizeBytes ?? null, input.evidenceDeleteAt ?? null, input.reason, input.details, input.status, input.createdAt])
    return socialStoryReport(result.rows[0])
  }
  async deleteSocialStoryReport(id: string, reporterId: string) {
    const result = await this.db.query('DELETE FROM social_story_reports WHERE id=$1 AND reporter_id=$2 RETURNING id', [id, reporterId])
    return result.rows.length > 0
  }
  async listSocialStoryReports(status?: SocialStoryReport['status']) {
    const result = await this.db.query<SocialStoryReportRow>(`SELECT id,story_id,author_id,reporter_id,story_kind,story_body,story_audience,story_created_at,story_expires_at,media_sha256,evidence_storage_key,evidence_mime_type,evidence_size_bytes,evidence_delete_at,evidence_expired_at,reason,details,status,created_at,reviewed_at,reviewed_by FROM social_story_reports WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC,id DESC`, [status ?? null])
    return result.rows.map(socialStoryReport)
  }
  async pageSocialStoryReports(status: SocialStoryReport['status'] | undefined, cursor: SocialStoryReportCursor | undefined, limit: number): Promise<SocialStoryReportPage> {
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50
    const result = await this.db.query<SocialStoryReportRow>(`SELECT id,story_id,author_id,reporter_id,story_kind,story_body,story_audience,story_created_at,story_expires_at,media_sha256,evidence_storage_key,evidence_mime_type,evidence_size_bytes,evidence_delete_at,evidence_expired_at,reason,details,status,created_at,reviewed_at,reviewed_by FROM social_story_reports WHERE ($1::text IS NULL OR status=$1) AND ($2::timestamptz IS NULL OR created_at < $2 OR (created_at=$2 AND id < $3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`, [status ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, safeLimit + 1])
    const hasMore = result.rows.length > safeLimit
    const reports = result.rows.slice(0, safeLimit).map(socialStoryReport)
    const last = reports.at(-1)
    return { reports, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null }
  }
  async reviewSocialStoryReport(id: string, status: Extract<SocialStoryReport['status'], 'reviewed' | 'dismissed'>, staffId: string, event: AuditEvent) {
    return this.withTransaction(async client => {
      const result = await client.query<SocialStoryReportRow>(`UPDATE social_story_reports SET status=$1,reviewed_by=$2,reviewed_at=$3,evidence_delete_at=CASE WHEN evidence_storage_key IS NULL THEN NULL ELSE LEAST($3::timestamptz + INTERVAL '30 days',created_at + INTERVAL '90 days') END WHERE id=$4 AND status='open'
        RETURNING id,story_id,author_id,reporter_id,story_kind,story_body,story_audience,story_created_at,story_expires_at,media_sha256,evidence_storage_key,evidence_mime_type,evidence_size_bytes,evidence_delete_at,evidence_expired_at,reason,details,status,created_at,reviewed_at,reviewed_by`, [status, staffId, event.timestamp, id])
      if (!result.rows[0]) return undefined
      await client.query('INSERT INTO audit_events(id,timestamp,action,request_id,actor_id,target_id,success,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [event.id, event.timestamp, event.action, event.requestId, event.actorId ?? null, event.targetId ?? null, event.success, JSON.stringify(event.metadata)])
      return socialStoryReport(result.rows[0])
    })
  }
  async listExpiredSocialStoryEvidence(now: string, limit: number) {
    const result = await this.db.query<SocialStoryReportRow>(`SELECT id,story_id,author_id,reporter_id,story_kind,story_body,story_audience,story_created_at,story_expires_at,media_sha256,evidence_storage_key,evidence_mime_type,evidence_size_bytes,evidence_delete_at,evidence_expired_at,reason,details,status,created_at,reviewed_at,reviewed_by FROM social_story_reports WHERE evidence_storage_key IS NOT NULL AND ((status='open' AND created_at <= $1::timestamptz - INTERVAL '90 days') OR (status <> 'open' AND evidence_delete_at <= $1)) ORDER BY COALESCE(evidence_delete_at,created_at + INTERVAL '90 days') LIMIT $2`, [now, Math.min(Math.max(limit, 1), 500)])
    return result.rows.map(socialStoryReport)
  }
  async clearSocialStoryEvidence(reportId: string, expiredAt: string) { await this.db.query(`UPDATE social_story_reports SET evidence_storage_key=NULL,evidence_mime_type=NULL,evidence_size_bytes=NULL,evidence_expired_at=$2 WHERE id=$1 AND evidence_storage_key IS NOT NULL AND ((status='open' AND created_at <= $2::timestamptz - INTERVAL '90 days') OR (status <> 'open' AND evidence_delete_at <= $2))`, [reportId, expiredAt]) }
  async listSocialStoryEvidenceStorageKeys() { return (await this.db.query<{ evidence_storage_key: string }>('SELECT evidence_storage_key FROM social_story_reports WHERE evidence_storage_key IS NOT NULL')).rows.map(row => row.evidence_storage_key) }
  async drainSocialModerationAudit() { /* PostgreSQL commits moderation and its audit event in one transaction. */ }
  async findAccountByEmail(email: string) { const result = await this.db.query<AccountRow>('SELECT * FROM accounts WHERE email = $1', [email]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async findAccountById(id: string) { const result = await this.db.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [id]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async listAccounts() { const result = await this.db.query<AccountRow>('SELECT * FROM accounts ORDER BY email ASC'); return result.rows.map(account) }
  async findAccountByToken(kind: 'verify' | 'reset', hash: string) { const column = kind === 'verify' ? 'verification_token_hash' : 'reset_token_hash'; const result = await this.db.query<AccountRow>(`SELECT * FROM accounts WHERE ${column} = $1`, [hash]); return result.rows[0] ? account(result.rows[0]) : undefined }
  async saveAccount(input: Account) { await this.db.query('INSERT INTO accounts (id, email, password_hash, role, verification_state, verification_token_hash, verification_token_expires_at, reset_token_hash, reset_token_expires_at, plan_id, purchased_plan_ids) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), $8, to_timestamp($9 / 1000.0), $10, $11) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, verification_state = EXCLUDED.verification_state, verification_token_hash = EXCLUDED.verification_token_hash, verification_token_expires_at = EXCLUDED.verification_token_expires_at, reset_token_hash = EXCLUDED.reset_token_hash, reset_token_expires_at = EXCLUDED.reset_token_expires_at, plan_id = EXCLUDED.plan_id, purchased_plan_ids = EXCLUDED.purchased_plan_ids', [input.id, input.email, input.passwordHash, input.role, input.verificationState, input.verificationTokenHash ?? null, input.verificationTokenExpiresAt ?? null, input.resetTokenHash ?? null, input.resetTokenExpiresAt ?? null, input.planId ?? 'free', JSON.stringify(input.purchasedPlanIds || [])]) }
  async createSession(input: SessionRecord) { await this.db.query('INSERT INTO auth_sessions (token_hash, account_id, csrf_token_hash, expires_at) VALUES ($1, $2, $3, to_timestamp($4 / 1000.0)) ON CONFLICT (token_hash) DO UPDATE SET account_id = EXCLUDED.account_id, csrf_token_hash = EXCLUDED.csrf_token_hash, expires_at = EXCLUDED.expires_at', [input.tokenHash, input.accountId, input.csrfTokenHash, input.expiresAt]) }
  async findSession(hash: string) { const result = await this.db.query<SessionRow>('SELECT token_hash, account_id, csrf_token_hash, (extract(epoch FROM expires_at) * 1000)::bigint::text AS expires_at FROM auth_sessions WHERE token_hash = $1 AND expires_at > NOW()', [hash]); const row = result.rows[0]; return row ? { tokenHash: row.token_hash, accountId: row.account_id, csrfTokenHash: row.csrf_token_hash, expiresAt: Number(row.expires_at) } : undefined }
  async deleteSession(hash: string) { await this.db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hash]) }
  async deleteExpiredSessions(now: number) { await this.db.query('DELETE FROM auth_sessions WHERE expires_at <= to_timestamp($1 / 1000.0)', [now]) }
  async deleteAccountSessions(accountId: string, exceptTokenHash?: string) { await this.db.query('DELETE FROM auth_sessions WHERE account_id = $1 AND ($2::text IS NULL OR token_hash <> $2)', [accountId, exceptTokenHash ?? null]) }
  async clearSessions() { await this.db.query('DELETE FROM auth_sessions') }

  async findStripeConnectAccount(accountId: string) { const result = await this.db.query<StripeConnectRecord>(`SELECT account_id AS "accountId", stripe_account_id AS "stripeAccountId", charges_enabled AS "chargesEnabled", payouts_enabled AS "payoutsEnabled", details_submitted AS "detailsSubmitted", deauthorized, updated_at::text AS "updatedAt" FROM stripe_connected_accounts WHERE account_id = $1`, [accountId]); return result.rows[0] }
  async findStripeConnectAccountByStripeId(stripeAccountId: string) { const result = await this.db.query<StripeConnectRecord>(`SELECT account_id AS "accountId", stripe_account_id AS "stripeAccountId", charges_enabled AS "chargesEnabled", payouts_enabled AS "payoutsEnabled", details_submitted AS "detailsSubmitted", deauthorized, updated_at::text AS "updatedAt" FROM stripe_connected_accounts WHERE stripe_account_id = $1`, [stripeAccountId]); return result.rows[0] }
  async saveStripeConnectAccount(input: StripeConnectRecord) { await this.db.query('INSERT INTO stripe_connected_accounts (account_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, deauthorized, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (account_id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id, charges_enabled = EXCLUDED.charges_enabled, payouts_enabled = EXCLUDED.payouts_enabled, details_submitted = EXCLUDED.details_submitted, deauthorized = EXCLUDED.deauthorized, updated_at = EXCLUDED.updated_at', [input.accountId, input.stripeAccountId, input.chargesEnabled, input.payoutsEnabled, input.detailsSubmitted, input.deauthorized, input.updatedAt]) }
  async hasProcessedStripeEvent(eventId: string) { const result = await this.db.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE event_id = $1) AS exists', [eventId]); return result.rows[0]?.exists ?? false }
  async recordProcessedStripeEvent(eventId: string, eventType: string) { const result = await this.db.query<{ event_id: string }>('INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id', [eventId, eventType]); return result.rows.length > 0 }
  async findSellerLink(accountIdOrScope: string | MercadoPagoScope, applicationId?: string, mode?: PaymentEnvironment) { const scope = typeof accountIdOrScope === 'string' ? { accountId: accountIdOrScope, applicationId: applicationId!, mode: mode! } : accountIdOrScope; const result = await this.db.query<MercadoPagoSellerLink>(`SELECT account_id AS "accountId",application_id AS "applicationId",mode,provider_user_id AS "providerUserId",encrypted_access_token AS "encryptedAccessToken",encrypted_refresh_token AS "encryptedRefreshToken",access_token_expires_at::text AS "accessTokenExpiresAt",version,status,updated_at::text AS "updatedAt" FROM mercadopago_seller_links WHERE account_id=$1 AND application_id=$2 AND mode=$3`, [scope.accountId,scope.applicationId,scope.mode]); return result.rows[0] }
  async findSellerLinkByProviderUserId(providerUserId: string, applicationId: string, mode: PaymentEnvironment) { const result = await this.db.query<MercadoPagoSellerLink>(`SELECT account_id AS "accountId",application_id AS "applicationId",mode,provider_user_id AS "providerUserId",encrypted_access_token AS "encryptedAccessToken",encrypted_refresh_token AS "encryptedRefreshToken",access_token_expires_at::text AS "accessTokenExpiresAt",version,status,updated_at::text AS "updatedAt" FROM mercadopago_seller_links WHERE provider_user_id=$1 AND application_id=$2 AND mode=$3`, [providerUserId,applicationId,mode]); return result.rows[0] }
  async saveSellerLink(input: MercadoPagoSellerLink, expectedVersion: number) { if (!isMercadoPagoSellerLink(input) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || input.version !== expectedVersion + 1) throw new Error('MERCADOPAGO_SELLER_LINK_INVALID'); const result = await this.db.query(`INSERT INTO mercadopago_seller_links (account_id,application_id,mode,provider_user_id,encrypted_access_token,encrypted_refresh_token,access_token_expires_at,version,status,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (account_id,application_id,mode) DO UPDATE SET provider_user_id=EXCLUDED.provider_user_id,encrypted_access_token=EXCLUDED.encrypted_access_token,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,access_token_expires_at=EXCLUDED.access_token_expires_at,version=EXCLUDED.version,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at WHERE mercadopago_seller_links.version=$11 RETURNING account_id`, [input.accountId,input.applicationId,input.mode,input.providerUserId,input.encryptedAccessToken,input.encryptedRefreshToken,input.accessTokenExpiresAt,input.version,input.status,input.updatedAt,expectedVersion]); return (result.rowCount ?? 0) > 0 }
  async createOAuthIntent(input: MercadoPagoOAuthIntent) { if (!isMercadoPagoOAuthIntent(input)) throw new Error('MERCADOPAGO_OAUTH_INTENT_INVALID'); await this.db.query('INSERT INTO mercadopago_oauth_intents (state_hash,account_id,application_id,mode,session_binding_hash,encrypted_code_verifier,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [input.stateHash,input.accountId,input.applicationId,input.mode,input.sessionBindingHash,input.encryptedCodeVerifier,input.createdAt,input.expiresAt]) }
  async consumeOAuthIntent(stateHash: string, sessionBindingHash: string, now: string) { const result = await this.db.query<MercadoPagoOAuthIntent>(`DELETE FROM mercadopago_oauth_intents WHERE state_hash=$1 AND session_binding_hash=$2 AND expires_at>$3 RETURNING state_hash AS "stateHash",account_id AS "accountId",application_id AS "applicationId",mode,session_binding_hash AS "sessionBindingHash",encrypted_code_verifier AS "encryptedCodeVerifier",created_at::text AS "createdAt",expires_at::text AS "expiresAt"`, [stateHash,sessionBindingHash,now]); return result.rows[0] }
  async deleteExpiredOAuthIntents(now: string) { const result = await this.db.query('DELETE FROM mercadopago_oauth_intents WHERE expires_at <= $1', [now]); return result.rowCount ?? 0 }
  async withSellerLock<T>(scope: MercadoPagoScope, action: () => Promise<T>): Promise<T> {
    const key = `mercadopago:${scope.applicationId}:${scope.mode}:${scope.accountId}`
    if (!this.db.connect) return action()
    const connection = await this.db.connect()
    try {
      await connection.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key])
      return await action()
    } finally {
      try { await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]) } finally { connection.release() }
    }
  }
  async reservePreference(request: MercadoPagoPreferenceReservation): Promise<MercadoPagoPreferenceClaim> {
    return this.withTransaction(async client => {
      const inserted = await client.query<{ key: string }>(`INSERT INTO mercadopago_preference_reservations (application_id,mode,key,fingerprint,account_id,buyer_id,order_id,operation_id,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'reserved') ON CONFLICT (application_id,mode,key) DO NOTHING RETURNING key`, [request.applicationId,request.mode,request.key,request.fingerprint,request.accountId,request.buyerId,request.orderId,request.operationId])
      if (inserted.rows.length) return { state: 'reserved' }
      const selected = await client.query<{ fingerprint: string; account_id: string; buyer_id: string; order_id: string; operation_id: string; status: string; result: MercadoPagoPreference | null; stale: boolean }>(`SELECT fingerprint,account_id,buyer_id,order_id,operation_id,status,result,(reserved_at <= NOW() - INTERVAL '2 minutes') AS stale FROM mercadopago_preference_reservations WHERE application_id=$1 AND mode=$2 AND key=$3 FOR UPDATE`, [request.applicationId,request.mode,request.key])
      const prior = selected.rows[0]
      if (!prior || prior.fingerprint !== request.fingerprint || prior.account_id !== request.accountId || prior.buyer_id !== request.buyerId || prior.order_id !== request.orderId || prior.operation_id !== request.operationId) return { state: 'conflict' }
      if (prior.status === 'complete' && prior.result) return { state: 'complete', result: prior.result }
      if (prior.status === 'uncertain' || prior.stale) {
        await client.query(`UPDATE mercadopago_preference_reservations SET status='uncertain',updated_at=NOW() WHERE application_id=$1 AND mode=$2 AND key=$3`, [request.applicationId,request.mode,request.key])
        return { state: 'uncertain' }
      }
      return { state: 'busy' }
    })
  }
  async completePreference(key: string, fingerprint: string, result: MercadoPagoPreference) {
    const updated = await this.db.query(`UPDATE mercadopago_preference_reservations SET status='complete',result=$3::jsonb,updated_at=NOW() WHERE key=$1 AND fingerprint=$2 AND status='reserved'`, [key,fingerprint,JSON.stringify(result)])
    if ((updated.rowCount ?? 0) > 0) return
    const prior = await this.db.query<{ status: string; fingerprint: string; result: MercadoPagoPreference | null }>('SELECT status,fingerprint,result FROM mercadopago_preference_reservations WHERE key=$1', [key])
    if (!prior.rows[0] || prior.rows[0].fingerprint !== fingerprint || prior.rows[0].status !== 'complete' || JSON.stringify(prior.rows[0].result) !== JSON.stringify(result)) throw new Error('MERCADOPAGO_PREFERENCE_RESERVATION_CONFLICT')
  }
  async failPreference(key: string, fingerprint: string, uncertain: boolean) {
    if (uncertain) await this.db.query(`UPDATE mercadopago_preference_reservations SET status='uncertain',updated_at=NOW() WHERE key=$1 AND fingerprint=$2 AND status='reserved'`, [key,fingerprint])
    else await this.db.query(`DELETE FROM mercadopago_preference_reservations WHERE key=$1 AND fingerprint=$2 AND status='reserved'`, [key,fingerprint])
  }
  private mercadoPagoPaymentSelect = `id,order_id AS "orderId",seller_id AS "sellerId",mode,application_id AS "applicationId",provider_user_id AS "providerUserId",idempotency_key AS "idempotencyKey",preference_id AS "preferenceId",checkout_url AS "checkoutUrl",external_reference AS "externalReference",amount_minor::float8 AS "amountMinor",currency,quote_snapshot AS quote,status,created_at::text AS "createdAt",updated_at::text AS "updatedAt"`
  async createMercadoPagoOrderPayment(input: MercadoPagoOrderPayment) {
    if (!isMercadoPagoOrderPayment(input)) throw new Error('MERCADOPAGO_PAYMENT_INVALID')
    const order = await this.findBeatOrder(input.orderId)
    if (!order || order.sellerId !== input.sellerId || order.currency !== 'mxn' || order.paymentProvider !== 'mercadopago' || order.mercadoPagoMode !== input.mode || order.mercadoPagoClientId !== input.applicationId || order.mercadoPagoPreferenceId !== input.preferenceId || !order.mercadoPagoQuote || order.mercadoPagoQuote.amountMinor !== input.amountMinor || order.mercadoPagoQuote.sourceAmountMinor !== input.quote.sourceAmountMinor || order.mercadoPagoQuote.exchangeRateUsdMxn !== input.quote.exchangeRateUsdMxn || order.mercadoPagoQuote.commissionMinor !== input.quote.marketplaceFeeMinor || order.mercadoPagoQuote.sellerNetMinor !== input.quote.sellerNetMinor) throw new Error('MERCADOPAGO_ORDER_SELLER_MISMATCH')
    const result = await this.db.query<MercadoPagoOrderPayment>(`INSERT INTO mercadopago_order_payments (id,order_id,seller_id,mode,application_id,provider_user_id,idempotency_key,preference_id,checkout_url,external_reference,amount_minor,currency,quote_snapshot,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16) ON CONFLICT (application_id,mode,provider_user_id,idempotency_key) DO NOTHING RETURNING ${this.mercadoPagoPaymentSelect}`, [input.id,input.orderId,input.sellerId,input.mode,input.applicationId,input.providerUserId,input.idempotencyKey,input.preferenceId,input.checkoutUrl,input.externalReference,input.amountMinor,input.currency,JSON.stringify(input.quote),input.status,input.createdAt,input.updatedAt])
    if (result.rows[0]) return result.rows[0]
    const existing = await this.db.query<MercadoPagoOrderPayment>(`SELECT ${this.mercadoPagoPaymentSelect} FROM mercadopago_order_payments WHERE application_id=$1 AND mode=$2 AND provider_user_id=$3 AND idempotency_key=$4`, [input.applicationId,input.mode,input.providerUserId,input.idempotencyKey])
    const prior = existing.rows[0]
    if (!prior || prior.orderId !== input.orderId || prior.sellerId !== input.sellerId || prior.amountMinor !== input.amountMinor || prior.currency !== input.currency || JSON.stringify(prior.quote) !== JSON.stringify(input.quote)) throw new Error('MERCADOPAGO_IDEMPOTENCY_CONFLICT')
    return prior
  }
  async findMercadoPagoOrderPayment(id: string) { const result = await this.db.query<MercadoPagoOrderPayment>(`SELECT ${this.mercadoPagoPaymentSelect} FROM mercadopago_order_payments WHERE id=$1`, [id]); return result.rows[0] }
  async findMercadoPagoOrderPayments(orderId: string) { const result = await this.db.query<MercadoPagoOrderPayment>(`SELECT ${this.mercadoPagoPaymentSelect} FROM mercadopago_order_payments WHERE order_id=$1 ORDER BY created_at ASC`, [orderId]); return result.rows }
  async findMercadoPagoOrderPaymentByPreference(applicationId: string, mode: PaymentEnvironment, providerUserId: string, preferenceId: string) { const result = await this.db.query<MercadoPagoOrderPayment>(`SELECT ${this.mercadoPagoPaymentSelect} FROM mercadopago_order_payments WHERE application_id=$1 AND mode=$2 AND provider_user_id=$3 AND preference_id=$4`, [applicationId,mode,providerUserId,preferenceId]); return result.rows[0] }
  async findMercadoPagoOrderPaymentByProviderPaymentId(applicationId: string, mode: PaymentEnvironment, paymentId: string) { const payment = await this.findMercadoPagoProviderPaymentById(applicationId,mode,paymentId); return payment ? this.findMercadoPagoOrderPaymentByPreference(applicationId,mode,payment.providerUserId,payment.attemptId) : undefined }
  async transitionMercadoPagoOrderPayment(id: string, from: MercadoPagoPaymentStatus[], patch: Partial<Pick<MercadoPagoOrderPayment, 'status' | 'updatedAt'>>) { if (!from.length || !patch.status) return undefined; const result = await this.db.query<MercadoPagoOrderPayment>(`UPDATE mercadopago_order_payments SET status=$2,updated_at=COALESCE($3,updated_at) WHERE id=$1 AND status=ANY($4::text[]) RETURNING ${this.mercadoPagoPaymentSelect}`, [id,patch.status,patch.updatedAt ?? null,from]); return result.rows[0] }
  private mercadoPagoProviderPaymentSelect = `payment_id AS "paymentId",attempt_id AS "attemptId",order_id AS "orderId",application_id AS "applicationId",mode,provider_user_id AS "providerUserId",amount_minor::float8 AS "amountMinor",refunded_minor::float8 AS "refundedMinor",currency,status,status_detail AS "statusDetail",normalized_status AS "normalizedStatus",created_at::text AS "createdAt",updated_at::text AS "updatedAt"`
  async createMercadoPagoProviderPayment(input: MercadoPagoProviderPayment) {
    if (!isMercadoPagoProviderPayment(input)) throw new Error('MERCADOPAGO_PROVIDER_PAYMENT_INVALID')
    const applicationId = input.applicationId ?? input.clientId!
    const attempt = await this.findMercadoPagoOrderPaymentByPreference(applicationId,input.mode,input.providerUserId,input.attemptId)
    if (!attempt || attempt.orderId !== input.orderId || attempt.amountMinor !== input.amountMinor || attempt.currency !== input.currency) throw new Error('MERCADOPAGO_PROVIDER_PAYMENT_MISMATCH')
    const result = await this.db.query<MercadoPagoProviderPayment>(`INSERT INTO mercadopago_provider_payments (payment_id,attempt_id,order_id,application_id,mode,provider_user_id,amount_minor,refunded_minor,currency,status,status_detail,normalized_status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (application_id,mode,payment_id) DO NOTHING RETURNING ${this.mercadoPagoProviderPaymentSelect}`, [input.paymentId,input.attemptId,input.orderId,applicationId,input.mode,input.providerUserId,input.amountMinor,input.refundedMinor,input.currency,input.status,input.statusDetail,input.normalizedStatus,input.createdAt,input.updatedAt])
    if (result.rows[0]) return result.rows[0]
    const prior = await this.findMercadoPagoProviderPaymentById(applicationId,input.mode,input.paymentId)
    if (!prior || prior.orderId !== input.orderId || prior.attemptId !== input.attemptId || prior.amountMinor !== input.amountMinor || prior.providerUserId !== input.providerUserId) throw new Error('MERCADOPAGO_PROVIDER_PAYMENT_CONFLICT')
    return prior
  }
  async findMercadoPagoProviderPaymentById(applicationId: string, mode: PaymentEnvironment, paymentId: string) { const result = await this.db.query<MercadoPagoProviderPayment>(`SELECT ${this.mercadoPagoProviderPaymentSelect} FROM mercadopago_provider_payments WHERE application_id=$1 AND mode=$2 AND payment_id=$3`, [applicationId,mode,paymentId]); return result.rows[0] }
  async listMercadoPagoProviderPaymentsByOrder(orderId: string) { const result = await this.db.query<MercadoPagoProviderPayment>(`SELECT ${this.mercadoPagoProviderPaymentSelect} FROM mercadopago_provider_payments WHERE order_id=$1 ORDER BY created_at,payment_id`, [orderId]); return result.rows }
  async transitionMercadoPagoProviderPayment(paymentId: string, applicationId: string, mode: PaymentEnvironment, from: MercadoPagoProviderPayment['normalizedStatus'][], patch: Partial<Pick<MercadoPagoProviderPayment, 'refundedMinor' | 'status' | 'statusDetail' | 'normalizedStatus' | 'updatedAt'>>) { if (!from.length) return undefined; const result = await this.db.query<MercadoPagoProviderPayment>(`UPDATE mercadopago_provider_payments SET refunded_minor=COALESCE($4,refunded_minor),status=COALESCE($5,status),status_detail=COALESCE($6,status_detail),normalized_status=COALESCE($7,normalized_status),updated_at=COALESCE($8,updated_at) WHERE application_id=$1 AND mode=$2 AND payment_id=$3 AND normalized_status=ANY($9::text[]) RETURNING ${this.mercadoPagoProviderPaymentSelect}`, [applicationId,mode,paymentId,patch.refundedMinor ?? null,patch.status ?? null,patch.statusDetail ?? null,patch.normalizedStatus ?? null,patch.updatedAt ?? null,from]); return result.rows[0] }
  async hasProcessedProviderWebhookEvent(provider: ProviderWebhookEvent['provider'], environment: PaymentEnvironment, eventId: string) { const result = await this.db.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM provider_webhook_events WHERE provider=$1 AND environment=$2 AND event_id=$3) AS exists', [provider,environment,eventId]); return result.rows[0]?.exists ?? false }
  async recordProcessedProviderWebhookEvent(input: ProviderWebhookEvent) { const result = await this.db.query('INSERT INTO provider_webhook_events (provider,environment,event_id,event_type,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (provider,environment,event_id) DO NOTHING RETURNING event_id', [input.provider,input.environment,input.eventId,input.eventType,input.createdAt]); return (result.rowCount ?? 0) > 0 }
  async hasProcessedMercadoPagoEvent(mode: PaymentEnvironment, eventId: string) { return this.hasProcessedProviderWebhookEvent('mercadopago',mode,eventId) }
  async recordProcessedMercadoPagoEvent(mode: PaymentEnvironment, eventId: string, eventType: string) { return this.recordProcessedProviderWebhookEvent({ provider: 'mercadopago', environment: mode, eventId, eventType, createdAt: new Date().toISOString() }) }
  async createBeatOrder(order: BeatOrder) {
    return this.withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext('purchase-source'))", [order.sellerId])
      if (order.fulfillment) {
        const found = await client.query<AssetRow>('SELECT * FROM assets WHERE id=$1 AND owner_id=$2 FOR UPDATE', [order.fulfillment.assetId, order.sellerId])
        const source = found.rows[0] && asset(found.rows[0])
        if (!isPurchaseEntitlement(order.fulfillment) || !source || source.state !== 'available' || source.contentHash !== order.fulfillment.sourceHash || source.sizeBytes !== order.fulfillment.sourceSizeBytes) throw new Error('ORDER_DELIVERABLES_UNAVAILABLE')
      }
      const result = await client.query<{ data: BeatOrder }>('INSERT INTO beat_orders (id, buyer_id, seller_id, checkout_session_id, status, data, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING data', [order.id, order.buyerId, order.sellerId, order.stripeCheckoutSessionId ?? null, order.status, JSON.stringify(order), order.createdAt])
      return result.rows[0].data
    })
  }
  async findBeatOrder(id: string) { const result = await this.db.query<{ data: BeatOrder }>('SELECT data FROM beat_orders WHERE id = $1', [id]); return result.rows[0]?.data }
  async listBeatOrders(buyerId: string) { const result = await this.db.query<{ data: BeatOrder }>('SELECT data FROM beat_orders WHERE buyer_id = $1 ORDER BY created_at DESC', [buyerId]); return result.rows.map(row => row.data) }
  async listAllBeatOrders() { const result = await this.db.query<{ data: BeatOrder }>('SELECT data FROM beat_orders ORDER BY created_at DESC'); return result.rows.map(row => row.data) }
  async findBeatOrderByCheckoutSessionId(sessionId: string) { const result = await this.db.query<{ data: BeatOrder }>('SELECT data FROM beat_orders WHERE checkout_session_id = $1', [sessionId]); return result.rows[0]?.data }
  async findBeatOrderByPaymentIntentId(paymentIntentId: string) { const result = await this.db.query<{ data: BeatOrder }>("SELECT data FROM beat_orders WHERE data->>'stripePaymentIntentId' = $1", [paymentIntentId]); return result.rows[0]?.data }
  async findBeatOrderByMercadoPagoPreferenceId(preferenceId: string) { const result = await this.db.query<{ data: BeatOrder }>("SELECT data FROM beat_orders WHERE data->>'mercadoPagoPreferenceId' = $1", [preferenceId]); return result.rows[0]?.data }
  async findBeatOrderByMercadoPagoPaymentId(paymentId: string) { const result = await this.db.query<{ data: BeatOrder }>("SELECT data FROM beat_orders WHERE data->>'mercadoPagoPaymentId' = $1", [paymentId]); return result.rows[0]?.data }
  async updateBeatOrder(id: string, patch: Partial<Pick<BeatOrder, BeatOrderMutableFields>>) {
    const result = await this.db.query<{ data: BeatOrder }>(`UPDATE beat_orders SET checkout_session_id = COALESCE($2, checkout_session_id), status = COALESCE($3, status), data = data || $4::jsonb WHERE id = $1 RETURNING data`, [id, patch.stripeCheckoutSessionId ?? null, patch.status ?? null, JSON.stringify(patch)])
    return result.rows[0]?.data
  }
  async transitionBeatOrder(id: string, from: BeatOrder['status'][], patch: Partial<Pick<BeatOrder, Exclude<BeatOrderMutableFields, 'status'>>> & Pick<BeatOrder, 'status'>) {
    const result = await this.db.query<{ data: BeatOrder }>(`UPDATE beat_orders SET checkout_session_id = COALESCE($4, checkout_session_id), status = $3, data = data || $5::jsonb WHERE id = $1 AND status = ANY($2::text[]) RETURNING data`, [id, from, patch.status, patch.stripeCheckoutSessionId ?? null, JSON.stringify(patch)])
    return result.rows[0]?.data
  }

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
    const r = await this.db.query<{ owner_id: string; used_bytes: string | number; original_count: string | number; artwork_bytes: string | number; artwork_count: string | number; preview_bytes: string | number; preview_count: string | number }>(`SELECT a.id AS owner_id, COALESCE(u.used_bytes, 0) AS used_bytes,
      COALESCE(asset.original_count, 0) AS original_count, COALESCE(artwork.artwork_bytes, 0) AS artwork_bytes,
      COALESCE(artwork.artwork_count, 0) AS artwork_count, COALESCE(asset.preview_bytes, 0) AS preview_bytes,
      COALESCE(asset.preview_count, 0) AS preview_count
      FROM accounts a LEFT JOIN account_storage_usage u ON u.owner_id = a.id
      LEFT JOIN (SELECT owner_id, COUNT(*) FILTER (WHERE state = 'available') AS original_count,
        COALESCE(SUM(preview_size_bytes) FILTER (WHERE preview_storage_key IS NOT NULL), 0) AS preview_bytes,
        COUNT(*) FILTER (WHERE preview_storage_key IS NOT NULL) AS preview_count FROM assets GROUP BY owner_id) asset ON asset.owner_id = a.id
      LEFT JOIN (SELECT owner_id, SUM(size_bytes + COALESCE(thumbnail_size_bytes, 0)) AS artwork_bytes, COUNT(*) AS artwork_count FROM catalog_artwork GROUP BY owner_id) artwork ON artwork.owner_id = a.id
      ORDER BY COALESCE(u.used_bytes, 0) DESC, a.id`)
    return r.rows.map(row => { const usedBytes = Number(row.used_bytes); const previewBytes = Number(row.preview_bytes); return { ownerId: row.owner_id, usedBytes, originalCount: Number(row.original_count), artworkBytes: Number(row.artwork_bytes), artworkCount: Number(row.artwork_count), previewBytes, previewCount: Number(row.preview_count), storedBytes: usedBytes + previewBytes } })
  }
  async findCatalogArtwork(assetId: string, ownerId?: string): Promise<ArtworkRecord | undefined> {
    const result = await this.db.query<{ asset_id: string; owner_id: string; storage_key: string; mime_type: ArtworkRecord['mimeType']; size_bytes: string | number; thumbnail_storage_key: string | null; thumbnail_size_bytes: string | number | null; width: number; height: number; updated_at: string }>('SELECT asset_id, owner_id, storage_key, mime_type, size_bytes, thumbnail_storage_key, thumbnail_size_bytes, width, height, updated_at FROM catalog_artwork WHERE asset_id = $1 AND ($2::text IS NULL OR owner_id = $2)', [assetId, ownerId ?? null])
    const row = result.rows[0]
    return row ? { assetId: row.asset_id, ownerId: row.owner_id, storageKey: row.storage_key, mimeType: row.mime_type, extension: row.mime_type === 'image/png' ? 'png' : 'jpg', sizeBytes: Number(row.size_bytes), ...(row.thumbnail_storage_key && row.thumbnail_size_bytes ? { thumbnailStorageKey: row.thumbnail_storage_key, thumbnailSizeBytes: Number(row.thumbnail_size_bytes) } : {}), width: row.width, height: row.height, updatedAt: row.updated_at } : undefined
  }
  async listCatalogArtwork(): Promise<ArtworkRecord[]> {
    const result = await this.db.query<{ asset_id: string; owner_id: string; storage_key: string; mime_type: ArtworkRecord['mimeType']; size_bytes: string | number; thumbnail_storage_key: string | null; thumbnail_size_bytes: string | number | null; width: number; height: number; updated_at: string }>('SELECT asset_id, owner_id, storage_key, mime_type, size_bytes, thumbnail_storage_key, thumbnail_size_bytes, width, height, updated_at FROM catalog_artwork')
    return result.rows.map(row => ({ assetId: row.asset_id, ownerId: row.owner_id, storageKey: row.storage_key, mimeType: row.mime_type, extension: row.mime_type === 'image/png' ? 'png' : 'jpg', sizeBytes: Number(row.size_bytes), ...(row.thumbnail_storage_key && row.thumbnail_size_bytes ? { thumbnailStorageKey: row.thumbnail_storage_key, thumbnailSizeBytes: Number(row.thumbnail_size_bytes) } : {}), width: row.width, height: row.height, updatedAt: row.updated_at }))
  }
  async saveCatalogArtwork(record: ArtworkRecord, limitBytes?: number): Promise<ArtworkRecord> {
    const result = await this.db.query<{ asset_id: string; owner_id: string; storage_key: string; mime_type: ArtworkRecord['mimeType']; size_bytes: string | number; thumbnail_storage_key: string | null; thumbnail_size_bytes: string | number | null; width: number; height: number; updated_at: string }>(`WITH target AS (
      SELECT a.owner_id, (COALESCE(old.size_bytes, 0) + COALESCE(old.thumbnail_size_bytes, 0))::bigint AS old_size
      FROM assets a
      LEFT JOIN catalog_artwork old ON old.asset_id = a.id
      WHERE a.id = $1 AND a.owner_id = $2 AND a.state = 'available'
      FOR UPDATE OF a
    ), delta AS (SELECT owner_id, ($5::bigint + $9::bigint) - old_size AS bytes_delta FROM target), quota AS (
      INSERT INTO account_storage_usage (owner_id, used_bytes)
      SELECT owner_id, GREATEST(bytes_delta, 0) FROM delta WHERE $10::bigint IS NULL OR GREATEST(bytes_delta, 0) <= $10
      ON CONFLICT (owner_id) DO UPDATE SET used_bytes = GREATEST(0, account_storage_usage.used_bytes + (SELECT bytes_delta FROM delta WHERE delta.owner_id = EXCLUDED.owner_id)), updated_at = NOW()
      WHERE $10::bigint IS NULL OR account_storage_usage.used_bytes + (SELECT bytes_delta FROM delta WHERE delta.owner_id = account_storage_usage.owner_id) <= $10
      RETURNING owner_id
    )
    INSERT INTO catalog_artwork (asset_id, owner_id, storage_key, mime_type, size_bytes, width, height, thumbnail_storage_key, thumbnail_size_bytes, updated_at)
    SELECT $1, target.owner_id, $3, $4, $5, $6, $7, $8, NULLIF($9, 0), NOW() FROM target JOIN quota USING (owner_id)
    ON CONFLICT (asset_id) DO UPDATE SET storage_key = EXCLUDED.storage_key, mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes, width = EXCLUDED.width, height = EXCLUDED.height, thumbnail_storage_key = EXCLUDED.thumbnail_storage_key, thumbnail_size_bytes = EXCLUDED.thumbnail_size_bytes, updated_at = NOW()
    WHERE catalog_artwork.owner_id = EXCLUDED.owner_id
    RETURNING asset_id, owner_id, storage_key, mime_type, size_bytes, thumbnail_storage_key, thumbnail_size_bytes, width, height, updated_at`, [record.assetId, record.ownerId, record.storageKey, record.mimeType, record.sizeBytes, record.width, record.height, record.thumbnailStorageKey ?? null, record.thumbnailSizeBytes ?? 0, limitBytes ?? null])
    const row = result.rows[0]
    if (!row) throw new StorageQuotaExceededError(await this.getStorageUsage(record.ownerId), limitBytes ?? 0, record.sizeBytes)
    return { assetId: row.asset_id, ownerId: row.owner_id, storageKey: row.storage_key, mimeType: row.mime_type, extension: row.mime_type === 'image/png' ? 'png' : 'jpg', sizeBytes: Number(row.size_bytes), ...(row.thumbnail_storage_key && row.thumbnail_size_bytes ? { thumbnailStorageKey: row.thumbnail_storage_key, thumbnailSizeBytes: Number(row.thumbnail_size_bytes) } : {}), width: row.width, height: row.height, updatedAt: row.updated_at }
  }
  async getStorageQuota(ownerId: string) { const r = await this.db.query<{ limit_bytes: string | number }>('SELECT limit_bytes FROM account_storage_quotas WHERE owner_id = $1', [ownerId]); return r.rows[0] ? Number(r.rows[0].limit_bytes) : undefined }
  async listStorageQuotas(): Promise<StorageQuotaRecord[]> { const r = await this.db.query<{ owner_id: string; limit_bytes: string | number; updated_by: string; updated_at: string }>('SELECT owner_id, limit_bytes, updated_by, updated_at FROM account_storage_quotas'); return r.rows.map(row => ({ ownerId: row.owner_id, limitBytes: Number(row.limit_bytes), updatedBy: row.updated_by, updatedAt: row.updated_at })) }
  async setStorageQuota(ownerId: string, limitBytes: number | null, updatedBy: string) {
    if (limitBytes !== null && (!Number.isSafeInteger(limitBytes) || limitBytes < 1)) throw new Error('INVALID_STORAGE_QUOTA')
    if (limitBytes === null) { await this.db.query('DELETE FROM account_storage_quotas WHERE owner_id = $1', [ownerId]); return }
    await this.db.query(`INSERT INTO account_storage_quotas (owner_id, limit_bytes, updated_by) VALUES ($1,$2,$3) ON CONFLICT (owner_id) DO UPDATE SET limit_bytes = EXCLUDED.limit_bytes, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, [ownerId, limitBytes, updatedBy])
  }
  async listPromotions(): Promise<PromotionRule[]> {
    const result = await this.db.query<{ id: string; name: string; scope: PromotionRule['scope']; percent_off: number; starts_at: string | null; ends_at: string | null; enabled: boolean; created_at: string; updated_at: string; updated_by: string }>('SELECT id, name, scope, percent_off, starts_at, ends_at, enabled, created_at, updated_at, updated_by FROM marketplace_promotions ORDER BY updated_at DESC')
    return result.rows.map(row => ({ id: row.id, name: row.name, scope: row.scope, percentOff: Number(row.percent_off), ...(row.starts_at ? { startsAt: row.starts_at } : {}), ...(row.ends_at ? { endsAt: row.ends_at } : {}), enabled: row.enabled, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by }))
  }
  async savePromotion(input: PromotionRule): Promise<PromotionRule> {
    const result = await this.db.query<{ id: string; name: string; scope: PromotionRule['scope']; percent_off: number; starts_at: string | null; ends_at: string | null; enabled: boolean; created_at: string; updated_at: string; updated_by: string }>(`INSERT INTO marketplace_promotions (id, name, scope, percent_off, starts_at, ends_at, enabled, created_at, updated_at, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope, percent_off = EXCLUDED.percent_off, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, enabled = EXCLUDED.enabled, updated_at = NOW(), updated_by = EXCLUDED.updated_by
      RETURNING id, name, scope, percent_off, starts_at, ends_at, enabled, created_at, updated_at, updated_by`, [input.id,input.name,input.scope,input.percentOff,input.startsAt ?? null,input.endsAt ?? null,input.enabled,input.createdAt,input.updatedBy])
    const row = result.rows[0]
    return { id: row.id, name: row.name, scope: row.scope, percentOff: Number(row.percent_off), ...(row.starts_at ? { startsAt: row.starts_at } : {}), ...(row.ends_at ? { endsAt: row.ends_at } : {}), enabled: row.enabled, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by }
  }
  async deletePromotion(id: string): Promise<boolean> { const result = await this.db.query('DELETE FROM marketplace_promotions WHERE id = $1 RETURNING id', [id]); return result.rows.length > 0 }
  async listBeatListingDrafts(ownerId: string): Promise<BeatListingRecord[]> {
    const result = await this.db.query<{ data: BeatListingRecord }>('SELECT data FROM marketplace_beat_listing_drafts WHERE owner_id = $1 ORDER BY updated_at DESC', [ownerId])
    return result.rows.map(row => row.data)
  }
  async listAllBeatListingDrafts(): Promise<BeatListingRecord[]> {
    const result = await this.db.query<{ data: BeatListingRecord }>('SELECT data FROM marketplace_beat_listing_drafts ORDER BY updated_at DESC')
    return result.rows.map(row => row.data)
  }
  async findBeatListingDraft(contentId: string, ownerId: string): Promise<BeatListingRecord | undefined> {
    const result = await this.db.query<{ data: BeatListingRecord }>('SELECT data FROM marketplace_beat_listing_drafts WHERE content_id = $1 AND owner_id = $2', [contentId, ownerId])
    return result.rows[0]?.data
  }
  async saveBeatListingDraft(record: BeatListingRecord): Promise<BeatListingRecord> {
    return this.withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('marketplace-review'))", [record.contentId])
    const result = await client.query<{ data: BeatListingRecord }>(`INSERT INTO marketplace_beat_listing_drafts (content_id, owner_id, data, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, NOW()) ON CONFLICT (content_id) DO UPDATE SET data = EXCLUDED.data || CASE WHEN marketplace_beat_listing_drafts.data ? 'reviewEvidenceRevision' THEN jsonb_build_object('reviewEvidenceRevision', marketplace_beat_listing_drafts.data->'reviewEvidenceRevision') ELSE '{}'::jsonb END, updated_at = NOW()
      WHERE marketplace_beat_listing_drafts.owner_id = EXCLUDED.owner_id RETURNING data`, [record.contentId, record.ownerId, JSON.stringify(record), record.createdAt])
    if (!result.rows[0]) throw new Error('LISTING_NOT_FOUND')
    return result.rows[0].data
    })
  }
  async listSellerEvidence(contentId: string, ownerId?: string): Promise<SellerEvidenceRecord[]> {
    const result = ownerId === undefined
      ? await this.db.query<{ data: SellerEvidenceRecord }>('SELECT data FROM marketplace_beat_listing_evidence WHERE content_id = $1 ORDER BY created_at', [contentId])
      : await this.db.query<{ data: SellerEvidenceRecord }>('SELECT data FROM marketplace_beat_listing_evidence WHERE content_id = $1 AND owner_id = $2 ORDER BY created_at', [contentId, ownerId])
    return result.rows.map(row => row.data)
  }
  async findSellerEvidence(id: string): Promise<SellerEvidenceRecord | undefined> {
    const result = await this.db.query<{ data: SellerEvidenceRecord }>('SELECT data FROM marketplace_beat_listing_evidence WHERE id = $1', [id])
    return result.rows[0]?.data
  }
  async saveSellerEvidence(record: SellerEvidenceRecord): Promise<SellerEvidenceRecord> {
    return this.withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('marketplace-review'))", [record.contentId])
    const result = await client.query<{ data: SellerEvidenceRecord }>(`INSERT INTO marketplace_beat_listing_evidence (id, content_id, owner_id, data, created_at)
      SELECT $1, $2, $3, $4::jsonb, $5 WHERE (SELECT count(*) FROM marketplace_beat_listing_evidence WHERE content_id = $2 AND owner_id = $3) < $6
      RETURNING data`, [record.id, record.contentId, record.ownerId, JSON.stringify(record), record.createdAt, sellerEvidenceMaxFiles])
    if (!result.rows[0]) throw new Error('EVIDENCE_LIMIT')
    await client.query("UPDATE marketplace_beat_listing_drafts SET data=jsonb_set(data,'{reviewEvidenceRevision}',to_jsonb($3::text)),updated_at=now() WHERE content_id=$1 AND owner_id=$2", [record.contentId, record.ownerId, randomUUID()])
    return result.rows[0].data
    })
  }
  async deleteSellerEvidence(id: string, ownerId: string): Promise<boolean> {
    return this.withTransaction(async client => {
      const existing = await client.query<{ content_id: string }>('SELECT content_id FROM marketplace_beat_listing_evidence WHERE id=$1 AND owner_id=$2', [id, ownerId])
      if (!existing.rows.length) return false
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('marketplace-review'))", [existing.rows[0].content_id])
      const result = await client.query('DELETE FROM marketplace_beat_listing_evidence WHERE id = $1 AND owner_id = $2 RETURNING id', [id, ownerId])
      if (result.rows.length) await client.query("UPDATE marketplace_beat_listing_drafts SET data=jsonb_set(data,'{reviewEvidenceRevision}',to_jsonb($3::text)),updated_at=now() WHERE content_id=$1 AND owner_id=$2", [existing.rows[0].content_id, ownerId, randomUUID()])
      return result.rows.length > 0
    })
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
    await this.withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext('purchase-source'))", [ownerId])
      const retained = await client.query("SELECT id FROM beat_orders WHERE seller_id=$1 AND data->'fulfillment'->>'assetId'=$2 AND status NOT IN ('failed','refunded') LIMIT 1", [ownerId, id])
      if (retained.rows.length) throw new Error('PURCHASE_SOURCE_RETAINED')
      await client.query(`WITH removed_artwork AS (DELETE FROM catalog_artwork WHERE asset_id = $1 AND owner_id = $2 RETURNING owner_id, size_bytes, thumbnail_size_bytes),
      removed AS (DELETE FROM assets WHERE id = $1 AND owner_id = $2 AND (SELECT COUNT(*) FROM removed_artwork) >= 0 RETURNING owner_id, size_bytes, state),
      delta AS (SELECT removed.owner_id, (CASE WHEN removed.state = 'available' THEN removed.size_bytes ELSE 0 END) + COALESCE((SELECT SUM(size_bytes + COALESCE(thumbnail_size_bytes, 0)) FROM removed_artwork), 0) AS bytes_removed FROM removed)
      UPDATE account_storage_usage usage SET used_bytes = GREATEST(0, usage.used_bytes - delta.bytes_removed), updated_at = NOW()
      FROM delta WHERE usage.owner_id = delta.owner_id`, [id, ownerId])
    })
  }
}
const asset = (row: AssetRow): AssetRecord => ({ id: row.id, ownerId: row.owner_id, originalName: row.original_name, storageKey: row.storage_key, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), contentHash: row.content_hash, state: row.state, createdAt: row.created_at, updatedAt: row.updated_at, ...(row.preview_storage_key && row.preview_mime_type && row.preview_size_bytes ? { previewStorageKey: row.preview_storage_key, previewMimeType: row.preview_mime_type, previewSizeBytes: Number(row.preview_size_bytes) } : {}) })
const account = (row: AccountRow): Account => ({ id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, verificationState: row.verification_state || 'unverified', planId: row.plan_id || 'free', purchasedPlanIds: row.purchased_plan_ids || [], verificationTokenHash: row.verification_token_hash, verificationTokenExpiresAt: row.verification_token_expires_at ? Date.parse(row.verification_token_expires_at) : undefined, resetTokenHash: row.reset_token_hash, resetTokenExpiresAt: row.reset_token_expires_at ? Date.parse(row.reset_token_expires_at) : undefined })
