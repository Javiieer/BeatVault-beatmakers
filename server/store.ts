import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ArtworkRecord } from './artwork'
import type { ProjectRecord } from '../src/domains/core/contracts'
import { validateCatalogEntry, validateProjectRecord } from './validation'
import { config } from './config'
import type { Account } from './auth'
import { isPlanId } from './plans'
import { isCreatorProfile, type CreatorProfile } from '../src/domains/profile'
import { isDirectMessage, type ChatConversation, type DirectMessage } from '../src/domains/chat'
import type { SocialActivity, SocialComment } from '../src/domains/social'
import { isPromotionRule, type PromotionRule } from '../src/domains/marketplace/promotions'
import { isBeatListingRecord, type BeatListingRecord } from '../src/domains/marketplace/sellerListings'
import { isSellerEvidenceRecord, sellerEvidenceMaxFiles, type SellerEvidenceRecord } from '../src/domains/marketplace/sellerEvidence'
import { isSocialPost, isSocialPostComment, isSocialPostReport, type SocialPost, type SocialPostComment, type SocialPostCursor, type SocialPostReport, type SocialPostVisibility } from './social-posts'
import { compareNotificationOrder, isNotificationRecord, isValidNotificationTimestamp, normalizeNotificationCursor, normalizeNotificationRecord, notificationLimit, type NotificationPage, type NotificationPageOptions, type NotificationRecord, type NotificationSeed } from './notifications'
export type AssetState = 'available' | 'missing' | 'metadata-only'
export type AssetRecord = { id: string; ownerId: string; originalName: string; storageKey: string; mimeType: string; sizeBytes: number; contentHash: string; state: AssetState; createdAt: string; updatedAt: string; previewStorageKey?: string; previewMimeType?: string; previewSizeBytes?: number }
export type StorageUsageRecord = { ownerId: string; usedBytes: number; originalCount: number; artworkBytes: number; artworkCount: number; previewBytes: number; previewCount: number; storedBytes: number }
export type StorageQuotaRecord = { ownerId: string; limitBytes: number; updatedBy: string; updatedAt: string }
export type StripeConnectRecord = { accountId: string; stripeAccountId: string; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; deauthorized: boolean; updatedAt: string }
export type SessionRecord = { tokenHash: string; accountId: string; csrfTokenHash: string; expiresAt: number }
export type BeatOrder = { id: string; buyerId: string; sellerId: string; contentId: string; offerId: string; title: string; amountMinor: number; commissionMinor: number; processingEstimateMinor: number; applicationFeeMinor: number; sellerNetMinor: number; currency: 'usd'; status: 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded' | 'partially_refunded' | 'disputed'; stripeCheckoutSessionId?: string; stripePaymentIntentId?: string; stripeRefundId?: string; refundRequestedAt?: string; refundRequestedBy?: string; disputeId?: string; disputeReason?: string; createdAt: string; paidAt?: string }
export class StorageQuotaExceededError extends Error {
  constructor(readonly usedBytes: number, readonly limitBytes: number, readonly requestedBytes: number) { super('STORAGE_QUOTA_EXCEEDED'); this.name = 'StorageQuotaExceededError' }
}
export type Friendship = { id: string; requesterId: string; recipientId: string; status: 'pending' | 'accepted'; createdAt: string; updatedAt: string }
type SocialPostReactionRecord = { postId: string; actorId: string; createdAt: string }
const isSocialPostReactionRecord = (value: unknown): value is SocialPostReactionRecord => {
  if (!value || typeof value !== 'object') return false
  const reaction = value as Partial<SocialPostReactionRecord>
  return typeof reaction.postId === 'string' && /^[a-f0-9-]{36}$/i.test(reaction.postId) && typeof reaction.actorId === 'string' && reaction.actorId.length > 0 && typeof reaction.createdAt === 'string'
}
type SocialFollowRecord = { followerId: string; followingId: string; createdAt: string }
type SocialPostBookmarkRecord = { accountId: string; postId: string; createdAt: string }
export type SocialAccountState = { followedAccountIds: string[]; bookmarkedPostIds: string[] }
const isSocialFollowRecord = (value: unknown): value is SocialFollowRecord => {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SocialFollowRecord>
  return typeof record.followerId === 'string' && record.followerId.length > 0 && record.followerId.length <= 80 &&
    typeof record.followingId === 'string' && record.followingId.length > 0 && record.followingId.length <= 80 &&
    record.followerId !== record.followingId && typeof record.createdAt === 'string'
}
const isSocialPostBookmarkRecord = (value: unknown): value is SocialPostBookmarkRecord => {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SocialPostBookmarkRecord>
  return typeof record.accountId === 'string' && record.accountId.length > 0 && record.accountId.length <= 80 &&
    typeof record.postId === 'string' && /^[a-f0-9-]{36}$/i.test(record.postId) && typeof record.createdAt === 'string'
}
type NotificationOutboxAction = 'social_post_comment' | 'social_post_reaction' | 'friend_request' | 'friend_request_accepted'
type NotificationOutboxRecord = { action: NotificationOutboxAction; notification: NotificationRecord }
const isNotificationOutboxRecord = (value: unknown): value is NotificationOutboxRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<NotificationOutboxRecord>
  return ['social_post_comment', 'social_post_reaction', 'friend_request', 'friend_request_accepted'].includes(item.action as string)
    && isNotificationRecord(item.notification)
    && item.action === item.notification.type
}
export type NotificationMutation<T> = { value: T; notifications: NotificationRecord[] }
const notificationRecordFor = (seed: NotificationSeed, recipientId: string, actorId: string, type: NotificationRecord['type'], resourceType: NotificationRecord['resourceType'], resourceId: string, sourceId: string): NotificationRecord => normalizeNotificationRecord({
  ...seed, recipientId, actorId, type, resourceType, resourceId, sourceId, eventKey: `${type}:${sourceId}`, readAt: null,
})
const localStorageQueues = new Map<string, Promise<void>>()
async function withLocalStorageLock<T>(ownerId: string, action: () => Promise<T>): Promise<T> {
  const previous = localStorageQueues.get(ownerId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  const tail = previous.catch(() => undefined).then(() => current)
  localStorageQueues.set(ownerId, tail)
  await previous.catch(() => undefined)
  try { return await action() }
  finally { release(); if (localStorageQueues.get(ownerId) === tail) localStorageQueues.delete(ownerId) }
}
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
  createNotification(notification: NotificationRecord): Promise<NotificationRecord>
  createSocialPostCommentWithNotification(comment: SocialPostComment, notification?: NotificationSeed): Promise<NotificationMutation<SocialPostComment>>
  toggleSocialPostReactionWithNotification(postId: string, actorId: string, notification?: NotificationSeed): Promise<NotificationMutation<boolean>>
  createFriendshipWithNotification(friendship: Friendship, notification?: NotificationSeed): Promise<NotificationMutation<Friendship>>
  acceptFriendshipWithNotification(id: string, actorId: string, notification?: NotificationSeed): Promise<NotificationMutation<Friendship | undefined>>
  drainNotificationOutbox(): Promise<NotificationRecord[]>
  listNotifications(recipientId: string, options: NotificationPageOptions): Promise<NotificationPage>
  markNotificationRead(id: string, recipientId: string, readAt: string): Promise<NotificationRecord | undefined>
  listChatConversations(accountId: string): Promise<ChatConversation[]>
  listChatMessages(accountId: string, peerId: string, limit: number): Promise<DirectMessage[]>
  createChatMessage(message: DirectMessage): Promise<DirectMessage>
  markChatMessagesRead(accountId: string, peerId: string, readAt: string): Promise<number>
  listSocialComments(contentId: string): Promise<SocialComment[]>
  createSocialComment(comment: SocialComment): Promise<SocialComment>
  listSocialReactions(contentId: string): Promise<string[]>
  toggleSocialReaction(contentId: string, actorId: string): Promise<boolean>
  recordSocialActivity(activity: SocialActivity): Promise<void>
  listSocialActivity(recipientId: string): Promise<SocialActivity[]>
  createSocialPost(post: SocialPost, mediaLimitBytes: number): Promise<SocialPost>
  findSocialPost(id: string): Promise<SocialPost | undefined>
  listSocialPosts(options: { authorId?: string; cursor?: SocialPostCursor; limit: number; moderationOnly?: boolean; publishedOnly?: boolean }): Promise<SocialPost[]>
  getSocialAccountState(accountId: string): Promise<SocialAccountState>
  followSocialAccount(followerId: string, followingId: string, maxFollows: number): Promise<void>
  unfollowSocialAccount(followerId: string, followingId: string): Promise<void>
  bookmarkSocialPost(accountId: string, postId: string, maxBookmarks: number): Promise<void>
  unbookmarkSocialPost(accountId: string, postId: string): Promise<void>
  deleteSocialPost(id: string, authorId: string): Promise<SocialPost | undefined>
  reviewSocialPost(id: string, status: Extract<SocialPostVisibility, 'published' | 'rejected' | 'removed'>, staffId: string, note?: string): Promise<SocialPost | undefined>
  listSocialPostComments(postId: string, limit?: number): Promise<SocialPostComment[]>
  createSocialPostComment(comment: SocialPostComment): Promise<SocialPostComment>
  listSocialPostReactions(postId: string): Promise<string[]>
  getSocialPostReactionSummary(postId: string, actorId: string): Promise<{ reactionCount: number; reactedByMe: boolean }>
  toggleSocialPostReaction(postId: string, actorId: string): Promise<boolean>
  createSocialPostReport(report: SocialPostReport): Promise<SocialPostReport>
  deleteSocialPostReport(id: string, reporterId: string): Promise<boolean>
  listSocialPostReports(status?: SocialPostReport['status']): Promise<SocialPostReport[]>
  reviewSocialPostReport(id: string, status: Extract<SocialPostReport['status'], 'reviewed' | 'dismissed'>, staffId: string): Promise<SocialPostReport | undefined>
  findAccountByEmail(email: string): Promise<Account | undefined>
  findAccountById(id: string): Promise<Account | undefined>
  listAccounts(): Promise<Account[]>
  findAccountByToken(kind: 'verify' | 'reset', hash: string): Promise<Account | undefined>
  saveAccount(account: Account): Promise<void>
  createSession(session: SessionRecord): Promise<void>
  findSession(tokenHash: string): Promise<SessionRecord | undefined>
  deleteSession(tokenHash: string): Promise<void>
  deleteExpiredSessions(now: number): Promise<void>
  deleteAccountSessions(accountId: string, exceptTokenHash?: string): Promise<void>
  clearSessions(): Promise<void>
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
  getStorageUsage(ownerId: string): Promise<number>
  listStorageUsage(): Promise<StorageUsageRecord[]>
  getStorageQuota(ownerId: string): Promise<number | undefined>
  listStorageQuotas(): Promise<StorageQuotaRecord[]>
  setStorageQuota(ownerId: string, limitBytes: number | null, updatedBy: string): Promise<void>
  createAsset(asset: AssetRecord, limitBytes?: number): Promise<AssetRecord>
  updateAssetState(id: string, state: AssetState): Promise<void>
  updateAssetPreview(id: string, preview: Pick<AssetRecord, 'previewStorageKey' | 'previewMimeType' | 'previewSizeBytes'>): Promise<void>
  deleteAsset(id: string, ownerId: string): Promise<void>
  findCatalogArtwork(assetId: string, ownerId?: string): Promise<ArtworkRecord | undefined>
  listCatalogArtwork(): Promise<ArtworkRecord[]>
  saveCatalogArtwork(record: ArtworkRecord, limitBytes?: number): Promise<ArtworkRecord>
  listPromotions(): Promise<PromotionRule[]>
  savePromotion(promotion: PromotionRule): Promise<PromotionRule>
  deletePromotion(id: string): Promise<boolean>
  listBeatListingDrafts(ownerId: string): Promise<BeatListingRecord[]>
  listAllBeatListingDrafts(): Promise<BeatListingRecord[]>
  findBeatListingDraft(contentId: string, ownerId: string): Promise<BeatListingRecord | undefined>
  saveBeatListingDraft(record: BeatListingRecord): Promise<BeatListingRecord>
  listSellerEvidence(contentId: string, ownerId?: string): Promise<SellerEvidenceRecord[]>
  findSellerEvidence(id: string): Promise<SellerEvidenceRecord | undefined>
  saveSellerEvidence(record: SellerEvidenceRecord): Promise<SellerEvidenceRecord>
  deleteSellerEvidence(id: string, ownerId: string): Promise<boolean>
  findStripeConnectAccount(accountId: string): Promise<StripeConnectRecord | undefined>
  findStripeConnectAccountByStripeId(stripeAccountId: string): Promise<StripeConnectRecord | undefined>
  saveStripeConnectAccount(record: StripeConnectRecord): Promise<void>
  hasProcessedStripeEvent(eventId: string): Promise<boolean>
  recordProcessedStripeEvent(eventId: string, eventType: string): Promise<boolean>
  createBeatOrder(order: BeatOrder): Promise<BeatOrder>
  findBeatOrder(id: string): Promise<BeatOrder | undefined>
  listBeatOrders(buyerId: string): Promise<BeatOrder[]>
  listAllBeatOrders(): Promise<BeatOrder[]>
  updateBeatOrder(id: string, patch: Partial<Pick<BeatOrder, 'status' | 'stripeCheckoutSessionId' | 'stripePaymentIntentId' | 'stripeRefundId' | 'refundRequestedAt' | 'refundRequestedBy' | 'disputeId' | 'disputeReason' | 'paidAt'>>): Promise<BeatOrder | undefined>
  findBeatOrderByCheckoutSessionId(sessionId: string): Promise<BeatOrder | undefined>
  findBeatOrderByPaymentIntentId(paymentIntentId: string): Promise<BeatOrder | undefined>
}

export class LocalRepository implements ServerRepository {
  private readonly profiles = new JsonStore(`${config.dataDirectory}/profiles.json`)
  private readonly friendships = new JsonStore(`${config.dataDirectory}/friendships.json`)
  private readonly messages = new JsonStore(`${config.dataDirectory}/messages.json`)
  private readonly socialComments = new JsonStore(`${config.dataDirectory}/social-comments.json`)
  private readonly socialReactions = new JsonStore(`${config.dataDirectory}/social-reactions.json`)
  private readonly socialActivities = new JsonStore(`${config.dataDirectory}/social-activities.json`)
  private readonly socialPosts = new JsonStore(`${config.dataDirectory}/social-posts.json`)
  private readonly notifications: JsonStore
  private readonly notificationOutbox = new JsonStore(`${config.dataDirectory}/notification-outbox.json`)
  private readonly socialPostReports = new JsonStore(`${config.dataDirectory}/social-post-reports.json`)
  private readonly socialPostComments = new JsonStore(`${config.dataDirectory}/social-post-comments.json`)
  private readonly socialPostReactions = new JsonStore(`${config.dataDirectory}/social-post-reactions.json`)
  private readonly socialFollows = new JsonStore(`${config.dataDirectory}/social-follows.json`)
  private readonly socialPostBookmarks = new JsonStore(`${config.dataDirectory}/social-post-bookmarks.json`)
  private readonly storageQuotas = new JsonStore(`${config.dataDirectory}/storage-quotas.json`)
  private readonly promotions = new JsonStore(`${config.dataDirectory}/promotions.json`)
  private readonly beatListingDrafts = new JsonStore(`${config.dataDirectory}/beat-listing-drafts.json`)
  private readonly sellerEvidence = new JsonStore(`${config.dataDirectory}/seller-evidence.json`)
  private readonly stripeConnectAccounts = new JsonStore(`${config.dataDirectory}/stripe-connect-accounts.json`)
  private readonly stripeEvents = new JsonStore(`${config.dataDirectory}/stripe-events.json`)
  private readonly beatOrders = new JsonStore(`${config.dataDirectory}/beat-orders.json`)
  private readonly sessions = new JsonStore(`${config.dataDirectory}/auth-sessions.json`)
  constructor(
    private readonly projects = new JsonStore(`${config.dataDirectory}/projects.json`),
    private readonly catalog = new JsonStore(`${config.dataDirectory}/catalog.json`),
    private readonly accounts = new JsonStore(`${config.dataDirectory}/accounts.json`),
    private readonly assets = new JsonStore(`${config.dataDirectory}/assets.json`),
    private readonly artwork = new JsonStore(`${config.dataDirectory}/catalog-artwork.json`),
    notifications = new JsonStore(`${config.dataDirectory}/notifications.json`),
  ) { this.notifications = notifications }
  listPromotions() { return this.promotions.read<PromotionRule[]>([], isPromotionRule).then(items => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) }
  savePromotion(promotion: PromotionRule) {
    return this.promotions.update<PromotionRule[], PromotionRule>([], isPromotionRule, items => ({ value: [...items.filter(item => item.id !== promotion.id), promotion], result: promotion }))
  }
  deletePromotion(id: string) {
    return this.promotions.update<PromotionRule[], boolean>([], isPromotionRule, items => {
      const next = items.filter(item => item.id !== id)
      return { value: next, result: next.length !== items.length }
    })
  }
  listBeatListingDrafts(ownerId: string) { return this.beatListingDrafts.read<BeatListingRecord[]>([], isBeatListingRecord).then(items => items.filter(item => item.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) }
  listAllBeatListingDrafts() { return this.beatListingDrafts.read<BeatListingRecord[]>([], isBeatListingRecord).then(items => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) }
  findBeatListingDraft(contentId: string, ownerId: string) { return this.beatListingDrafts.read<BeatListingRecord[]>([], isBeatListingRecord).then(items => items.find(item => item.contentId === contentId && item.ownerId === ownerId)) }
  saveBeatListingDraft(record: BeatListingRecord) {
    return this.beatListingDrafts.update<BeatListingRecord[], BeatListingRecord>([], isBeatListingRecord, items => {
      const existing = items.find(item => item.contentId === record.contentId)
      if (existing && existing.ownerId !== record.ownerId) throw new Error('LISTING_NOT_FOUND')
      const saved = existing ? { ...record, createdAt: existing.createdAt } : record
      return { value: [...items.filter(item => item.contentId !== record.contentId), saved], result: saved }
    })
  }
  listSellerEvidence(contentId: string, ownerId?: string) { return this.sellerEvidence.read<SellerEvidenceRecord[]>([], isSellerEvidenceRecord).then(items => items.filter(item => item.contentId === contentId && (ownerId === undefined || item.ownerId === ownerId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) }
  findSellerEvidence(id: string) { return this.sellerEvidence.read<SellerEvidenceRecord[]>([], isSellerEvidenceRecord).then(items => items.find(item => item.id === id)) }
  saveSellerEvidence(record: SellerEvidenceRecord) { return this.sellerEvidence.update<SellerEvidenceRecord[], SellerEvidenceRecord>([], isSellerEvidenceRecord, items => {
    if (items.some(item => item.id === record.id)) throw new Error('EVIDENCE_EXISTS')
    if (items.filter(item => item.contentId === record.contentId && item.ownerId === record.ownerId).length >= sellerEvidenceMaxFiles) throw new Error('EVIDENCE_LIMIT')
    return { value: [...items, record], result: record }
  }) }
  deleteSellerEvidence(id: string, ownerId: string) { return this.sellerEvidence.update<SellerEvidenceRecord[], boolean>([], isSellerEvidenceRecord, items => {
    const next = items.filter(item => item.id !== id || item.ownerId !== ownerId)
    return { value: next, result: next.length !== items.length }
  }) }
  findStripeConnectAccount(accountId: string) { return this.stripeConnectAccounts.read<StripeConnectRecord[]>([], isStripeConnectRecord).then(items => items.find(item => item.accountId === accountId)) }
  findStripeConnectAccountByStripeId(stripeAccountId: string) { return this.stripeConnectAccounts.read<StripeConnectRecord[]>([], isStripeConnectRecord).then(items => items.find(item => item.stripeAccountId === stripeAccountId)) }
  async saveStripeConnectAccount(record: StripeConnectRecord) { await this.stripeConnectAccounts.update<StripeConnectRecord[], void>([], isStripeConnectRecord, items => ({ value: [...items.filter(item => item.accountId !== record.accountId && item.stripeAccountId !== record.stripeAccountId), record], result: undefined })) }
  hasProcessedStripeEvent(eventId: string) { return this.stripeEvents.read<Array<{ eventId: string; eventType: string; createdAt: string }>>([], isStripeEvent).then(events => events.some(event => event.eventId === eventId)) }
  recordProcessedStripeEvent(eventId: string, eventType: string) { return this.stripeEvents.update<Array<{ eventId: string; eventType: string; createdAt: string }>, boolean>([], isStripeEvent, events => events.some(event => event.eventId === eventId) ? { value: events, result: false } : { value: [...events, { eventId, eventType, createdAt: new Date().toISOString() }], result: true }) }
  createBeatOrder(order: BeatOrder) { return this.beatOrders.update<BeatOrder[], BeatOrder>([], isBeatOrder, orders => {
    const existing = orders.find(item => item.id === order.id)
    if (existing) return { value: orders, result: existing }
    return { value: [...orders, order], result: order }
  }) }
  findBeatOrder(id: string) { return this.beatOrders.read<BeatOrder[]>([], isBeatOrder).then(orders => orders.find(order => order.id === id)) }
  listBeatOrders(buyerId: string) { return this.beatOrders.read<BeatOrder[]>([], isBeatOrder).then(orders => orders.filter(order => order.buyerId === buyerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) }
  listAllBeatOrders() { return this.beatOrders.read<BeatOrder[]>([], isBeatOrder).then(orders => orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) }
  findBeatOrderByCheckoutSessionId(sessionId: string) { return this.beatOrders.read<BeatOrder[]>([], isBeatOrder).then(orders => orders.find(order => order.stripeCheckoutSessionId === sessionId)) }
  findBeatOrderByPaymentIntentId(paymentIntentId: string) { return this.beatOrders.read<BeatOrder[]>([], isBeatOrder).then(orders => orders.find(order => order.stripePaymentIntentId === paymentIntentId)) }
  updateBeatOrder(id: string, patch: Partial<Pick<BeatOrder, 'status' | 'stripeCheckoutSessionId' | 'stripePaymentIntentId' | 'stripeRefundId' | 'refundRequestedAt' | 'refundRequestedBy' | 'disputeId' | 'disputeReason' | 'paidAt'>>) {
    return this.beatOrders.update<BeatOrder[], BeatOrder | undefined>([], isBeatOrder, orders => {
      const existing = orders.find(order => order.id === id)
      if (!existing) return { value: orders, result: undefined }
      const updated = { ...existing, ...patch }
      return { value: orders.map(order => order.id === id ? updated : order), result: updated }
    })
  }
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
  async listChatConversations(accountId: string): Promise<ChatConversation[]> {
    const messages = await this.messages.read<DirectMessage[]>([], isDirectMessage)
    const conversations = new Map<string, ChatConversation>()
    for (const message of messages) {
      if (message.senderId !== accountId && message.recipientId !== accountId) continue
      const peerId = message.senderId === accountId ? message.recipientId : message.senderId
      const current = conversations.get(peerId)
      if (!current || message.createdAt > current.lastMessage.createdAt) conversations.set(peerId, { peerId, lastMessage: message, unreadCount: 0 })
      if (message.recipientId === accountId && !message.readAt) {
        const conversation = conversations.get(peerId)
        if (conversation) conversation.unreadCount += 1
        else conversations.set(peerId, { peerId, lastMessage: message, unreadCount: 1 })
      }
    }
    return [...conversations.values()].sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt))
  }
  async listChatMessages(accountId: string, peerId: string, limit: number): Promise<DirectMessage[]> {
    return (await this.messages.read<DirectMessage[]>([], isDirectMessage))
      .filter(message => message.senderId === accountId && message.recipientId === peerId || message.senderId === peerId && message.recipientId === accountId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-limit)
  }
  createChatMessage(message: DirectMessage) { return this.messages.update<DirectMessage[], DirectMessage>([], isDirectMessage, messages => ({ value: [...messages, message], result: message })) }
  markChatMessagesRead(accountId: string, peerId: string, readAt: string) { return this.messages.update<DirectMessage[], number>([], isDirectMessage, messages => {
    let updated = 0
    const next = messages.map(message => {
      if (message.senderId !== peerId || message.recipientId !== accountId || message.readAt) return message
      updated += 1
      return { ...message, readAt }
    })
    return { value: next, result: updated }
  }) }
  listSocialComments(contentId: string) { return this.socialComments.read<SocialComment[]>([], isSocialComment).then(items => items.filter(item => item.contentId === contentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-100)) }
  createSocialComment(comment: SocialComment) { return this.socialComments.update<SocialComment[], SocialComment>([], isSocialComment, items => ({ value: [...items, comment], result: comment })) }
  listSocialReactions(contentId: string) { return this.socialReactions.read<SocialReaction[]>([], isSocialReaction).then(items => items.filter(item => item.contentId === contentId).map(item => item.actorId)) }
  toggleSocialReaction(contentId: string, actorId: string) { return this.socialReactions.update<SocialReaction[], boolean>([], isSocialReaction, items => {
    const exists = items.some(item => item.contentId === contentId && item.actorId === actorId)
    return { value: exists ? items.filter(item => item.contentId !== contentId || item.actorId !== actorId) : [...items, { contentId, actorId, createdAt: new Date().toISOString() }], result: !exists }
  }) }
  async recordSocialActivity(activity: SocialActivity) { await this.socialActivities.update<SocialActivity[], void>([], isSocialActivityEvent, items => ({ value: [...items, activity].slice(-20000), result: undefined })) }
  async listSocialActivity(recipientId: string): Promise<SocialActivity[]> {
    const catalog = (await this.listCatalog()).filter(item => item.creatorId === recipientId && item.publicationStatus === 'published')
    const byContent = new Map(catalog.map(item => [item.contentId, item]))
    return (await this.socialActivities.read<SocialActivity[]>([], isSocialActivityEvent)).filter(item => byContent.has(item.contentId) && item.actorId !== recipientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
  }
  createNotification(notification: NotificationRecord) {
    const record = normalizeNotificationRecord(notification)
    return this.notifications.update<NotificationRecord[], NotificationRecord>([], isNotificationRecord, items => {
      const existing = items.find(item => item.eventKey === record.eventKey)
      if (existing) return { value: items, result: existing }
      if (items.some(item => item.id === record.id)) throw new Error('NOTIFICATION_ID_EXISTS')
      return { value: [...items, record], result: record }
    })
  }
  private async storeNotificationOutbox(action: NotificationOutboxAction, notification: NotificationRecord): Promise<void> {
    await this.notificationOutbox.update<NotificationOutboxRecord[], void>([], isNotificationOutboxRecord, items => {
      if (items.some(item => item.notification.eventKey === notification.eventKey)) return { value: items, result: undefined }
      return { value: [...items, { action, notification }], result: undefined }
    })
  }
  private async removeNotificationOutbox(eventKey: string): Promise<void> {
    await this.notificationOutbox.update<NotificationOutboxRecord[], void>([], isNotificationOutboxRecord, items => ({ value: items.filter(item => item.notification.eventKey !== eventKey), result: undefined }))
  }
  private async notificationActionCommitted(item: NotificationOutboxRecord): Promise<boolean> {
    const notification = item.notification
    if (item.action === 'social_post_comment') {
      const comments = await this.socialPostComments.read<SocialPostComment[]>([], isSocialPostComment)
      return comments.some(comment => comment.id === notification.sourceId && comment.postId === notification.resourceId && comment.authorId === notification.actorId)
    }
    if (item.action === 'social_post_reaction') {
      const reactions = await this.socialPostReactions.read<SocialPostReactionRecord[]>([], isSocialPostReactionRecord)
      return reactions.some(reaction => reaction.postId === notification.resourceId && reaction.actorId === notification.actorId)
    }
    const friendships = await this.friendships.read<Friendship[]>([], validFriendship)
    const friendship = friendships.find(relation => relation.id === notification.resourceId)
    if (!friendship) return false
    return item.action === 'friend_request'
      ? friendship.status === 'pending' && friendship.requesterId === notification.actorId && friendship.recipientId === notification.recipientId
      : friendship.status === 'accepted' && friendship.recipientId === notification.actorId && friendship.requesterId === notification.recipientId
  }
  private async drainNotificationOutboxUnlocked(): Promise<NotificationRecord[]> {
    const pending = await this.notificationOutbox.read<NotificationOutboxRecord[]>([], isNotificationOutboxRecord)
    const delivered: NotificationRecord[] = []
    for (const item of pending) {
      if (await this.notificationActionCommitted(item)) delivered.push(await this.createNotification(item.notification))
      await this.removeNotificationOutbox(item.notification.eventKey)
    }
    return delivered
  }
  async drainNotificationOutbox(): Promise<NotificationRecord[]> {
    return withLocalStorageLock(`notification-outbox:${config.dataDirectory}`, () => this.drainNotificationOutboxUnlocked())
  }
  async createSocialPostCommentWithNotification(comment: SocialPostComment, notification?: NotificationSeed): Promise<NotificationMutation<SocialPostComment>> {
    return withLocalStorageLock(`notification-outbox:${config.dataDirectory}`, async () => {
      const recovered = await this.drainNotificationOutboxUnlocked()
      const post = notification ? await this.findSocialPost(comment.postId) : undefined
      const event = notification && post && comment.authorId !== post.authorId
        ? notificationRecordFor(notification, post.authorId, comment.authorId, 'social_post_comment', 'post', comment.postId, comment.id)
        : undefined
      if (event) await this.storeNotificationOutbox('social_post_comment', event)
      try {
        const value = await this.createSocialPostComment(comment)
        let notifications: NotificationRecord[] = []
        if (event) { try { notifications = await this.drainNotificationOutboxUnlocked() } catch { /* the persisted journal will retry on the next drain */ } }
        return { value, notifications: [...recovered, ...notifications] }
      } catch (error) {
        if (event) await this.removeNotificationOutbox(event.eventKey)
        throw error
      }
    })
  }
  async toggleSocialPostReactionWithNotification(postId: string, actorId: string, notification?: NotificationSeed): Promise<NotificationMutation<boolean>> {
    return withLocalStorageLock(`notification-outbox:${config.dataDirectory}`, async () => {
      const recovered = await this.drainNotificationOutboxUnlocked()
      const current = await this.socialPostReactions.read<SocialPostReactionRecord[]>([], isSocialPostReactionRecord)
      const reacted = !current.some(item => item.postId === postId && item.actorId === actorId)
      const post = notification ? await this.findSocialPost(postId) : undefined
      const event = reacted && notification && post && actorId !== post.authorId
        ? notificationRecordFor(notification, post.authorId, actorId, 'social_post_reaction', 'post', postId, `${postId}:${actorId}`)
        : undefined
      if (event) await this.storeNotificationOutbox('social_post_reaction', event)
      try {
        const value = await this.socialPostReactions.update<SocialPostReactionRecord[], boolean>([], isSocialPostReactionRecord, items => {
          const exists = items.some(item => item.postId === postId && item.actorId === actorId)
          return { value: exists ? items.filter(item => item.postId !== postId || item.actorId !== actorId) : [...items, { postId, actorId, createdAt: new Date().toISOString() }], result: !exists }
        })
        let notifications: NotificationRecord[] = []
        if (event) { try { notifications = await this.drainNotificationOutboxUnlocked() } catch { /* the persisted journal will retry on the next drain */ } }
        return { value, notifications: [...recovered, ...notifications] }
      } catch (error) {
        if (event) await this.removeNotificationOutbox(event.eventKey)
        throw error
      }
    })
  }
  async createFriendshipWithNotification(friendship: Friendship, notification?: NotificationSeed): Promise<NotificationMutation<Friendship>> {
    return withLocalStorageLock(`notification-outbox:${config.dataDirectory}`, async () => {
      const recovered = await this.drainNotificationOutboxUnlocked()
      const event = notification && friendship.requesterId !== friendship.recipientId
        ? notificationRecordFor(notification, friendship.recipientId, friendship.requesterId, 'friend_request', 'friendship', friendship.id, friendship.id)
        : undefined
      if (event) await this.storeNotificationOutbox('friend_request', event)
      try {
        const value = await this.createFriendship(friendship)
        let notifications: NotificationRecord[] = []
        if (event) { try { notifications = await this.drainNotificationOutboxUnlocked() } catch { /* the persisted journal will retry on the next drain */ } }
        return { value, notifications: [...recovered, ...notifications] }
      } catch (error) {
        if (event) await this.removeNotificationOutbox(event.eventKey)
        throw error
      }
    })
  }
  async acceptFriendshipWithNotification(id: string, actorId: string, notification?: NotificationSeed): Promise<NotificationMutation<Friendship | undefined>> {
    return withLocalStorageLock(`notification-outbox:${config.dataDirectory}`, async () => {
      const recovered = await this.drainNotificationOutboxUnlocked()
      const pending = (await this.friendships.read<Friendship[]>([], validFriendship)).find(item => item.id === id && item.recipientId === actorId && item.status === 'pending')
      if (!pending) return { value: undefined, notifications: recovered }
      const event = notification
        ? notificationRecordFor(notification, pending.requesterId, actorId, 'friend_request_accepted', 'friendship', pending.id, pending.id)
        : undefined
      if (event) await this.storeNotificationOutbox('friend_request_accepted', event)
      try {
        const value = await this.updateFriendship(id, actorId, 'accepted')
        let notifications: NotificationRecord[] = []
        if (event && value) { try { notifications = await this.drainNotificationOutboxUnlocked() } catch { /* the persisted journal will retry on the next drain */ } }
        else if (event) await this.removeNotificationOutbox(event.eventKey)
        return { value, notifications: [...recovered, ...notifications] }
      } catch (error) {
        if (event) await this.removeNotificationOutbox(event.eventKey)
        throw error
      }
    })
  }
  async listNotifications(recipientId: string, options: NotificationPageOptions): Promise<NotificationPage> {
    const limit = notificationLimit(options.limit)
    const cursor = normalizeNotificationCursor(options.cursor)
    const recipientItems = (await this.notifications.read<NotificationRecord[]>([], isNotificationRecord))
      .filter(item => item.recipientId === recipientId)
    const unreadCount = recipientItems.reduce((count, item) => count + (item.readAt === null ? 1 : 0), 0)
    const pageItems = recipientItems
      .filter(item => !cursor || Date.parse(item.createdAt) < Date.parse(cursor.createdAt) || Date.parse(item.createdAt) === Date.parse(cursor.createdAt) && item.id < cursor.id)
      .sort(compareNotificationOrder)
      .slice(0, limit + 1)
    const hasMore = pageItems.length > limit
    const items = pageItems.slice(0, limit)
    const last = items.at(-1)
    return { items, unreadCount, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null }
  }
  markNotificationRead(id: string, recipientId: string, readAt: string) {
    if (!isValidNotificationTimestamp(readAt)) throw new Error('INVALID_NOTIFICATION_TIMESTAMP')
    const normalizedReadAt = new Date(readAt).toISOString()
    return this.notifications.update<NotificationRecord[], NotificationRecord | undefined>([], isNotificationRecord, items => {
      const index = items.findIndex(item => item.id === id && item.recipientId === recipientId)
      if (index < 0) return { value: items, result: undefined }
      if (items[index].readAt) return { value: items, result: items[index] }
      const updated = { ...items[index], readAt: normalizedReadAt }
      return { value: items.map((item, itemIndex) => itemIndex === index ? updated : item), result: updated }
    })
  }
  createSocialPost(post: SocialPost, mediaLimitBytes: number) { return this.socialPosts.update<SocialPost[], SocialPost>([], isSocialPost, items => {
    if (items.some(item => item.id === post.id)) throw new Error('SOCIAL_POST_EXISTS')
    const used = items.filter(item => item.authorId === post.authorId).reduce((sum, item) => sum + (item.media?.sizeBytes || 0), 0)
    const requested = post.media?.sizeBytes || 0
    if (used + requested > mediaLimitBytes) throw new StorageQuotaExceededError(used, mediaLimitBytes, requested)
    return { value: [...items, post], result: post }
  }) }
  findSocialPost(id: string) { return this.socialPosts.read<SocialPost[]>([], isSocialPost).then(items => items.find(item => item.id === id)) }
  listSocialPosts(options: { authorId?: string; cursor?: SocialPostCursor; limit: number; moderationOnly?: boolean; publishedOnly?: boolean }) {
    return this.socialPosts.read<SocialPost[]>([], isSocialPost).then(items => items
      .filter(item => options.authorId === undefined || item.authorId === options.authorId)
      .filter(item => !options.moderationOnly || item.visibility === 'pending-review')
      .filter(item => !options.publishedOnly || item.visibility === 'published')
      .filter(item => !options.cursor || item.createdAt < options.cursor.createdAt || item.createdAt === options.cursor.createdAt && item.id < options.cursor.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, options.limit))
  }
  async getSocialAccountState(accountId: string): Promise<SocialAccountState> {
    const [follows, bookmarks] = await Promise.all([
      this.socialFollows.read<SocialFollowRecord[]>([], isSocialFollowRecord),
      this.socialPostBookmarks.read<SocialPostBookmarkRecord[]>([], isSocialPostBookmarkRecord),
    ])
    return {
      followedAccountIds: follows.filter(item => item.followerId === accountId).map(item => item.followingId).sort(),
      bookmarkedPostIds: bookmarks.filter(item => item.accountId === accountId).map(item => item.postId).sort(),
    }
  }
  followSocialAccount(followerId: string, followingId: string, maxFollows: number) {
    if (followerId === followingId) return Promise.reject(new Error('SOCIAL_SELF_FOLLOW'))
    return this.socialFollows.update<SocialFollowRecord[], void>([], isSocialFollowRecord, items => {
      if (items.some(item => item.followerId === followerId && item.followingId === followingId)) return { value: items, result: undefined }
      if (items.filter(item => item.followerId === followerId).length >= maxFollows) throw new Error('SOCIAL_FOLLOW_LIMIT')
      return { value: [...items, { followerId, followingId, createdAt: new Date().toISOString() }], result: undefined }
    })
  }
  unfollowSocialAccount(followerId: string, followingId: string) {
    return this.socialFollows.update<SocialFollowRecord[], void>([], isSocialFollowRecord, items => ({ value: items.filter(item => item.followerId !== followerId || item.followingId !== followingId), result: undefined }))
  }
  bookmarkSocialPost(accountId: string, postId: string, maxBookmarks: number) {
    return this.socialPostBookmarks.update<SocialPostBookmarkRecord[], void>([], isSocialPostBookmarkRecord, items => {
      if (items.some(item => item.accountId === accountId && item.postId === postId)) return { value: items, result: undefined }
      if (items.filter(item => item.accountId === accountId).length >= maxBookmarks) throw new Error('SOCIAL_BOOKMARK_LIMIT')
      return { value: [...items, { accountId, postId, createdAt: new Date().toISOString() }], result: undefined }
    })
  }
  unbookmarkSocialPost(accountId: string, postId: string) {
    return this.socialPostBookmarks.update<SocialPostBookmarkRecord[], void>([], isSocialPostBookmarkRecord, items => ({ value: items.filter(item => item.accountId !== accountId || item.postId !== postId), result: undefined }))
  }
  async deleteSocialPost(id: string, authorId: string) {
    const deleted = await this.socialPosts.update<SocialPost[], SocialPost | undefined>([], isSocialPost, items => {
    const existing = items.find(item => item.id === id && item.authorId === authorId)
    return { value: items.filter(item => item.id !== id || item.authorId !== authorId), result: existing }
    })
    if (deleted) await this.socialPostReports.update<SocialPostReport[], void>([], isSocialPostReport, items => ({ value: items.filter(item => item.postId !== id), result: undefined }))
    if (deleted) await this.socialPostComments.update<SocialPostComment[], void>([], isSocialPostComment, items => ({ value: items.filter(item => item.postId !== id), result: undefined }))
    if (deleted) await this.socialPostReactions.update<SocialPostReactionRecord[], void>([], isSocialPostReactionRecord, items => ({ value: items.filter(item => item.postId !== id), result: undefined }))
    if (deleted) await this.socialPostBookmarks.update<SocialPostBookmarkRecord[], void>([], isSocialPostBookmarkRecord, items => ({ value: items.filter(item => item.postId !== id), result: undefined }))
    return deleted
  }
  listSocialPostComments(postId: string, limit = 100) { const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 100; return this.socialPostComments.read<SocialPostComment[]>([], isSocialPostComment).then(items => items.filter(item => item.postId === postId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-safeLimit)) }
  createSocialPostComment(comment: SocialPostComment) { return this.socialPostComments.update<SocialPostComment[], SocialPostComment>([], isSocialPostComment, items => ({ value: [...items, comment], result: comment })) }
  listSocialPostReactions(postId: string) { return this.socialPostReactions.read<SocialPostReactionRecord[]>([], isSocialPostReactionRecord).then(items => [...new Set(items.filter(item => item.postId === postId).map(item => item.actorId))]) }
  getSocialPostReactionSummary(postId: string, actorId: string) { return this.socialPostReactions.read<SocialPostReactionRecord[]>([], isSocialPostReactionRecord).then(items => {
    const active = items.filter(item => item.postId === postId)
    return { reactionCount: active.length, reactedByMe: active.some(item => item.actorId === actorId) }
  }) }
  toggleSocialPostReaction(postId: string, actorId: string) { return this.socialPostReactions.update<SocialPostReactionRecord[], boolean>([], isSocialPostReactionRecord, items => {
    const exists = items.some(item => item.postId === postId && item.actorId === actorId)
    return { value: exists ? items.filter(item => item.postId !== postId || item.actorId !== actorId) : [...items, { postId, actorId, createdAt: new Date().toISOString() }], result: !exists }
  }) }
  reviewSocialPost(id: string, status: Extract<SocialPostVisibility, 'published' | 'rejected' | 'removed'>, staffId: string, note?: string) {
    return this.socialPosts.update<SocialPost[], SocialPost | undefined>([], isSocialPost, items => {
      const existing = items.find(item => item.id === id && item.visibility !== 'removed' && (status === 'published' ? item.visibility === 'pending-review' : true))
      if (!existing) return { value: items, result: undefined }
      const updated = { ...existing, visibility: status, reviewedBy: staffId, reviewedAt: new Date().toISOString(), reviewNote: note?.slice(0, 500), updatedAt: new Date().toISOString() }
      return { value: items.map(item => item.id === id ? updated : item), result: updated }
    })
  }
  createSocialPostReport(report: SocialPostReport) { return this.socialPostReports.update<SocialPostReport[], SocialPostReport>([], isSocialPostReport, items => {
    if (items.some(item => item.postId === report.postId && item.reporterId === report.reporterId)) throw new Error('SOCIAL_REPORT_EXISTS')
    return { value: [...items, report], result: report }
  }) }
  deleteSocialPostReport(id: string, reporterId: string) { return this.socialPostReports.update<SocialPostReport[], boolean>([], isSocialPostReport, items => {
    const next = items.filter(item => item.id !== id || item.reporterId !== reporterId)
    return { value: next, result: next.length !== items.length }
  }) }
  listSocialPostReports(status?: SocialPostReport['status']) { return this.socialPostReports.read<SocialPostReport[]>([], isSocialPostReport).then(items => items.filter(item => status === undefined || item.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500)) }
  reviewSocialPostReport(id: string, status: Extract<SocialPostReport['status'], 'reviewed' | 'dismissed'>, staffId: string) {
    return this.socialPostReports.update<SocialPostReport[], SocialPostReport | undefined>([], isSocialPostReport, items => {
      const existing = items.find(item => item.id === id && item.status === 'open')
      if (!existing) return { value: items, result: undefined }
      const updated = { ...existing, status, reviewedBy: staffId, reviewedAt: new Date().toISOString() }
      return { value: items.map(item => item.id === id ? updated : item), result: updated }
    })
  }
  findAccountByEmail(email: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.email === email)) }
  findAccountById(id: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => item.id === id)) }
  listAccounts() { return this.accounts.read<Account[]>([], this.validAccount) }
  findAccountByToken(kind: 'verify' | 'reset', hash: string) { return this.accounts.read<Account[]>([], this.validAccount).then(items => items.find(item => (kind === 'verify' ? item.verificationTokenHash : item.resetTokenHash) === hash)) }
  async saveAccount(account: Account) { await this.accounts.update<Account[], void>([], this.validAccount, items => { const index = items.findIndex(item => item.id === account.id); if (index >= 0) items[index] = account; else items.push(account); return { value: items, result: undefined } }) }
  async createSession(session: SessionRecord) { await this.sessions.update<SessionRecord[], void>([], isSessionRecord, items => ({ value: [...items.filter(item => item.tokenHash !== session.tokenHash), session], result: undefined })) }
  findSession(hash: string) { return this.sessions.read<SessionRecord[]>([], isSessionRecord).then(items => items.find(item => item.tokenHash === hash)) }
  async deleteSession(hash: string) { await this.sessions.update<SessionRecord[], void>([], isSessionRecord, items => ({ value: items.filter(item => item.tokenHash !== hash), result: undefined })) }
  async deleteExpiredSessions(now: number) { await this.sessions.update<SessionRecord[], void>([], isSessionRecord, items => ({ value: items.filter(item => item.expiresAt > now), result: undefined })) }
  async deleteAccountSessions(accountId: string, exceptTokenHash?: string) { await this.sessions.update<SessionRecord[], void>([], isSessionRecord, items => ({ value: items.filter(item => item.accountId !== accountId || item.tokenHash === exceptTokenHash), result: undefined })) }
  async clearSessions() { await this.sessions.update<SessionRecord[], void>([], isSessionRecord, () => ({ value: [], result: undefined })) }
    private validAccount(value: unknown): value is Account { const item = value as Partial<Account>; return !!value && typeof item.id === 'string' && typeof item.email === 'string' && typeof item.passwordHash === 'string' && (item.role === 'creator' || item.role === 'admin' || item.role === 'community_manager') && (item.planId === undefined || isPlanId(item.planId)) && (item.purchasedPlanIds === undefined || Array.isArray(item.purchasedPlanIds) && item.purchasedPlanIds.every(isPlanId)) }
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
  async findCatalogArtwork(assetId: string, ownerId?: string) { return (await this.listCatalogArtwork()).find(item => item.assetId === assetId && (ownerId === undefined || item.ownerId === ownerId)) }
  listCatalogArtwork() { return this.artwork.read<ArtworkRecord[]>([], isArtworkRecord) }
  async saveCatalogArtwork(record: ArtworkRecord, limitBytes?: number) {
    return withLocalStorageLock(record.ownerId, async () => {
      const asset = await this.findAsset(record.assetId, record.ownerId)
      if (!asset) throw new Error('ARTWORK_ASSET_NOT_FOUND')
      const items = await this.listCatalogArtwork()
      const existing = items.find(item => item.assetId === record.assetId)
      const usedBytes = await this.getStorageUsage(record.ownerId)
      const requestedBytes = record.sizeBytes + (record.thumbnailSizeBytes ?? 0) - (existing?.sizeBytes ?? 0) - (existing?.thumbnailSizeBytes ?? 0)
      if (limitBytes !== undefined && usedBytes + requestedBytes > limitBytes) throw new StorageQuotaExceededError(usedBytes, limitBytes, Math.max(0, requestedBytes))
      return this.artwork.update<ArtworkRecord[], ArtworkRecord>([], isArtworkRecord, current => ({ value: [...current.filter(item => item.assetId !== record.assetId), record], result: record }))
    })
  }
  async getStorageUsage(ownerId: string) {
    const [assets, artwork] = await Promise.all([this.listAssets(ownerId), this.listCatalogArtwork()])
    return assets.filter(item => item.state === 'available').reduce((total, item) => total + item.sizeBytes, 0) + artwork.filter(item => item.ownerId === ownerId).reduce((total, item) => total + item.sizeBytes + (item.thumbnailSizeBytes ?? 0), 0)
  }
  async listStorageUsage(): Promise<StorageUsageRecord[]> {
    const totals = new Map<string, StorageUsageRecord>()
    for (const item of await this.listAssets()) {
      const current = totals.get(item.ownerId) ?? { ownerId: item.ownerId, usedBytes: 0, originalCount: 0, artworkBytes: 0, artworkCount: 0, previewBytes: 0, previewCount: 0, storedBytes: 0 }
      if (item.state === 'available') { current.usedBytes += item.sizeBytes; current.originalCount += 1 }
      if (item.previewStorageKey && item.previewSizeBytes) { current.previewBytes += item.previewSizeBytes; current.previewCount += 1 }
      current.storedBytes = current.usedBytes + current.previewBytes
      totals.set(item.ownerId, current)
    }
    for (const item of await this.listCatalogArtwork()) {
      const current = totals.get(item.ownerId) ?? { ownerId: item.ownerId, usedBytes: 0, originalCount: 0, artworkBytes: 0, artworkCount: 0, previewBytes: 0, previewCount: 0, storedBytes: 0 }
      const artworkBytes = item.sizeBytes + (item.thumbnailSizeBytes ?? 0)
      current.usedBytes += artworkBytes; current.artworkBytes += artworkBytes; current.artworkCount += 1; current.storedBytes = current.usedBytes + current.previewBytes
      totals.set(item.ownerId, current)
    }
    return [...totals.values()]
  }
  async getStorageQuota(ownerId: string) { return (await this.listStorageQuotas()).find(item => item.ownerId === ownerId)?.limitBytes }
  listStorageQuotas() { return this.storageQuotas.read<StorageQuotaRecord[]>([], isStorageQuotaRecord) }
  async setStorageQuota(ownerId: string, limitBytes: number | null, updatedBy: string) {
    if (!(await this.findAccountById(ownerId))) throw new Error('ACCOUNT_NOT_FOUND')
    if (limitBytes !== null && (!Number.isSafeInteger(limitBytes) || limitBytes < 1)) throw new Error('INVALID_STORAGE_QUOTA')
    await this.storageQuotas.update<StorageQuotaRecord[], void>([], isStorageQuotaRecord, items => ({ value: limitBytes === null ? items.filter(item => item.ownerId !== ownerId) : [...items.filter(item => item.ownerId !== ownerId), { ownerId, limitBytes, updatedBy, updatedAt: new Date().toISOString() }], result: undefined }))
  }
  createAsset(asset: AssetRecord, limitBytes?: number) { return withLocalStorageLock(asset.ownerId, async () => {
    const usedBytes = await this.getStorageUsage(asset.ownerId)
    if (limitBytes !== undefined && usedBytes + asset.sizeBytes > limitBytes) throw new StorageQuotaExceededError(usedBytes, limitBytes, asset.sizeBytes)
    return this.assets.update<AssetRecord[], AssetRecord>([], this.validAsset, items => {
      if (items.some(item => item.ownerId === asset.ownerId && item.contentHash === asset.contentHash && item.state !== 'missing')) throw new Error('DUPLICATE_ASSET')
      return { value: [...items, asset], result: asset }
    })
  }) }
  updateAssetState(id: string, state: AssetState) { return this.assets.update<AssetRecord[], void>([], this.validAsset, items => ({ value: items.map(item => item.id === id ? { ...item, state, updatedAt: new Date().toISOString() } : item), result: undefined })) }
  updateAssetPreview(id: string, preview: Pick<AssetRecord, 'previewStorageKey' | 'previewMimeType' | 'previewSizeBytes'>) { return this.assets.update<AssetRecord[], void>([], this.validAsset, items => ({ value: items.map(item => item.id === id ? { ...item, ...preview, updatedAt: new Date().toISOString() } : item), result: undefined })) }
  deleteAsset(id: string, ownerId: string) { return withLocalStorageLock(ownerId, async () => {
    await this.artwork.update<ArtworkRecord[], void>([], isArtworkRecord, items => ({ value: items.filter(item => item.assetId !== id || item.ownerId !== ownerId), result: undefined }))
    await this.assets.update<AssetRecord[], void>([], this.validAsset, items => {
      const next = items.filter(item => item.id !== id || item.ownerId !== ownerId)
      if (next.length === items.length) throw new Error('ASSET_NOT_FOUND')
      return { value: next, result: undefined }
    })
  }) }
  private validAsset(value: unknown): value is AssetRecord { const item = value as Partial<AssetRecord>; return !!value && typeof item.id === 'string' && typeof item.ownerId === 'string' && typeof item.originalName === 'string' && typeof item.storageKey === 'string' && typeof item.mimeType === 'string' && typeof item.sizeBytes === 'number' && typeof item.contentHash === 'string' && ['available', 'missing', 'metadata-only'].includes(item.state || '') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' && (item.previewStorageKey === undefined || typeof item.previewStorageKey === 'string') && (item.previewMimeType === undefined || item.previewMimeType === 'audio/mp4') && (item.previewSizeBytes === undefined || typeof item.previewSizeBytes === 'number' && item.previewSizeBytes > 0) }
}
const isArtworkRecord = (value: unknown): value is ArtworkRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ArtworkRecord>
  return typeof item.assetId === 'string' && typeof item.ownerId === 'string' && typeof item.storageKey === 'string' && ['image/jpeg', 'image/png'].includes(item.mimeType || '') && item.extension === (item.mimeType === 'image/png' ? 'png' : 'jpg') && Number.isSafeInteger(item.sizeBytes) && (item.sizeBytes ?? 0) > 0 && (item.sizeBytes ?? 0) <= 10 * 1024 * 1024 && Number.isSafeInteger(item.width) && Number.isSafeInteger(item.height) && item.width === item.height && (item.width ?? 0) >= 640 && (item.width ?? 0) <= 10000 && (item.thumbnailStorageKey === undefined || typeof item.thumbnailStorageKey === 'string') && (item.thumbnailSizeBytes === undefined || Number.isSafeInteger(item.thumbnailSizeBytes) && (item.thumbnailSizeBytes ?? 0) >= 16 && (item.thumbnailSizeBytes ?? 0) <= 512 * 1024) && (item.thumbnailStorageKey === undefined) === (item.thumbnailSizeBytes === undefined) && typeof item.updatedAt === 'string'
}
const isStorageQuotaRecord = (value: unknown): value is StorageQuotaRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<StorageQuotaRecord>
  return typeof item.ownerId === 'string' && Number.isSafeInteger(item.limitBytes) && (item.limitBytes ?? 0) > 0 && typeof item.updatedBy === 'string' && typeof item.updatedAt === 'string'
}
const isSessionRecord = (value: unknown): value is SessionRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SessionRecord>
  return typeof item.tokenHash === 'string' && /^[a-f0-9]{64}$/.test(item.tokenHash) && typeof item.accountId === 'string' && typeof item.csrfTokenHash === 'string' && /^[a-f0-9]{64}$/.test(item.csrfTokenHash) && Number.isSafeInteger(item.expiresAt)
}
const isStripeConnectRecord = (value: unknown): value is StripeConnectRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<StripeConnectRecord>
  return typeof item.accountId === 'string' && typeof item.stripeAccountId === 'string' && typeof item.chargesEnabled === 'boolean' && typeof item.payoutsEnabled === 'boolean' && typeof item.detailsSubmitted === 'boolean' && typeof item.deauthorized === 'boolean' && typeof item.updatedAt === 'string'
}
const isStripeEvent = (value: unknown): value is { eventId: string; eventType: string; createdAt: string } => {
  if (!value || typeof value !== 'object') return false
  const item = value as { eventId?: unknown; eventType?: unknown; createdAt?: unknown }
  return typeof item.eventId === 'string' && typeof item.eventType === 'string' && typeof item.createdAt === 'string'
}
const isBeatOrder = (value: unknown): value is BeatOrder => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BeatOrder>
  return typeof item.id === 'string' && typeof item.buyerId === 'string' && typeof item.sellerId === 'string' &&
    typeof item.contentId === 'string' && typeof item.offerId === 'string' && typeof item.title === 'string' &&
    Number.isSafeInteger(item.amountMinor) && (item.amountMinor ?? 0) > 0 &&
    Number.isSafeInteger(item.commissionMinor) && (item.commissionMinor ?? -1) >= 0 &&
    Number.isSafeInteger(item.processingEstimateMinor) && (item.processingEstimateMinor ?? -1) >= 0 &&
    Number.isSafeInteger(item.applicationFeeMinor) && (item.applicationFeeMinor ?? -1) >= 0 &&
    Number.isSafeInteger(item.sellerNetMinor) && (item.sellerNetMinor ?? -1) >= 0 && item.currency === 'usd' &&
    ['pending', 'paid', 'failed', 'refund_pending', 'refunded', 'partially_refunded', 'disputed'].includes(item.status || '') && typeof item.createdAt === 'string' &&
    (item.stripeCheckoutSessionId === undefined || typeof item.stripeCheckoutSessionId === 'string') &&
    (item.stripePaymentIntentId === undefined || typeof item.stripePaymentIntentId === 'string') &&
    (item.stripeRefundId === undefined || typeof item.stripeRefundId === 'string') &&
    (item.refundRequestedAt === undefined || typeof item.refundRequestedAt === 'string') &&
    (item.refundRequestedBy === undefined || typeof item.refundRequestedBy === 'string') &&
    (item.disputeId === undefined || typeof item.disputeId === 'string') &&
    (item.disputeReason === undefined || typeof item.disputeReason === 'string') &&
    (item.paidAt === undefined || typeof item.paidAt === 'string')
}
const validFriendship = (value: unknown): value is Friendship => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Friendship>
  return typeof item.id === 'string' && typeof item.requesterId === 'string' && typeof item.recipientId === 'string' && item.requesterId !== item.recipientId && (item.status === 'pending' || item.status === 'accepted') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}
type SocialReaction = { contentId: string; actorId: string; createdAt: string }
const isSocialComment = (value: unknown): value is SocialComment => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SocialComment>
  return typeof item.id === 'string' && typeof item.contentId === 'string' && typeof item.authorId === 'string' && typeof item.authorName === 'string' && typeof item.body === 'string' && typeof item.createdAt === 'string'
}
const isSocialReaction = (value: unknown): value is SocialReaction => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SocialReaction>
  return typeof item.contentId === 'string' && typeof item.actorId === 'string' && typeof item.createdAt === 'string'
}
const isSocialActivityEvent = (value: unknown): value is SocialActivity => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SocialActivity>
  return typeof item.id === 'string' && (item.type === 'comment' || item.type === 'reaction') && typeof item.contentId === 'string' && typeof item.contentTitle === 'string' && typeof item.actorId === 'string' && typeof item.actorName === 'string' && typeof item.createdAt === 'string' && (item.body === undefined || typeof item.body === 'string')
}
