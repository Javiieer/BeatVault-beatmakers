import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AuthService, csrfCookie, sessionCookie, sessionMaxAgeSeconds } from './auth'
import { AuditLog, clientAddress, ConcurrencyLimiter, RateLimiter } from './security'
import { config, isAllowedOrigin } from './config'
import { createRepository } from './repository'
import { StorageQuotaExceededError, type Friendship } from './store'
import { ValidationError, validateBeatListingInput, validateCatalogId, validateCreateCatalog, validateCreateProject, validateEmail, validateProjectId, validateRegister, validateToken, validateTokenPassword, validateUpdateCatalog, validateUpdateProject } from './validation'
import type { ProjectRecord } from '../src/domains/core/contracts'
import { adminData } from './admin'
import { receiveUpload, retryProcessedPreview, assetPath, reconcileUploads } from './uploads'
import { previewArtifactPath } from './media-preview'
import { createReadStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { HttpInputError, parseByteRange, readJson, readRawBody } from './http'
import type { CatalogEntry } from '../src/domains/catalog/types'
import { defaultAvatarFocalPoint, defaultCoverFocalPoint, emptyProfile, type CreatorProfile, type ProfileImageKind, type ProfileImageRecord } from '../src/domains/profile'
import { validateProfile } from './profile'
import { closeChatStreams, isChatOnline, publishChatEvent, subscribeToChat } from './chat'
import { getEffectiveStorageLimit, getPlanCatalog, isPlanId } from './plans'
import { isPromotionRule, isPromotionScope, type PromotionInput, type PromotionRule } from '../src/domains/marketplace/promotions'
import { getEcbReferenceRates } from './exchange-rates'
import { draftOfferTermsVersion, isBeatListingReady, rightsIntakeVersion, type BeatListingRecord } from '../src/domains/marketplace/sellerListings'
import { sellerEvidenceMaxFiles, sellerEvidenceView } from '../src/domains/marketplace/sellerEvidence'
import { receiveSellerEvidence, removeSellerEvidenceFile, sellerEvidencePath } from './seller-evidence-upload'
import Stripe from 'stripe'
import { StripeConnectService } from './stripe-connect'
import { StripePaymentsService } from './stripe-payments'
import { artworkExists, artworkPath, maxArtworkBytes, persistArtwork, persistArtworkThumbnail, removeArtwork, validateArtwork, type ArtworkRecord } from './artwork'
import { parseProfileImageFocalPoint, persistProfileImage, profileImageMaxAccountBytes, profileImageMaxBytes, readProfileImage, removeProfileImage, validateProfileImageUpload } from './profile-images'
import { socialPostView, type SocialAudience, type SocialPost, type SocialPostCursor, type SocialPostInteractionSnapshot, type SocialPostReactionResult, type SocialPostReport } from './social-posts'
import { readSocialPostMedia, reconcileSocialPostMedia, receiveSocialPostMedia, removeSocialPostMedia, socialMediaAccountMaxBytes } from './social-post-media'
import { isNotificationCursor, type NotificationCursor, type NotificationRecord, type NotificationSeed, type NotificationType } from './notifications'
const chatMessageLimiter = new RateLimiter(30, 60000)
const socialInteractionLimiter = new RateLimiter(60, 60000)
const notificationLimiter = new RateLimiter(120, 60000)
const previewRetryLimiter = new RateLimiter(3, 60000)
const uploadConcurrencyLimiter = new ConcurrencyLimiter(2)
const profileImageConcurrencyLimiter = new ConcurrencyLimiter(1)
const socialPostLimiter = new RateLimiter(30, 60000)
const socialFeedLimiter = new RateLimiter(120, 60000)
const socialPostInteractionLimiter = new RateLimiter(60, 60000)
const socialPostInteractionBatchLimiter = new RateLimiter(120, 60000)
const socialPostInteractionBatchCommentLimit = 20
const socialPostInteractionBatchLimit = 30
const socialRelationshipLimiter = new RateLimiter(90, 60000)
const socialFollowLimit = 500
const socialBookmarkLimit = 1000
const socialReportLimiter = new RateLimiter(10, 60000)
const socialMediaConcurrency = new ConcurrencyLimiter(2)
const socialMediaAccountConcurrency = new ConcurrencyLimiter(1)
const runtime = createRepository(); const repo = runtime.repository; export const auth = new AuthService(repo); export const audit = new AuditLog(runtime.auditStore); const limiter = new RateLimiter(config); const creatorSearchLimiter = new RateLimiter(30, 60000)
const publishNotifications = (items: NotificationRecord[]) => { for (const item of items) publishChatEvent(item.recipientId, { type: 'notification', notificationId: item.id }) }
const flushNotificationOutbox = async () => publishNotifications(await repo.drainNotificationOutbox())
const notificationSeed = (type: NotificationType, resourceType: NotificationRecord['resourceType'], resourceId: string, sourceId: string): NotificationSeed => ({ id: randomUUID(), type, resourceType, resourceId, sourceId, eventKey: `${type}:${sourceId}`, createdAt: new Date().toISOString() })
const stripeClient = config.stripe.enabled ? new Stripe(config.stripe.secretKey!) : undefined
const stripeConnect = stripeClient ? new StripeConnectService(stripeClient, repo, config.stripe.publicUrl) : undefined
const stripePayments = stripeClient && config.stripe.paymentsEnabled ? new StripePaymentsService(stripeClient, repo, config.stripe.publicUrl, { commissionBps: config.stripe.commissionBps, processingRateBps: config.stripe.processingRateBps!, processingFixedMinor: config.stripe.processingFixedMinor }) : undefined
const catalogForAccount = async (entry: CatalogEntry, ownerId?: string, canReviewPrivate = false): Promise<CatalogEntry> => {
  const { assetId, ...publicEntry } = entry
  delete publicEntry.audio
  if (!assetId) return publicEntry
  const asset = await repo.findAsset(assetId)
  const artwork = await repo.findCatalogArtwork(assetId)
  if (artwork && (entry.publicationStatus === 'published' || entry.creatorId === ownerId || canReviewPrivate) && await artworkExists(artwork.storageKey)) {
    const thumbnailAvailable = Boolean(artwork.thumbnailStorageKey && await artworkExists(artwork.thumbnailStorageKey))
    publicEntry.artworkUrl = `/api/catalog/${encodeURIComponent(entry.contentId)}/artwork${thumbnailAvailable ? '/thumbnail' : ''}`
  }
  const previewReady = Boolean(asset?.previewStorageKey && await stat(previewArtifactPath(config.uploadDirectory, asset.previewStorageKey)).then(info => info.isFile() && info.size > 0, () => false))
  if (entry.publicationStatus === 'published' && asset && previewReady) {
    return { ...publicEntry, previewUrl: `/api/catalog/${encodeURIComponent(entry.contentId)}/preview`, ...(entry.creatorId === ownerId ? { assetId, audio: { originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, state: asset.state, previewReady: true } } : {}) }
  }
  if (entry.creatorId !== ownerId) return publicEntry
  return { ...publicEntry, assetId, previewUrl: asset ? `/api/assets/${encodeURIComponent(asset.id)}/preview` : undefined, audio: asset ? { originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, state: asset.state, previewReady } : undefined }
}
const cookie = (req: IncomingMessage, name: string) => req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1)
const json = (res: ServerResponse, status: number, value: unknown, id: string, origin: string | undefined, cookies: string[] = []) => { const headers: Record<string, string | string[] | number> = { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id, X-CSRF-Token, X-Profile-Focal-Point, Idempotency-Key', 'Vary': 'Origin', 'X-Request-Id': id, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }; if (cookies.length) headers['Set-Cookie'] = cookies; res.writeHead(status, headers); res.end(status === 204 ? undefined : JSON.stringify(value)) }
const body = readJson
const profileImageUrl = (accountId: string, kind: ProfileImageKind, image?: ProfileImageRecord) => image ? `/api/profiles/${encodeURIComponent(accountId)}/images/${kind}/thumbnail` : undefined
const profileForClient = (profile: CreatorProfile, packageBadges?: Array<'creator' | 'studio'>) => {
  const { avatarImage, coverImage, ...safe } = profile
  delete safe.avatarUrl
  delete safe.coverUrl
  return { ...safe, avatarUrl: profileImageUrl(profile.accountId, 'avatar', avatarImage), coverUrl: profileImageUrl(profile.accountId, 'cover', coverImage), ...(packageBadges ? { packageBadges } : {}) }
}
const privateFriendProfileForClient = (profile: CreatorProfile) => ({
  accountId: profile.accountId,
  displayName: profile.displayName,
  bio: profile.bio,
  location: '',
  website: '',
  instagram: '',
  genres: profile.genres,
  coverId: profile.coverId,
  avatarId: profile.avatarId,
  avatarFocalPoint: profile.avatarFocalPoint,
  coverFocalPoint: profile.coverFocalPoint,
  avatarUrl: profileImageUrl(profile.accountId, 'avatar', profile.avatarImage),
  coverUrl: profileImageUrl(profile.accountId, 'cover', profile.coverImage),
  publicProfile: false,
})
const directoryProfile = (profile: NonNullable<Awaited<ReturnType<typeof repo.findProfile>>>) => ({ accountId: profile.accountId, displayName: profile.displayName, bio: profile.bio, genres: profile.genres, avatarId: profile.avatarId, coverId: profile.coverId, avatarFocalPoint: profile.avatarFocalPoint, coverFocalPoint: profile.coverFocalPoint, avatarUrl: profileImageUrl(profile.accountId, 'avatar', profile.avatarImage), coverUrl: profileImageUrl(profile.accountId, 'cover', profile.coverImage) })
const unauthorized = (res: ServerResponse, id: string, origin?: string) => json(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida.' }, requestId: id }, id, origin)
const adminOnly = (account: Awaited<ReturnType<typeof auth.accountFor>>, res: ServerResponse, id: string, origin?: string): boolean => { if (!account) { unauthorized(res, id, origin); return false }; if (account.role !== 'admin') { json(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Acceso no autorizado.' }, requestId: id }, id, origin); return false }; return true }
const staffOnly = (account: Awaited<ReturnType<typeof auth.accountFor>>, res: ServerResponse, id: string, origin?: string): boolean => { if (!account) { unauthorized(res, id, origin); return false }; if (account.role !== 'admin' && account.role !== 'community_manager') { json(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Acceso no autorizado.' }, requestId: id }, id, origin); return false }; return true }
const socialCursor = (value: string | null): SocialPostCursor | undefined => {
  if (!value) return undefined
  if (value.length > 512) throw new ValidationError('cursor', 'Cursor de publicaciones inválido.')
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<SocialPostCursor>
    if (typeof parsed.createdAt !== 'string' || !Number.isFinite(Date.parse(parsed.createdAt)) || typeof parsed.id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(parsed.id)) throw new Error()
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch { throw new ValidationError('cursor', 'Cursor de publicaciones inválido.') }
}
const encodeSocialCursor = (cursor: SocialPostCursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url')
const notificationCursor = (value: string | null): NotificationCursor | undefined => {
  if (!value) return undefined
  if (value.length > 512) throw new ValidationError('cursor', 'Cursor de notificaciones inválido.')
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!isNotificationCursor(parsed)) throw new Error()
    return parsed
  } catch { throw new ValidationError('cursor', 'Cursor de notificaciones inválido.') }
}
const encodeNotificationCursor = (cursor: NotificationCursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url')
const limited = (res: ServerResponse, id: string, origin?: string) => json(res, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Inténtalo más tarde.' }, requestId: id }, id, origin)
const sellerListingRevisionAt = (contentId: string, updatedAt: string) => audit.entries
  .filter(event => event.metadata.resource === 'marketplace-seller-evidence' && event.metadata.contentId === contentId)
  .reduce((latest, event) => Math.max(latest, Date.parse(event.timestamp) || 0), Date.parse(updatedAt) || 0)
const latestMarketplaceReview = (contentId: string, action: 'marketplace_review_recommendation' | 'marketplace_admin_decision') => audit.entries
  .filter(event => event.action === action && event.targetId === contentId).at(-1)
const validatePromotionInput = (value: unknown): PromotionInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('body', 'Invalid promotion data.')
  const input = value as Record<string, unknown>
  const startsAt = input.startsAt === '' || input.startsAt === null ? undefined : input.startsAt
  const endsAt = input.endsAt === '' || input.endsAt === null ? undefined : input.endsAt
  const candidate = { id: 'validation', name: typeof input.name === 'string' ? input.name.trim() : '', scope: input.scope, percentOff: input.percentOff, startsAt, endsAt, enabled: input.enabled, createdAt: 'now', updatedAt: 'now', updatedBy: 'admin' }
  if (!isPromotionScope(candidate.scope) || !isPromotionRule(candidate as PromotionRule)) throw new ValidationError('promotion', 'Enter a valid name, scope, 1-75 percent discount, and a valid date range.')
  return { name: candidate.name, scope: candidate.scope, percentOff: candidate.percentOff as number, ...(typeof startsAt === 'string' ? { startsAt } : {}), ...(typeof endsAt === 'string' ? { endsAt } : {}), enabled: candidate.enabled as boolean }
}
const marketplaceReviewQueue = async () => {
  const [catalog, listings] = await Promise.all([repo.listCatalog(), repo.listAllBeatListingDrafts()])
  const data = []
  for (const listing of listings) {
    const entry = catalog.find(item => item.contentId === listing.contentId && item.type === 'beat')
    if (!entry) continue
    const recommendation = latestMarketplaceReview(listing.contentId, 'marketplace_review_recommendation')
    const finalDecision = latestMarketplaceReview(listing.contentId, 'marketplace_admin_decision')
    const revisionAt = sellerListingRevisionAt(listing.contentId, listing.updatedAt)
    const evidence = (await repo.listSellerEvidence(listing.contentId, listing.ownerId)).map(sellerEvidenceView)
    const recommendationCurrent = Boolean(recommendation && Date.parse(recommendation.timestamp) >= revisionAt)
    const listingWithEvidence: BeatListingRecord = { ...listing, rights: { ...listing.rights, sampleProofAvailable: listing.rights.sampleDisclosure === 'licensed' && evidence.length > 0 } }
    const adminReview = finalDecision ? {
      decision: finalDecision.metadata.decision as 'approve' | 'reject' | 'request-changes',
      note: String(finalDecision.metadata.note || ''),
      reviewerId: finalDecision.actorId || '',
      createdAt: finalDecision.timestamp,
      current: Date.parse(finalDecision.timestamp) >= revisionAt,
    } : undefined
    data.push({
      listing: { ...listingWithEvidence, ...(adminReview ? { adminReview } : {}) },
      title: entry.title,
      creatorId: listing.ownerId,
      readyForFinalReview: isBeatListingReady(listingWithEvidence),
      evidence,
      recommendationCurrent,
      latestRecommendation: recommendation ? { decision: recommendation.metadata.decision, note: recommendation.metadata.note, reviewerId: recommendation.actorId, createdAt: recommendation.timestamp } : undefined,
      latestAdminDecision: adminReview,
    })
  }
  return data
}
const sellerListingWithAdminReview = (listing: BeatListingRecord): BeatListingRecord => {
  const revisionAt = sellerListingRevisionAt(listing.contentId, listing.updatedAt)
  const recommendation = latestMarketplaceReview(listing.contentId, 'marketplace_review_recommendation')
  const adminDecision = latestMarketplaceReview(listing.contentId, 'marketplace_admin_decision')
  return {
    ...listing,
    ...(recommendation ? { communityReview: { decision: recommendation.metadata.decision as 'recommend' | 'request-changes', note: String(recommendation.metadata.note || ''), reviewerId: recommendation.actorId || '', createdAt: recommendation.timestamp, current: Date.parse(recommendation.timestamp) >= revisionAt } } : {}),
    ...(adminDecision ? { adminReview: { decision: adminDecision.metadata.decision as 'approve' | 'reject' | 'request-changes', note: String(adminDecision.metadata.note || ''), reviewerId: adminDecision.actorId || '', createdAt: adminDecision.timestamp, current: Date.parse(adminDecision.timestamp) >= revisionAt } } : {}),
  }
}
export const server = createServer(async (req, res) => { const id = req.headers['x-request-id']?.toString() || randomUUID(); const path = req.url?.split('?')[0]; const requestOrigin = req.headers.origin?.toString(); try {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  if (!isAllowedOrigin(requestOrigin, config.corsOrigins)) return json(res, 403, { ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin no permitido.' }, requestId: id }, id, undefined)
  if (requestOrigin) { res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin') }
  if (req.method === 'OPTIONS') return json(res, 204, null, id, requestOrigin)
   if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, data: { status: 'ok', service: 'beatvault-local-api' }, requestId: id }, id, requestOrigin)
   if (req.method === 'GET' && path === '/api/currency-rates') {
     try { return json(res, 200, { ok: true, data: await getEcbReferenceRates(), requestId: id }, id, requestOrigin) }
     catch { return json(res, 503, { ok: false, error: { code: 'FX_UNAVAILABLE', message: 'Reference exchange rates are temporarily unavailable.' }, requestId: id }, id, requestOrigin) }
   }
   if (req.method === 'GET' && path === '/api/ready') { const ready = await runtime.checkDatabase(); return json(res, ready ? 200 : 503, { ok: ready, data: { status: ready ? 'ready' : 'unavailable', storageBackend: config.storageBackend }, requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/webhooks/stripe') {
     if (!stripeConnect || !config.stripe.webhookSecret) return json(res, 503, { ok: false, error: { code: 'STRIPE_DISABLED', message: 'Stripe test integration is not configured.' }, requestId: id }, id, requestOrigin)
     const signature = req.headers['stripe-signature']
     if (typeof signature !== 'string') return json(res, 400, { ok: false, error: { code: 'STRIPE_SIGNATURE_REQUIRED', message: 'Stripe signature is required.' }, requestId: id }, id, requestOrigin)
     try {
        const rawBody = await readRawBody(req)
        let result = await stripeConnect.handleWebhook(rawBody, signature, config.stripe.webhookSecret)
        if (result === 'ignored' && stripePayments) result = await stripePayments.handleWebhook(rawBody, signature, config.stripe.webhookSecret)
       return json(res, 200, { received: result !== 'ignored', ignored: result === 'ignored', duplicate: result === 'duplicate' }, id, requestOrigin)
     } catch (error) {
       if (error instanceof HttpInputError) throw error
       const invalidSignature = error instanceof Stripe.errors.StripeSignatureVerificationError
       return json(res, invalidSignature ? 400 : 500, { ok: false, error: { code: invalidSignature ? 'STRIPE_SIGNATURE_INVALID' : 'STRIPE_WEBHOOK_FAILED', message: invalidSignature ? 'Stripe signature verification failed.' : 'Stripe webhook processing failed.' }, requestId: id }, id, requestOrigin)
     }
   }
   if (req.method === 'POST' && path === '/api/auth/register') { const input = validateRegister(await body(req)); if (!limiter.allow(`register:${clientAddress(req, config.trustProxyHeaders)}`)) return limited(res, id, requestOrigin); try { const result = await auth.register(input.email, input.password); return json(res, 201, { ok: true, data: result, requestId: id }, id, requestOrigin) } catch (error) { if (error instanceof Error && error.message === 'DUPLICATE_ACCOUNT') return json(res, 409, { ok: false, error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'No se pudo crear la cuenta con esos datos.' }, requestId: id }, id, requestOrigin); throw error } }
   if (req.method === 'POST' && (path === '/api/auth/verify/request' || path === '/api/auth/password-reset/request')) { if (!limiter.allow(`recovery:${clientAddress(req, config.trustProxyHeaders)}`)) return limited(res, id, requestOrigin); const email = validateEmail(await body(req)); const kind = path.includes('verify') ? 'verify' : 'reset'; const token = await auth.issueToken(email, kind); const data = config.devAuthTokens && token ? { devOnlyToken: token } : null; return json(res, 200, { ok: true, data, message: 'Si la cuenta existe, recibirás instrucciones.', requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/verify/confirm') { const confirmed = await auth.confirmVerification(validateToken(await body(req))); return confirmed ? json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin) : json(res, 400, { ok: false, error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token inválido o expirado.' }, requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/password-reset/confirm') { const input = validateTokenPassword(await body(req)); const changed = await auth.resetPassword(input.token, input.password); return changed ? json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin) : json(res, 400, { ok: false, error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token inválido o expirado.' }, requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/login') { if (!limiter.allow(`login:${clientAddress(req, config.trustProxyHeaders)}`)) return limited(res, id, requestOrigin); const value = await body(req); const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}; if (typeof input.email !== 'string' || typeof input.password !== 'string') throw new ValidationError('credentials', 'Credenciales inválidas.'); const result = await auth.login(input.email, input.password); if (!result) { audit.record('login_failure', id); return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' }, requestId: id }, id, requestOrigin) }; audit.record('login_success', id, result.id); const secure = config.cookie.secure ? '; Secure' : ''; const attributes = `SameSite=${config.cookie.sameSite}; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure}`; return json(res, 200, { ok: true, data: { id: result.id, email: result.email, role: result.role, verificationState: result.verificationState }, requestId: id }, id, requestOrigin, [`${sessionCookie}=${result.token}; HttpOnly; ${attributes}`, `${csrfCookie}=${result.csrfToken}; ${attributes}`]) }
  const session = cookie(req, sessionCookie); const account = await auth.accountFor(session)
  const isAcceptedFriend = async (viewerId: string | undefined, authorId: string) => Boolean(viewerId && (await repo.listFriendships(viewerId)).some(item => item.status === 'accepted' && (item.requesterId === viewerId && item.recipientId === authorId || item.recipientId === viewerId && item.requesterId === authorId)))
  const canViewProfile = async (profile: CreatorProfile, viewerId?: string) => profile.publicProfile || profile.accountId === viewerId || await isAcceptedFriend(viewerId, profile.accountId)
  const socialCanRead = async (post: SocialPost, viewerId?: string, viewerRole?: string) => {
    if (post.visibility === 'pending-review') return viewerId === post.authorId || viewerRole === 'admin' || viewerRole === 'community_manager'
    if (post.visibility !== 'published') return viewerId === post.authorId || viewerRole === 'admin'
    if (viewerId === post.authorId) return true
    if (post.audience === 'private') return viewerId === post.authorId
    if (post.audience === 'friends') return isAcceptedFriend(viewerId, post.authorId)
    const author = await repo.findProfile(post.authorId)
    return Boolean(author?.publicProfile) || isAcceptedFriend(viewerId, post.authorId)
  }
  const socialPostInteractions = async (postId: string, actorId: string, commentLimit = 100): Promise<SocialPostInteractionSnapshot> => {
    const [comments, reactions] = await Promise.all([repo.listSocialPostComments(postId, commentLimit), repo.getSocialPostReactionSummary(postId, actorId)])
    const visibleComments = await Promise.all(comments.map(async comment => {
      const profile = await repo.findProfile(comment.authorId)
      const canIdentifyAuthor = comment.authorId === actorId || Boolean(profile?.publicProfile) || await isAcceptedFriend(actorId, comment.authorId)
      return {
        id: comment.id,
        authorId: canIdentifyAuthor ? comment.authorId : 'private-creator',
        authorName: canIdentifyAuthor ? profile?.displayName || 'BeatVault creator' : 'BeatVault creator',
        body: comment.body,
        createdAt: comment.createdAt,
      }
    }))
    return { comments: visibleComments, reactionCount: reactions.reactionCount, reactedByMe: reactions.reactedByMe }
  }
  const socialPostPage = async (posts: SocialPost[], viewerId?: string, viewerRole?: string) => {
    const visible = []
    for (const post of posts) if (await socialCanRead(post, viewerId, viewerRole)) visible.push(socialPostView(post, await repo.findProfile(post.authorId)))
    return visible
  }
  if (path === '/api/account/social-state' && req.method === 'GET') {
    if (!account) return unauthorized(res, id, requestOrigin)
    const data = await repo.getSocialAccountState(account.id)
    return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
  }
  const followMatch = path?.match(/^\/api\/follows\/([a-zA-Z0-9_-]{1,80})$/)
  if (followMatch && ['PUT', 'DELETE'].includes(req.method || '')) {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    if (!socialRelationshipLimiter.allow(account.id)) return limited(res, id, requestOrigin)
    const followingId = followMatch[1]
    if (req.method === 'PUT') {
      if (followingId === account.id) return json(res, 400, { ok: false, error: { code: 'SOCIAL_SELF_FOLLOW', message: 'No puedes seguir tu propia cuenta.' }, requestId: id }, id, requestOrigin)
      const target = await repo.findAccountById(followingId)
      const targetProfile = target ? await repo.findProfile(followingId) : undefined
      if (!target || !targetProfile || !(await canViewProfile(targetProfile, account.id))) return json(res, 404, { ok: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil no disponible para seguir.' }, requestId: id }, id, requestOrigin)
      try { await repo.followSocialAccount(account.id, followingId, socialFollowLimit) }
      catch (error) {
        if (error instanceof Error && error.message === 'SOCIAL_FOLLOW_LIMIT') return json(res, 409, { ok: false, error: { code: 'SOCIAL_FOLLOW_LIMIT', message: 'Alcanzaste el límite de 500 cuentas seguidas.' }, requestId: id }, id, requestOrigin)
        throw error
      }
      return json(res, 200, { ok: true, data: { following: true }, requestId: id }, id, requestOrigin)
    }
    await repo.unfollowSocialAccount(account.id, followingId)
    return json(res, 200, { ok: true, data: { following: false }, requestId: id }, id, requestOrigin)
  }
  const bookmarkMatch = path?.match(/^\/api\/posts\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/bookmark$/i)
  if (bookmarkMatch && ['PUT', 'DELETE'].includes(req.method || '')) {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    if (!socialRelationshipLimiter.allow(account.id)) return limited(res, id, requestOrigin)
    const postId = bookmarkMatch[1]
    if (req.method === 'PUT') {
      const post = await repo.findSocialPost(postId)
      if (!post || post.visibility !== 'published' || !(await socialCanRead(post, account.id, account.role))) return json(res, 404, { ok: false, error: { code: 'POST_NOT_FOUND', message: 'Publicación no disponible para guardar.' }, requestId: id }, id, requestOrigin)
      try { await repo.bookmarkSocialPost(account.id, post.id, socialBookmarkLimit) }
      catch (error) {
        if (error instanceof Error && error.message === 'SOCIAL_BOOKMARK_LIMIT') return json(res, 409, { ok: false, error: { code: 'SOCIAL_BOOKMARK_LIMIT', message: 'Alcanzaste el límite de 1,000 publicaciones guardadas.' }, requestId: id }, id, requestOrigin)
        throw error
      }
      return json(res, 200, { ok: true, data: { bookmarked: true }, requestId: id }, id, requestOrigin)
    }
    await repo.unbookmarkSocialPost(account.id, postId)
    return json(res, 200, { ok: true, data: { bookmarked: false }, requestId: id }, id, requestOrigin)
  }
  const collectSocialPage = async (options: { authorId?: string; cursor?: SocialPostCursor; limit: number; viewerId?: string; viewerRole?: string; publishedOnly?: boolean }) => {
    const pageSize = 50
    const scanCap = 200
    let scanned = 0
    let cursor = options.cursor
    let hasMore = false
    const posts: ReturnType<typeof socialPostView>[] = []
    while (scanned < scanCap && posts.length <= options.limit) {
      const take = Math.min(pageSize, scanCap - scanned)
      const batch = await repo.listSocialPosts({ authorId: options.authorId, cursor, limit: take, publishedOnly: options.publishedOnly })
      if (!batch.length) break
      for (const post of batch) {
        if (post.visibility === 'published' && await socialCanRead(post, options.viewerId, options.viewerRole)) {
          if (posts.length === options.limit) { hasMore = true; break }
          posts.push(socialPostView(post, await repo.findProfile(post.authorId)))
        }
        cursor = { createdAt: post.createdAt, id: post.id }
        scanned += 1
        if (scanned >= scanCap) { hasMore = true; break }
      }
      if (hasMore) break
      if (batch.length < take) break
    }
    return { posts: posts.slice(0, options.limit), ...(hasMore && cursor ? { nextCursor: encodeSocialCursor(cursor) } : {}) }
  }
  if ((path === '/api/feed' || path === '/api/posts') && req.method === 'GET') {
    if (!socialFeedLimiter.allow(clientAddress(req, config.trustProxyHeaders))) return limited(res, id, requestOrigin)
    const params = new URL(req.url || '/', 'http://localhost').searchParams
    const limit = Number(params.get('limit') || 20)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ValidationError('limit', 'El límite debe estar entre 1 y 50.')
    const cursor = socialCursor(params.get('cursor'))
    const data = await collectSocialPage({ limit, cursor, viewerId: account?.id, viewerRole: account?.role, publishedOnly: true })
    return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
  }
  if (path === '/api/posts/interactions' && req.method === 'GET') {
    if (!account) return unauthorized(res, id, requestOrigin)
    const params = new URL(req.url || '/', 'http://localhost').searchParams
    const ids = params.getAll('id')
    const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
    if ([...params.keys()].some(key => key !== 'id') || ids.length < 1 || ids.length > socialPostInteractionBatchLimit || ids.some(postId => !uuid.test(postId)) || new Set(ids).size !== ids.length) {
      throw new ValidationError('ids', `Se requieren de 1 a ${socialPostInteractionBatchLimit} IDs de publicación únicos y válidos.`)
    }
    if (!socialPostInteractionBatchLimiter.allow(account.id, ids.length)) return limited(res, id, requestOrigin)
    const entries = await Promise.all(ids.map(async postId => {
      const post = await repo.findSocialPost(postId)
      if (!post || post.visibility !== 'published' || !(await socialCanRead(post, account!.id, account!.role))) return undefined
      return [post.id, await socialPostInteractions(post.id, account!.id, socialPostInteractionBatchCommentLimit)] as const
    }))
    return json(res, 200, { ok: true, data: { items: Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) }, requestId: id }, id, requestOrigin)
  }
  const profilePostsMatch = path?.match(/^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})\/posts$/)
  if (profilePostsMatch && req.method === 'GET') {
    if (!socialFeedLimiter.allow(clientAddress(req, config.trustProxyHeaders))) return limited(res, id, requestOrigin)
    const authorId = profilePostsMatch[1]
    const profile = await repo.findProfile(authorId)
    if (!profile || !(await canViewProfile(profile, account?.id))) return json(res, 404, { ok: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil no disponible.' }, requestId: id }, id, requestOrigin)
    const params = new URL(req.url || '/', 'http://localhost').searchParams
    const limit = Number(params.get('limit') || 20)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ValidationError('limit', 'El límite debe estar entre 1 y 50.')
    const data = await collectSocialPage({ authorId, cursor: socialCursor(params.get('cursor')), limit, viewerId: account?.id, viewerRole: account?.role })
    return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
  }
  if (req.method === 'POST' && path === '/api/posts') {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    if (!socialPostLimiter.allow(account.id)) return limited(res, id, requestOrigin)
    let kind: SocialPost['kind']
    let bodyText: string
    let audience: SocialAudience
    let media: SocialPost['media']
    if (req.headers['content-type']?.split(';')[0]?.toLowerCase() === 'multipart/form-data') {
      const existingMedia = (await repo.listSocialPosts({ authorId: account.id, limit: 100000 })).reduce((sum, post) => sum + (post.media?.sizeBytes || 0), 0)
      if (existingMedia >= socialMediaAccountMaxBytes) return json(res, 409, { ok: false, error: { code: 'SOCIAL_MEDIA_QUOTA_EXCEEDED', message: 'Alcanzaste el límite de almacenamiento social de 512 MB.' }, requestId: id }, id, requestOrigin)
      const accountRelease = socialMediaAccountConcurrency.acquire(account.id)
      if (!accountRelease) return json(res, 429, { ok: false, error: { code: 'SOCIAL_MEDIA_ACCOUNT_BUSY', message: 'Ya hay un archivo social procesándose para esta cuenta.' }, requestId: id }, id, requestOrigin)
      const globalRelease = socialMediaConcurrency.acquire('global')
      if (!globalRelease) { accountRelease(); return json(res, 429, { ok: false, error: { code: 'SOCIAL_MEDIA_BUSY', message: 'El procesamiento multimedia está ocupado.' }, requestId: id }, id, requestOrigin) }
      let received: Awaited<ReturnType<typeof receiveSocialPostMedia>> | undefined
      try {
        const probeKind = req.headers['x-social-post-kind']
        if (probeKind !== 'photo' && probeKind !== 'video') throw new HttpInputError(400, 'SOCIAL_POST_KIND_INVALID', 'Indica photo o video en X-Social-Post-Kind.')
        kind = probeKind
        const result = await receiveSocialPostMedia(req, account.id, kind)
        received = result
        media = result.media
        bodyText = result.body
        audience = result.audience
      } finally { globalRelease(); accountRelease() }
      if (!received) throw new HttpInputError(400, 'SOCIAL_MEDIA_REQUIRED', 'No se recibió el archivo social.')
    } else {
      const value = await body(req)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('body', 'Datos de publicación inválidos.')
      const input = value as Record<string, unknown>
      if (Object.keys(input).some(key => !['kind', 'body', 'audience'].includes(key))) throw new ValidationError('body', 'Campos de publicación no admitidos.')
      if (input.kind !== 'status' || typeof input.body !== 'string' || typeof input.audience !== 'string') throw new ValidationError('post', 'Por ahora los estados requieren texto y audiencia válidos.')
      kind = input.kind
      bodyText = input.body.trim()
      audience = input.audience as SocialAudience
    }
    if (kind !== 'status' && kind !== 'photo' && kind !== 'video' || !['public', 'friends', 'private'].includes(audience) || !bodyText.trim() || bodyText.trim().length > 600) {
      if (media) await removeSocialPostMedia({ media })
      throw new ValidationError('post', 'La publicación requiere texto de hasta 600 caracteres y una audiencia válida.')
    }
    const profile = await repo.findProfile(account.id) || emptyProfile(account.id)
    const now = new Date().toISOString()
    const post: SocialPost = { id: randomUUID(), authorId: account.id, kind, body: bodyText.trim(), audience, visibility: 'published', ...(media ? { media } : {}), createdAt: now, updatedAt: now }
    try {
      await repo.createSocialPost(post, socialMediaAccountMaxBytes)
      await audit.recordAndWait('create', id, account.id, post.id, true, { resource: 'social-post', audience, visibility: post.visibility })
    } catch (error) { await repo.deleteSocialPost(post.id, account.id); if (media) await removeSocialPostMedia({ media }); throw error }
    return json(res, 201, { ok: true, data: socialPostView(post, profile), requestId: id }, id, requestOrigin)
  }
  const socialPostInteractionMatch = path?.match(/^\/api\/posts\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/(social|comments|reaction)$/i)
  if (socialPostInteractionMatch && (req.method === 'GET' && socialPostInteractionMatch[2] === 'social' || req.method === 'POST' && ['comments', 'reaction'].includes(socialPostInteractionMatch[2]))) {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (!socialPostInteractionLimiter.allow(account.id)) return limited(res, id, requestOrigin)
    const post = await repo.findSocialPost(socialPostInteractionMatch[1])
    if (!post || post.visibility !== 'published' || !(await socialCanRead(post, account.id, account.role))) {
      return json(res, 404, { ok: false, error: { code: 'POST_NOT_FOUND', message: 'Publicación no disponible.' }, requestId: id }, id, requestOrigin)
    }
    if (req.method === 'GET') {
      const data = await socialPostInteractions(post.id, account.id)
      return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
    }
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id, }, id, requestOrigin)
    if (socialPostInteractionMatch[2] === 'comments') {
      const input = await body(req)
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'body') || typeof (input as Record<string, unknown>).body !== 'string') throw new ValidationError('comment', 'El comentario debe ser texto de 1 a 500 caracteres.')
      const commentBody = ((input as Record<string, string>).body).trim()
      if (!commentBody || commentBody.length > 500) throw new ValidationError('comment', 'El comentario debe ser texto de 1 a 500 caracteres.')
      const commentInput = { id: randomUUID(), postId: post.id, authorId: account.id, body: commentBody, createdAt: new Date().toISOString() }
      const result = await repo.createSocialPostCommentWithNotification(commentInput, notificationSeed('social_post_comment', 'post', post.id, commentInput.id))
      const comment = result.value
      await audit.recordAndWait('create', id, account.id, post.id, true, { resource: 'social-post-comment', commentId: comment.id })
      publishNotifications(result.notifications)
      const data = await socialPostInteractions(post.id, account.id)
      return json(res, 201, { ok: true, data, requestId: id }, id, requestOrigin)
    }
    const input = await body(req)
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input as Record<string, unknown>).length !== 0) throw new ValidationError('reaction', 'La reacción no admite campos adicionales.')
    const result = await repo.toggleSocialPostReactionWithNotification(post.id, account.id, notificationSeed('social_post_reaction', 'post', post.id, `${post.id}:${account.id}`))
    const reacted = result.value
    await audit.recordAndWait('update', id, account.id, post.id, true, { resource: 'social-post-reaction', reacted })
    publishNotifications(result.notifications)
    const reactions = await repo.getSocialPostReactionSummary(post.id, account.id)
    const data: SocialPostReactionResult = { reacted, reactionCount: reactions.reactionCount }
    return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
  }
  const socialMediaMatch = path?.match(/^\/api\/posts\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/media$/i)
  if (socialMediaMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const post = await repo.findSocialPost(socialMediaMatch[1])
    if (!post?.media || !(await socialCanRead(post, account?.id, account?.role))) return json(res, 404, { ok: false, error: { code: 'POST_MEDIA_NOT_FOUND', message: 'Contenido no disponible.' }, requestId: id }, id, requestOrigin)
    const media = await readSocialPostMedia(post)
    if (!media) return json(res, 404, { ok: false, error: { code: 'POST_MEDIA_NOT_FOUND', message: 'Contenido no disponible.' }, requestId: id }, id, requestOrigin)
    res.writeHead(200, { 'Content-Type': media.mimeType, 'Content-Length': media.size, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" })
    if (req.method === 'HEAD') return res.end()
    const stream = createReadStream(media.path); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); return stream.pipe(res)
  }
  const socialPostMatch = path?.match(/^\/api\/posts\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i)
  if (socialPostMatch && req.method === 'DELETE') {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    const deleted = await repo.deleteSocialPost(socialPostMatch[1], account.id)
    if (!deleted) return json(res, 404, { ok: false, error: { code: 'POST_NOT_FOUND', message: 'Publicación no disponible.' }, requestId: id }, id, requestOrigin)
    await removeSocialPostMedia(deleted)
    await audit.recordAndWait('delete', id, account.id, deleted.id, true, { resource: 'social-post' })
    return json(res, 200, { ok: true, data: { id: deleted.id }, requestId: id }, id, requestOrigin)
  }
  const socialPostReportMatch = path?.match(/^\/api\/posts\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/reports$/i)
  if (socialPostReportMatch && req.method === 'POST') {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    if (!socialReportLimiter.allow(account.id)) return limited(res, id, requestOrigin)
    const post = await repo.findSocialPost(socialPostReportMatch[1])
    if (!post || post.authorId === account.id || post.visibility !== 'published' || !(await socialCanRead(post, account.id, account.role))) return json(res, 404, { ok: false, error: { code: 'POST_NOT_FOUND', message: 'Publicación no disponible para reportar.' }, requestId: id }, id, requestOrigin)
    const value = await body(req) as Record<string, unknown>
    const reasons = ['spam', 'harassment', 'copyright', 'nudity', 'violence', 'other']
    if (!value || !reasons.includes(String(value.reason)) || typeof value.details !== 'string' || value.details.trim().length > 500) throw new ValidationError('report', 'Motivo o detalle del reporte inválido.')
    const report: SocialPostReport = { id: randomUUID(), postId: post.id, reporterId: account.id, reason: value.reason as SocialPostReport['reason'], details: value.details.trim(), status: 'open', createdAt: new Date().toISOString() }
    const created = await repo.createSocialPostReport(report)
    try { await audit.recordAndWait('create', id, account.id, post.id, true, { resource: 'social-post-report', reportId: created.id, reason: created.reason }) }
    catch (error) { await repo.deleteSocialPostReport(created.id, account.id); throw error }
    return json(res, 201, { ok: true, data: { id: created.id, status: created.status }, requestId: id }, id, requestOrigin)
  }
  if (path === '/api/social-moderation/posts' && req.method === 'GET') {
    if (!staffOnly(account, res, id, requestOrigin)) return
    const posts = await repo.listSocialPosts({ limit: 100, moderationOnly: true })
    return json(res, 200, { ok: true, data: { posts: await socialPostPage(posts, account!.id, account!.role) }, requestId: id }, id, requestOrigin)
  }
  const socialModerationPostMatch = path?.match(/^\/api\/social-moderation\/posts\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i)
  if (socialModerationPostMatch && req.method === 'PATCH') {
    if (!staffOnly(account, res, id, requestOrigin)) return
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    const input = await body(req) as Record<string, unknown>
    if (!input || !['published', 'rejected', 'removed'].includes(String(input.status)) || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 500))) throw new ValidationError('moderation', 'Decisión de moderación inválida.')
    const updated = await repo.reviewSocialPost(socialModerationPostMatch[1], input.status as 'published' | 'rejected' | 'removed', account!.id, typeof input.note === 'string' ? input.note.trim() : undefined)
    if (!updated) return json(res, 404, { ok: false, error: { code: 'POST_NOT_REVIEWABLE', message: 'Publicación no disponible para moderación.' }, requestId: id }, id, requestOrigin)
    await audit.recordAndWait('update', id, account!.id, updated.id, true, { resource: 'social-post-moderation', decision: updated.visibility, note: updated.reviewNote || '' })
    return json(res, 200, { ok: true, data: socialPostView(updated, await repo.findProfile(updated.authorId)), requestId: id }, id, requestOrigin)
  }
  if (path === '/api/social-moderation/reports' && req.method === 'GET') {
    if (!staffOnly(account, res, id, requestOrigin)) return
    const reports = await repo.listSocialPostReports('open')
    const data = await Promise.all(reports.map(async report => { const post = await repo.findSocialPost(report.postId); return { ...report, post: post ? socialPostView(post, await repo.findProfile(post.authorId)) : undefined } }))
    return json(res, 200, { ok: true, data: { reports: data }, requestId: id }, id, requestOrigin)
  }
  const socialReportReviewMatch = path?.match(/^\/api\/social-moderation\/reports\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i)
  if (socialReportReviewMatch && req.method === 'PATCH') {
    if (!staffOnly(account, res, id, requestOrigin)) return
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    const input = await body(req) as Record<string, unknown>
    if (!input || !['reviewed', 'dismissed'].includes(String(input.status))) throw new ValidationError('report', 'Decisión de reporte inválida.')
    const updated = await repo.reviewSocialPostReport(socialReportReviewMatch[1], input.status as 'reviewed' | 'dismissed', account!.id)
    if (!updated) return json(res, 404, { ok: false, error: { code: 'REPORT_NOT_OPEN', message: 'Reporte no disponible.' }, requestId: id }, id, requestOrigin)
    await audit.recordAndWait('update', id, account!.id, updated.postId, true, { resource: 'social-post-report-review', reportId: updated.id, decision: updated.status })
    return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin)
  }
  if (path === '/api/connect/account' && req.method === 'GET') {
    if (!account) return unauthorized(res, id, requestOrigin)
    const connected = await stripeConnect?.status(account.id)
    return json(res, 200, { ok: true, data: { enabled: Boolean(stripeConnect), connected: Boolean(connected && !connected.deauthorized), chargesEnabled: connected?.chargesEnabled ?? false, payoutsEnabled: connected?.payoutsEnabled ?? false, detailsSubmitted: connected?.detailsSubmitted ?? false, deauthorized: connected?.deauthorized ?? false }, requestId: id }, id, requestOrigin)
  }
   if (req.method === 'POST' && path === '/api/connect/onboarding') {
    if (!account) return unauthorized(res, id, requestOrigin)
    if (account.role !== 'creator') return json(res, 403, { ok: false, error: { code: 'CREATOR_ACCOUNT_REQUIRED', message: 'A creator account is required.' }, requestId: id }, id, requestOrigin)
    if (!stripeConnect) return json(res, 503, { ok: false, error: { code: 'STRIPE_DISABLED', message: 'Stripe test integration is not configured.' }, requestId: id }, id, requestOrigin)
    if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
    if (!limiter.allow(`stripe-connect:${account.id}`)) return limited(res, id, requestOrigin)
    const url = await stripeConnect.createOnboardingLink(account.id, account.email)
    return json(res, 200, { ok: true, data: { url }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/orders' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const orders = await repo.listBeatOrders(account.id)
     return json(res, 200, { ok: true, data: orders.map(order => ({ id: order.id, title: order.title, offerId: order.offerId, amountMinor: order.amountMinor, currency: order.currency, status: order.status, createdAt: order.createdAt, paidAt: order.paidAt, downloadUrl: order.status === 'paid' ? `/api/orders/${encodeURIComponent(order.id)}/download` : undefined })), requestId: id }, id, requestOrigin)
   }
   const orderDownloadMatch = path?.match(/^\/api\/orders\/([a-f0-9-]{36})\/download$/i)
   if (orderDownloadMatch && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const order = await repo.findBeatOrder(validateCatalogId(orderDownloadMatch[1]))
     if (!order || order.buyerId !== account.id || order.status !== 'paid') return json(res, 404, { ok: false, error: { code: 'ORDER_DOWNLOAD_NOT_FOUND', message: 'No se encontró una compra descargable.' }, requestId: id }, id, requestOrigin)
     const entry = (await repo.listCatalog()).find(item => item.contentId === order.contentId && item.creatorId === order.sellerId)
     const asset = entry?.assetId ? await repo.findAsset(entry.assetId, order.sellerId) : undefined
     if (!asset || asset.state !== 'available') return json(res, 410, { ok: false, error: { code: 'PURCHASE_FILE_UNAVAILABLE', message: 'El archivo comprado ya no está disponible.' }, requestId: id }, id, requestOrigin)
     const info = await stat(assetPath(asset)).catch(() => undefined)
     if (!info?.isFile()) return json(res, 410, { ok: false, error: { code: 'PURCHASE_FILE_UNAVAILABLE', message: 'El archivo comprado ya no está disponible.' }, requestId: id }, id, requestOrigin)
     res.writeHead(200, { 'Content-Type': asset.mimeType, 'Content-Length': info.size, 'Content-Disposition': `attachment; filename="${encodeURIComponent(asset.originalName)}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' })
     const stream = createReadStream(assetPath(asset))
     stream.on('error', () => res.destroy())
     res.once('close', () => stream.destroy())
     return stream.pipe(res)
   }
   const beatCheckoutMatch = path?.match(/^\/api\/checkout\/beats\/([a-f0-9-]{36})$/i)
   if (beatCheckoutMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     if (!stripePayments) return json(res, 503, { ok: false, error: { code: 'STRIPE_PAYMENTS_DISABLED', message: 'Configura las tarifas de Stripe de prueba para habilitar compras.' }, requestId: id }, id, requestOrigin)
     if (!limiter.allow(`beat-checkout:${account.id}`)) return limited(res, id, requestOrigin)
     const orderId = req.headers['idempotency-key']?.toString()
     if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new ValidationError('idempotencyKey', 'A valid checkout idempotency key is required.')
     const input = await body(req)
     if (!input || typeof input !== 'object' || typeof (input as Record<string, unknown>).offerId !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test((input as Record<string, string>).offerId)) throw new ValidationError('offerId', 'Selecciona una oferta válida.')
     const contentId = validateCatalogId(beatCheckoutMatch[1])
     const entry = (await repo.listCatalog()).find(item => item.contentId === contentId && item.type === 'beat' && item.publicationStatus === 'published')
     if (!entry || entry.creatorId === account.id) return json(res, 404, { ok: false, error: { code: 'BEAT_NOT_FOR_SALE', message: 'Este beat no está disponible para compra.' }, requestId: id }, id, requestOrigin)
     const listing = await repo.findBeatListingDraft(contentId, entry.creatorId)
     if (!listing) return json(res, 404, { ok: false, error: { code: 'BEAT_NOT_FOR_SALE', message: 'Este beat no está disponible para compra.' }, requestId: id }, id, requestOrigin)
     const evidence = await repo.listSellerEvidence(contentId, entry.creatorId)
     const reviewed = sellerListingWithAdminReview({ ...listing, rights: { ...listing.rights, sampleProofAvailable: listing.rights.sampleDisclosure === 'licensed' && evidence.length > 0 } })
     if (!isBeatListingReady(reviewed) || reviewed.adminReview?.decision !== 'approve' || !reviewed.adminReview.current) return json(res, 409, { ok: false, error: { code: 'BEAT_REVIEW_INCOMPLETE', message: 'La oferta debe estar aprobada y vigente antes de venderse.' }, requestId: id }, id, requestOrigin)
     const offer = reviewed.offers.find(item => item.id === (input as Record<string, string>).offerId)
     const asset = entry.assetId ? await repo.findAsset(entry.assetId, entry.creatorId) : undefined
     const connected = await repo.findStripeConnectAccount(entry.creatorId)
     if (!offer || offer.status !== 'draft-only' || !asset || asset.state !== 'available' || !connected || connected.deauthorized || !connected.payoutsEnabled) return json(res, 409, { ok: false, error: { code: 'SELLER_NOT_READY', message: 'El beat o la cuenta de pagos del vendedor todavía no están listos.' }, requestId: id }, id, requestOrigin)
     try {
       const result = await stripePayments.createBeatCheckout({ orderId, buyerId: account.id, buyerEmail: account.email, sellerId: entry.creatorId, stripeAccountId: connected.stripeAccountId, contentId, title: entry.title, offer: { id: offer.id, label: offer.label, amountMinor: offer.amountMinor, usageSummary: offer.usageSummary, deliverables: offer.deliverables } })
       return json(res, 201, { ok: true, data: { orderId: result.order.id, url: result.url }, requestId: id }, id, requestOrigin)
     } catch (error) {
       const code = error instanceof Error && (error.message.startsWith('ORDER_') || error.message === 'BEAT_PRICE_NOT_SUPPORTED') ? error.message : 'CHECKOUT_UNAVAILABLE'
       const status = code === 'CHECKOUT_UNAVAILABLE' ? 503 : 409
       return json(res, status, { ok: false, error: { code, message: status === 503 ? 'No se pudo preparar el checkout. Inténtalo de nuevo.' : 'Esta solicitud de compra ya no está disponible.' }, requestId: id }, id, requestOrigin)
     }
   }
   if (req.method === 'POST' && path === '/api/auth/logout') { if (account && !(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin); await auth.logout(session); audit.record('logout', id, account?.id); return json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin, [`${sessionCookie}=; HttpOnly; SameSite=${config.cookie.sameSite}; Path=/; Max-Age=0`, `${csrfCookie}=; SameSite=${config.cookie.sameSite}; Path=/; Max-Age=0`]) }
   if (req.method === 'GET' && path === '/api/auth/me') return account ? json(res, 200, { ok: true, data: { id: account.id, email: account.email, role: account.role, verificationState: account.verificationState, planId: account.planId || 'free' }, requestId: id }, id, requestOrigin) : unauthorized(res, id, requestOrigin)
   if (req.method === 'GET' && path === '/api/account/plan') { if (!account) return unauthorized(res, id, requestOrigin); const planId = account.planId || 'free'; const plan = getPlanCatalog(config).find(item => item.id === planId)!; return json(res, 200, { ok: true, data: { planId, status: 'local', plan, plans: getPlanCatalog(config), pricing: 'undecided', billing: 'disabled' }, requestId: id }, id, requestOrigin) }
   if (req.method === 'GET' && path === '/api/account/storage') { if (!account) return unauthorized(res, id, requestOrigin); const usedBytes = await repo.getStorageUsage(account.id); const accountLimit = await repo.getStorageQuota(account.id); const planId = account.planId || 'free'; const planLimit = getPlanCatalog(config).find(item => item.id === planId)?.storageLimitBytes; const effective = getEffectiveStorageLimit({ accountLimit, planLimit, serverLimit: config.storageQuotaBytes }); return json(res, 200, { ok: true, data: { usedBytes, limitBytes: effective.limitBytes, availableBytes: effective.limitBytes === null ? null : Math.max(0, effective.limitBytes - usedBytes), quotaSource: effective.source, planId }, requestId: id }, id, requestOrigin) }
   if (path === '/api/staff/catalog-review' || path?.startsWith('/api/staff/catalog-review/')) {
     if (!staffOnly(account, res, id, requestOrigin)) return
      const previewMatch = path?.match(/^\/api\/staff\/catalog-review\/([a-zA-Z0-9_-]{1,80})\/preview$/)
      const adminPreviewRequest = account!.role === 'admin' && (req.method === 'GET' || req.method === 'HEAD') && Boolean(previewMatch)
      if (account!.role !== 'community_manager' && !adminPreviewRequest) return json(res, 403, { ok: false, error: { code: 'COMMUNITY_MANAGER_REQUIRED', message: 'Solo una cuenta Community Manager puede usar esta ruta de revisión.' }, requestId: id }, id, requestOrigin)
     if (req.method === 'GET' && path === '/api/staff/catalog-review') {
       const entries = (await repo.listCatalog()).filter(item => item.type === 'beat' && item.publicationStatus === 'pending-review' && item.creatorId !== account!.id)
       const data = await Promise.all(entries.map(async entry => {
         const asset = entry.assetId ? await repo.findAsset(entry.assetId, entry.creatorId) : undefined
         const previewAvailable = Boolean(asset?.previewStorageKey && await stat(previewArtifactPath(config.uploadDirectory, asset.previewStorageKey)).then(info => info.isFile() && info.size > 0, () => false))
         const artwork = entry.assetId ? await repo.findCatalogArtwork(entry.assetId, entry.creatorId) : undefined
          const artworkAvailable = Boolean(artwork && await artworkExists(artwork.storageKey))
          const thumbnailAvailable = Boolean(artwork?.thumbnailStorageKey && await artworkExists(artwork.thumbnailStorageKey))
          return { contentId: entry.contentId, title: entry.title, type: entry.type, creatorId: entry.creatorId, previewAvailable, previewUrl: previewAvailable ? `/api/staff/catalog-review/${encodeURIComponent(entry.contentId)}/preview` : undefined, artworkUrl: artworkAvailable ? `/api/staff/catalog-review/${encodeURIComponent(entry.contentId)}/artwork${thumbnailAvailable ? '/thumbnail' : ''}` : undefined }
       }))
       return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
     }
     if ((req.method === 'GET' || req.method === 'HEAD') && previewMatch) {
        const entry = (await repo.listCatalog()).find(item => item.contentId === previewMatch[1] && item.type === 'beat' && item.publicationStatus === 'pending-review' && item.creatorId !== account!.id)
       const asset = entry?.assetId ? await repo.findAsset(entry.assetId, entry.creatorId) : undefined
       if (!entry || !asset?.previewStorageKey || asset.state !== 'available') return json(res, 404, { ok: false, error: { code: 'PREVIEW_NOT_FOUND', message: 'El preview de revisión no está disponible.' }, requestId: id }, id, requestOrigin)
       const previewPath = previewArtifactPath(config.uploadDirectory, asset.previewStorageKey)
       let info
       try { info = await stat(previewPath); if (!info.isFile() || info.size <= 0) throw new Error('Preview artifact unavailable') }
       catch { return json(res, 404, { ok: false, error: { code: 'PREVIEW_NOT_FOUND', message: 'El preview de revisión no está disponible.' }, requestId: id }, id, requestOrigin) }
       const range = req.headers.range ? parseByteRange(req.headers.range, info.size) : undefined
       if (req.headers.range && !range) { res.setHeader('Content-Range', `bytes */${info.size}`); return json(res, 416, { ok: false, error: { code: 'INVALID_RANGE', message: 'Rango inválido.' }, requestId: id }, id, requestOrigin) }
       const start = range?.start ?? 0; const end = range?.end ?? info.size - 1
       res.writeHead(range ? 206 : 200, { 'Content-Type': 'audio/mp4', 'Content-Length': Math.max(0, end - start + 1), 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}), ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}) })
       if (req.method === 'HEAD') return res.end()
       const stream = createReadStream(previewPath, { start, end })
       stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); return stream.pipe(res)
     }
      const artworkMatch = path?.match(/^\/api\/staff\/catalog-review\/([a-zA-Z0-9_-]{1,80})\/artwork(\/thumbnail)?$/)
     if ((req.method === 'GET' || req.method === 'HEAD') && artworkMatch) {
       const entry = (await repo.listCatalog()).find(item => item.contentId === artworkMatch[1] && item.type === 'beat' && item.publicationStatus === 'pending-review' && item.creatorId !== account!.id)
       const artwork = entry?.assetId ? await repo.findCatalogArtwork(entry.assetId, entry.creatorId) : undefined
       if (!entry || !artwork) return json(res, 404, { ok: false, error: { code: 'ARTWORK_NOT_FOUND', message: 'Artwork no disponible para esta revisión.' }, requestId: id }, id, requestOrigin)
        const useThumbnail = artworkMatch[2] === '/thumbnail' && Boolean(artwork.thumbnailStorageKey)
        const storageKey = useThumbnail ? artwork.thumbnailStorageKey! : artwork.storageKey
        const expectedSize = useThumbnail ? artwork.thumbnailSizeBytes : artwork.sizeBytes
        const filePath = artworkPath(config.uploadDirectory, storageKey)
       let info
        try { info = await stat(filePath); if (!info.isFile() || info.size !== expectedSize) throw new Error('Artwork unavailable') }
       catch { return json(res, 404, { ok: false, error: { code: 'ARTWORK_NOT_FOUND', message: 'Artwork no disponible para esta revisión.' }, requestId: id }, id, requestOrigin) }
        res.writeHead(200, { 'Content-Type': useThumbnail ? 'image/webp' : artwork.mimeType, 'Content-Length': info.size, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}) })
       if (req.method === 'HEAD') return res.end()
       const stream = createReadStream(filePath); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); return stream.pipe(res)
     }
     const decisionMatch = path?.match(/^\/api\/staff\/catalog-review\/([a-zA-Z0-9_-]{1,80})$/)
     if (req.method === 'POST' && decisionMatch) {
       if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
       const payload = await body(req) as Record<string, unknown>
       const decision = payload?.decision
       const note = typeof payload?.note === 'string' ? payload.note.trim() : ''
       if ((decision !== 'approve' && decision !== 'reject') || note.length < 8 || note.length > 160) throw new ValidationError('decision', 'Elige aprobar o rechazar y escribe una nota de 8 a 160 caracteres.')
       const entry = (await repo.listCatalog()).find(item => item.contentId === decisionMatch[1] && item.type === 'beat' && item.publicationStatus === 'pending-review')
       if (!entry) return json(res, 409, { ok: false, error: { code: 'REVIEW_NOT_PENDING', message: 'El Beat no está pendiente de revisión.' }, requestId: id }, id, requestOrigin)
       if (entry.creatorId === account!.id) return json(res, 403, { ok: false, error: { code: 'SELF_REVIEW_FORBIDDEN', message: 'No puedes revisar tu propia subida.' }, requestId: id }, id, requestOrigin)
       if (decision === 'approve') {
         const audio = entry.assetId ? await repo.findAsset(entry.assetId, entry.creatorId) : undefined
         const ready = audio?.previewStorageKey && await stat(previewArtifactPath(config.uploadDirectory, audio.previewStorageKey)).then(info => info.isFile() && info.size > 0, () => false)
         if (!ready) return json(res, 409, { ok: false, error: { code: 'PROCESSED_PREVIEW_REQUIRED', message: 'No se puede aprobar sin un preview procesado disponible.' }, requestId: id }, id, requestOrigin)
       }
       const updated = await repo.reviewCatalog(entry.contentId, decision === 'approve' ? 'published' : 'rejected', note)
       if (!updated) return json(res, 409, { ok: false, error: { code: 'REVIEW_NOT_PENDING', message: 'El Beat ya fue revisado o no está pendiente.' }, requestId: id }, id, requestOrigin)
       await audit.recordAndWait('catalog_community_decision', id, account!.id, entry.contentId, true, { resource: 'catalog-review', decision, reason: note })
       return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin)
     }
     return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/staff/marketplace-review' || path?.startsWith('/api/staff/marketplace-review/')) {
     if (!staffOnly(account, res, id, requestOrigin)) return
     if (req.method === 'GET' && path === '/api/staff/marketplace-review') {
      const catalog = await repo.listCatalog()
       const listingRecords = await repo.listAllBeatListingDrafts()
       const data = listingRecords.flatMap(listing => {
         const entry = catalog.find(item => item.contentId === listing.contentId && item.type === 'beat')
         if (!entry) return []
         const latest = latestMarketplaceReview(listing.contentId, 'marketplace_review_recommendation')
         const revisionAt = sellerListingRevisionAt(listing.contentId, listing.updatedAt)
         return { listing: { ...listing, rights: { ...listing.rights, sampleProofAvailable: false } }, title: entry!.title, creatorId: listing.ownerId, readyForFinalReview: false, evidence: [] as ReturnType<typeof sellerEvidenceView>[], recommendationCurrent: Boolean(latest && Date.parse(latest.timestamp) >= revisionAt), latestRecommendation: latest ? { decision: latest.metadata.decision, note: latest.metadata.note, reviewerId: latest.actorId, createdAt: latest.timestamp } : undefined }
      })
       for (const item of data) {
         const records = await repo.listSellerEvidence(item.listing.contentId, item.creatorId)
         item.evidence = records.map(sellerEvidenceView)
         item.listing.rights.sampleProofAvailable = item.listing.rights.sampleDisclosure === 'licensed' && records.length > 0
         item.readyForFinalReview = isBeatListingReady(item.listing)
       }
       return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
     }
     const evidenceDownload = path?.match(/^\/api\/staff\/marketplace-review\/([a-f0-9-]{36})\/evidence\/([a-f0-9-]{36})$/i)
     if (req.method === 'GET' && evidenceDownload) {
       const evidence = await repo.findSellerEvidence(evidenceDownload[2])
       if (!evidence || evidence.contentId !== evidenceDownload[1]) return json(res, 404, { ok: false, error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found.' }, requestId: id }, id, requestOrigin)
       res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': evidence.sizeBytes, 'Content-Disposition': `attachment; filename="${evidence.originalName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin } : {}), 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' })
       return createReadStream(sellerEvidencePath(evidence)).pipe(res)
     }
     const recommendationMatch = path?.match(/^\/api\/staff\/marketplace-review\/([a-f0-9-]{36})$/i)
     if (req.method === 'POST' && recommendationMatch) {
       if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
       const payload = await body(req) as Record<string, unknown>
       const decision = payload?.decision
       const note = typeof payload?.note === 'string' ? payload.note.trim() : ''
       if ((decision !== 'recommend' && decision !== 'request-changes') || note.length < 8 || note.length > 160) throw new ValidationError('recommendation', 'Elige una recomendación y escribe una nota de 8 a 160 caracteres.')
       const listing = (await Promise.all((await repo.listAccounts()).map(item => repo.findBeatListingDraft(recommendationMatch[1], item.id)))).find(Boolean)
       if (!listing) return json(res, 404, { ok: false, error: { code: 'LISTING_NOT_FOUND', message: 'La ficha comercial no existe.' }, requestId: id }, id, requestOrigin)
       if (listing.ownerId === account!.id) return json(res, 403, { ok: false, error: { code: 'SELF_REVIEW_FORBIDDEN', message: 'No puedes revisar tu propia ficha comercial.' }, requestId: id }, id, requestOrigin)
       const evidence = await repo.listSellerEvidence(listing.contentId, listing.ownerId)
       const listingWithEvidence = { ...listing, rights: { ...listing.rights, sampleProofAvailable: listing.rights.sampleDisclosure === 'licensed' && evidence.length > 0 } }
       if (decision === 'recommend' && !isBeatListingReady(listingWithEvidence)) return json(res, 409, { ok: false, error: { code: 'LISTING_INCOMPLETE', message: 'La ficha no cumple los requisitos mínimos para recomendarla a revisión final.' }, requestId: id }, id, requestOrigin)
       await audit.recordAndWait('marketplace_review_recommendation', id, account!.id, listing.contentId, true, { resource: 'marketplace-beat-review', decision, note })
       return json(res, 200, { ok: true, data: { contentId: listing.contentId, decision, note, reviewerId: account!.id, createdAt: new Date().toISOString() }, requestId: id }, id, requestOrigin)
     }
     return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' }, requestId: id }, id, requestOrigin)
   }
    if (path?.startsWith('/api/admin/')) {
      if (!adminOnly(account, res, id, requestOrigin)) return
      if (req.method === 'GET' && path === '/api/admin/beat-orders') {
        const orders = await repo.listAllBeatOrders()
        return json(res, 200, { ok: true, data: orders.map(({ id: orderId, buyerId, sellerId, title, offerId, amountMinor, currency, status, createdAt, paidAt, refundRequestedAt, disputeId, disputeReason }) => ({ id: orderId, buyerId, sellerId, title, offerId, amountMinor, currency, status, createdAt, paidAt, refundRequestedAt, disputeId, disputeReason })), requestId: id }, id, requestOrigin)
      }
      const beatRefundMatch = path.match(/^\/api\/admin\/beat-orders\/([a-f0-9-]{36})\/refund$/i)
      if (req.method === 'POST' && beatRefundMatch) {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
        if (!stripePayments) return json(res, 503, { ok: false, error: { code: 'STRIPE_PAYMENTS_DISABLED', message: 'Stripe test payments are not configured.' }, requestId: id }, id, requestOrigin)
        if (!limiter.allow(`beat-refund:${account!.id}`)) return limited(res, id, requestOrigin)
        const payload = await body(req)
        const reason = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).reason : undefined
        if (reason !== undefined && !['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason as string)) throw new ValidationError('reason', 'Elige un motivo de reembolso válido.')
        const orderId = validateCatalogId(beatRefundMatch[1])
        try {
          const order = await stripePayments.refundBeatOrder(orderId, account!.id, reason as 'duplicate' | 'fraudulent' | 'requested_by_customer' | undefined)
          audit.record('update', id, account!.id, order.id, true, { resource: 'beat-order-refund', ...(order.stripeRefundId ? { refundId: order.stripeRefundId } : {}) })
          return json(res, 202, { ok: true, data: { id: order.id, status: order.status, refundRequestedAt: order.refundRequestedAt }, requestId: id }, id, requestOrigin)
        } catch (error) {
          const code = error instanceof Error && error.message === 'BEAT_ORDER_NOT_FOUND' ? error.message : error instanceof Error && error.message === 'BEAT_ORDER_NOT_REFUNDABLE' ? error.message : 'STRIPE_REFUND_FAILED'
          const status = code === 'BEAT_ORDER_NOT_FOUND' ? 404 : code === 'BEAT_ORDER_NOT_REFUNDABLE' ? 409 : 503
          return json(res, status, { ok: false, error: { code, message: status === 503 ? 'Stripe no pudo iniciar el reembolso. Revisa el estado de la orden antes de volver a intentarlo.' : 'La orden no se puede reembolsar en su estado actual.' }, requestId: id }, id, requestOrigin)
        }
      }
      if (req.method === 'GET' && path === '/api/admin/marketplace-listings') {
        return json(res, 200, { ok: true, data: await marketplaceReviewQueue(), requestId: id }, id, requestOrigin)
      }
      const marketplaceDecisionMatch = path.match(/^\/api\/admin\/marketplace-listings\/([a-f0-9-]{36})$/i)
      if (req.method === 'POST' && marketplaceDecisionMatch) {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
        const input = await body(req)
        const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
        const decision = payload.decision
        const note = typeof payload.note === 'string' ? payload.note.trim() : ''
        if (!['approve', 'reject', 'request-changes'].includes(decision as string) || note.length < 8 || note.length > 160) throw new ValidationError('marketplaceDecision', 'Choose a decision and enter a reason between 8 and 160 characters.')
        const finalDecision = decision as 'approve' | 'reject' | 'request-changes'
        const contentId = validateCatalogId(marketplaceDecisionMatch[1])
        const listing = (await Promise.all((await repo.listAccounts()).map(item => repo.findBeatListingDraft(contentId, item.id)))).find(Boolean)
        if (!listing) return json(res, 404, { ok: false, error: { code: 'LISTING_NOT_FOUND', message: 'La ficha comercial no existe.' }, requestId: id }, id, requestOrigin)
        const entry = (await repo.listCatalog()).find(item => item.contentId === contentId && item.creatorId === listing.ownerId && item.type === 'beat')
        if (!entry) return json(res, 404, { ok: false, error: { code: 'BEAT_NOT_FOUND', message: 'El beat del creador ya no está disponible.' }, requestId: id }, id, requestOrigin)
        if (finalDecision === 'approve') {
          const evidence = await repo.listSellerEvidence(contentId, listing.ownerId)
          const listingWithEvidence = { ...listing, rights: { ...listing.rights, sampleProofAvailable: listing.rights.sampleDisclosure === 'licensed' && evidence.length > 0 } }
          if (!isBeatListingReady(listingWithEvidence)) return json(res, 409, { ok: false, error: { code: 'LISTING_INCOMPLETE', message: 'La ficha no cumple todos los requisitos de revisión.' }, requestId: id }, id, requestOrigin)
          const latestRecommendation = latestMarketplaceReview(contentId, 'marketplace_review_recommendation')
          const recommender = latestRecommendation?.actorId ? await repo.findAccountById(latestRecommendation.actorId) : undefined
          const freshRecommendation = Boolean(latestRecommendation && latestRecommendation.actorId !== listing.ownerId && Date.parse(latestRecommendation.timestamp) >= sellerListingRevisionAt(contentId, listing.updatedAt) && latestRecommendation.metadata.decision === 'recommend' && recommender?.role === 'community_manager')
          if (!freshRecommendation) return json(res, 409, { ok: false, error: { code: 'COMMUNITY_RECOMMENDATION_REQUIRED', message: 'Se requiere una recomendación vigente del equipo Community Manager antes de aprobar.' }, requestId: id }, id, requestOrigin)
        }
        const createdAt = new Date().toISOString()
        await audit.recordAndWait('marketplace_admin_decision', id, account!.id, contentId, true, { resource: 'marketplace-beat-listing', decision: finalDecision, note })
        return json(res, 200, { ok: true, data: { contentId, decision: finalDecision, note, reviewerId: account!.id, createdAt }, requestId: id }, id, requestOrigin)
      }
      if (path === '/api/admin/promotions' && req.method === 'POST') {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'CSRF token required.' }, requestId: id }, id, requestOrigin)
        const input = validatePromotionInput(await body(req))
        const now = new Date().toISOString()
        const promotion: PromotionRule = { id: randomUUID(), ...input, createdAt: now, updatedAt: now, updatedBy: account!.id }
        const saved = await repo.savePromotion(promotion)
        audit.record('create', id, account!.id, saved.id, true, { resource: 'marketplace-promotion', scope: saved.scope, percentOff: saved.percentOff })
        return json(res, 201, { ok: true, data: saved, requestId: id }, id, requestOrigin)
      }
      const promotionMatch = path?.match(/^\/api\/admin\/promotions\/([a-f0-9-]{36})$/i)
      if (promotionMatch && req.method === 'PATCH') {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'CSRF token required.' }, requestId: id }, id, requestOrigin)
        const current = (await repo.listPromotions()).find(item => item.id === promotionMatch[1])
        if (!current) return json(res, 404, { ok: false, error: { code: 'PROMOTION_NOT_FOUND', message: 'Promotion not found.' }, requestId: id }, id, requestOrigin)
        const input = validatePromotionInput(await body(req))
        const saved = await repo.savePromotion({ ...current, ...input, updatedAt: new Date().toISOString(), updatedBy: account!.id })
        audit.record('update', id, account!.id, saved.id, true, { resource: 'marketplace-promotion', scope: saved.scope, percentOff: saved.percentOff, enabled: saved.enabled })
        return json(res, 200, { ok: true, data: saved, requestId: id }, id, requestOrigin)
      }
      if (promotionMatch && req.method === 'DELETE') {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'CSRF token required.' }, requestId: id }, id, requestOrigin)
        const deleted = await repo.deletePromotion(promotionMatch[1])
        if (!deleted) return json(res, 404, { ok: false, error: { code: 'PROMOTION_NOT_FOUND', message: 'Promotion not found.' }, requestId: id }, id, requestOrigin)
        audit.record('delete', id, account!.id, promotionMatch[1], true, { resource: 'marketplace-promotion' })
        return json(res, 200, { ok: true, data: { id: promotionMatch[1] }, requestId: id }, id, requestOrigin)
      }
      const staffRoleMatch = path?.match(/^\/api\/admin\/accounts\/([a-zA-Z0-9_-]{1,100})\/role$/)
      if (req.method === 'PATCH' && staffRoleMatch) {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'CSRF token required.' }, requestId: id }, id, requestOrigin)
        const input = await body(req)
        const role = input && typeof input === 'object' ? (input as Record<string, unknown>).role : undefined
        if (role !== 'creator' && role !== 'community_manager') throw new ValidationError('role', 'Only creator or community_manager can be assigned here.')
        const updated = await auth.assignStaffRole(staffRoleMatch[1], role)
        if (!updated) return json(res, 409, { ok: false, error: { code: 'ROLE_ASSIGNMENT_NOT_ALLOWED', message: 'La cuenta no existe o es una cuenta de administración protegida.' }, requestId: id }, id, requestOrigin)
        audit.record('update', id, account!.id, updated.id, true, { resource: 'account-staff-role', role })
        return json(res, 200, { ok: true, data: { accountId: updated.id, role: updated.role }, requestId: id }, id, requestOrigin)
      }
      if (req.method === 'POST' && path.startsWith('/api/admin/catalog-review/')) {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
        const match = path.match(/^\/api\/admin\/catalog-review\/([a-zA-Z0-9_-]{1,80})$/)
        const payload = await body(req)
        const decision = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).decision : undefined
        const reason = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).reason : undefined
        if (!match || (decision !== 'approve' && decision !== 'reject') || (decision === 'reject' && (typeof reason !== 'string' || !reason.trim() || reason.length > 160))) throw new ValidationError('decision', 'Selecciona una decisión y agrega un motivo de rechazo de hasta 160 caracteres.')
        const note = decision === 'reject' && typeof reason === 'string' ? reason.trim() : undefined
        const pending = (await repo.listCatalog()).find(item => item.contentId === match[1] && item.publicationStatus === 'pending-review')
        if (pending?.creatorId === account!.id) return json(res, 403, { ok: false, error: { code: 'SELF_REVIEW_FORBIDDEN', message: 'No puedes aprobar tu propia subida.' }, requestId: id }, id, requestOrigin)
        if (decision === 'approve') {
          if (pending?.type === 'beat' && !pending.assetId) return json(res, 409, { ok: false, error: { code: 'PROCESSED_PREVIEW_REQUIRED', message: 'No se puede aprobar un Beat sin audio procesado.' }, requestId: id }, id, requestOrigin)
          if (pending?.assetId) {
            const audio = await repo.findAsset(pending.assetId, pending.creatorId)
            const ready = audio?.previewStorageKey && await stat(previewArtifactPath(config.uploadDirectory, audio.previewStorageKey)).then(info => info.isFile() && info.size > 0, () => false)
            if (!ready) return json(res, 409, { ok: false, error: { code: 'PROCESSED_PREVIEW_REQUIRED', message: 'No se puede aprobar: falta el preview procesado. Configura FFmpeg y vuelve a subir el audio.' }, requestId: id }, id, requestOrigin)
          }
        }
        const updated = await repo.reviewCatalog(match[1], decision === 'approve' ? 'published' : 'rejected', note)
        if (!updated) return json(res, 409, { ok: false, error: { code: 'REVIEW_NOT_PENDING', message: 'La subida ya fue revisada o no existe.' }, requestId: id }, id, requestOrigin)
        await audit.recordAndWait(updated.type === 'beat' ? 'catalog_admin_decision' : 'update', id, account!.id, updated.contentId, true, { resource: 'catalog-review', decision, reason: typeof reason === 'string' ? reason.trim() : '' })
        return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin)
      }
      const planAssignmentMatch = path?.match(/^\/api\/admin\/accounts\/([a-zA-Z0-9_-]{1,100})\/plan$/)
      if (req.method === 'PATCH' && planAssignmentMatch) {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
        const input = await body(req)
        const planId = input && typeof input === 'object' ? (input as Record<string, unknown>).planId : undefined
        if (!isPlanId(planId)) throw new ValidationError('planId', 'Selecciona un paquete válido.')
        const updated = await auth.assignPlan(planAssignmentMatch[1], planId)
        if (!updated) return json(res, 404, { ok: false, error: { code: 'ACCOUNT_NOT_FOUND', message: 'La cuenta no existe.' }, requestId: id }, id, requestOrigin)
        audit.record('update', id, account!.id, updated.id, true, { resource: 'account-plan', planId })
        return json(res, 200, { ok: true, data: { accountId: updated.id, planId }, requestId: id }, id, requestOrigin)
      }
      const storageQuotaMatch = path?.match(/^\/api\/admin\/accounts\/([a-zA-Z0-9_-]{1,100})\/storage-quota$/)
      if (req.method === 'PATCH' && storageQuotaMatch) {
        if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
        const input = await body(req)
        const limitBytes = input && typeof input === 'object' ? (input as Record<string, unknown>).limitBytes : undefined
        if (!(limitBytes === null || typeof limitBytes === 'number' && Number.isSafeInteger(limitBytes) && limitBytes > 0)) throw new ValidationError('limitBytes', 'El límite debe ser un entero positivo en bytes o null para quitarlo.')
        try { await repo.setStorageQuota(storageQuotaMatch[1], limitBytes, account!.id) }
        catch (error) { if (error instanceof Error && error.message === 'ACCOUNT_NOT_FOUND') return json(res, 404, { ok: false, error: { code: 'ACCOUNT_NOT_FOUND', message: 'La cuenta no existe.' }, requestId: id }, id, requestOrigin); throw error }
        audit.record('update', id, account!.id, storageQuotaMatch[1], true, { resource: 'account-storage-quota', limitBytes })
        return json(res, 200, { ok: true, data: { ownerId: storageQuotaMatch[1], limitBytes }, requestId: id }, id, requestOrigin)
      }
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' }, requestId: id }, id, requestOrigin)
      await audit.record('admin_read', id, account!.id)
      if (path === '/api/admin/promotions') return json(res, 200, { ok: true, data: await repo.listPromotions(), requestId: id }, id, requestOrigin)
      if (path === '/api/admin/storage') {
        const [accounts, usage, quotas] = await Promise.all([repo.listAccounts(), repo.listStorageUsage(), repo.listStorageQuotas()])
        const usageByAccount = new Map(usage.map(({ ownerId, ...metrics }) => [ownerId, metrics]))
        const quotaByAccount = new Map(quotas.map(item => [item.ownerId, item.limitBytes]))
        const storage = accounts.map(item => ({ id: item.id, email: item.email, role: item.role, ...(usageByAccount.get(item.id) ?? { usedBytes: 0, originalCount: 0, artworkBytes: 0, artworkCount: 0, previewBytes: 0, previewCount: 0, storedBytes: 0 }), customQuotaBytes: quotaByAccount.get(item.id) ?? null }))
        storage.sort((left, right) => right.usedBytes - left.usedBytes || left.email.localeCompare(right.email))
        return json(res, 200, { ok: true, data: storage, requestId: id }, id, requestOrigin)
      }
      const all = await Promise.all([repo.listAccounts(), repo.listProjects(), repo.listCatalog()]); const data = adminData(all[0], all[1], all[2], [...audit.entries])
      if (path === '/api/admin/overview') return json(res, 200, { ok: true, data: data.overview, requestId: id }, id, requestOrigin)
      if (path === '/api/admin/accounts') return json(res, 200, { ok: true, data: data.accounts, requestId: id }, id, requestOrigin)
      if (path === '/api/admin/audit') { const query = new URL(req.url || '/', 'http://localhost').searchParams; const limit = Math.min(Number(query.get('limit') || 100), 500); const page = Math.max(Number(query.get('page') || 1), 1); const events = data.audit.slice().reverse(); return json(res, 200, { ok: true, data: events.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: events.length }, requestId: id }, id, requestOrigin) }
      if (path === '/api/admin/catalog-review') {
        const pendingEntries = all[2].filter(entry => entry.publicationStatus === 'pending-review' && entry.creatorId !== account!.id)
        const pending = await Promise.all(pendingEntries.map(async entry => {
          const adminEntry = data.catalog.find(item => item.contentId === entry.contentId)!
          const asset = entry.type === 'beat' && entry.assetId ? await repo.findAsset(entry.assetId, entry.creatorId) : undefined
          const previewAvailable = Boolean(asset?.previewStorageKey && await stat(previewArtifactPath(config.uploadDirectory, asset.previewStorageKey)).then(info => info.isFile() && info.size > 0, () => false))
          return { ...adminEntry, previewAvailable, ...(previewAvailable ? { previewUrl: `/api/staff/catalog-review/${encodeURIComponent(entry.contentId)}/preview` } : {}) }
        }))
        return json(res, 200, { ok: true, data: pending, requestId: id }, id, requestOrigin)
      }
      return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' }, requestId: id }, id, requestOrigin)
    }
   const sellerEvidenceMatch = path?.match(/^\/api\/seller\/beat-listings\/([a-f0-9-]{36})\/evidence(?:\/([a-f0-9-]{36}))?$/i)
   if (sellerEvidenceMatch) {
     if (!account) return unauthorized(res, id, requestOrigin)
     const contentId = validateCatalogId(sellerEvidenceMatch[1])
     const listing = await repo.findBeatListingDraft(contentId, account.id)
     if (!listing) return json(res, 404, { ok: false, error: { code: 'LISTING_NOT_FOUND', message: 'La ficha comercial no existe.' }, requestId: id }, id, requestOrigin)
     if (req.method === 'GET' && !sellerEvidenceMatch[2]) return json(res, 200, { ok: true, data: (await repo.listSellerEvidence(contentId, account.id)).map(sellerEvidenceView), requestId: id }, id, requestOrigin)
     if (req.method === 'GET' && sellerEvidenceMatch[2]) {
       const evidence = await repo.findSellerEvidence(sellerEvidenceMatch[2])
       if (!evidence || evidence.contentId !== contentId || evidence.ownerId !== account.id) return json(res, 404, { ok: false, error: { code: 'EVIDENCE_NOT_FOUND', message: 'El documento no existe.' }, requestId: id }, id, requestOrigin)
       res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': evidence.sizeBytes, 'Content-Disposition': `attachment; filename="${evidence.originalName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin } : {}), 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' })
       return createReadStream(sellerEvidencePath(evidence)).pipe(res)
     }
     if (req.method === 'POST' && !sellerEvidenceMatch[2]) {
       if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
       if ((await repo.listSellerEvidence(contentId, account.id)).length >= sellerEvidenceMaxFiles) return json(res, 409, { ok: false, error: { code: 'EVIDENCE_LIMIT', message: 'Se permiten hasta tres documentos por beat.' }, requestId: id }, id, requestOrigin)
       const evidence = await receiveSellerEvidence(req, contentId, account.id)
       try { await repo.saveSellerEvidence(evidence) } catch (error) { await removeSellerEvidenceFile(evidence); throw error }
       await audit.recordAndWait('create', id, account.id, evidence.id, true, { resource: 'marketplace-seller-evidence', contentId })
       return json(res, 201, { ok: true, data: sellerEvidenceView(evidence), requestId: id }, id, requestOrigin)
     }
     if (req.method === 'DELETE' && sellerEvidenceMatch[2]) {
       if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
       const evidence = await repo.findSellerEvidence(sellerEvidenceMatch[2])
       if (!evidence || evidence.contentId !== contentId || evidence.ownerId !== account.id) return json(res, 404, { ok: false, error: { code: 'EVIDENCE_NOT_FOUND', message: 'El documento no existe.' }, requestId: id }, id, requestOrigin)
       await repo.deleteSellerEvidence(evidence.id, account.id)
       await removeSellerEvidenceFile(evidence)
       await audit.recordAndWait('delete', id, account.id, evidence.id, true, { resource: 'marketplace-seller-evidence', contentId })
       return json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin)
     }
     return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/seller/beat-listings' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const listings = await repo.listBeatListingDrafts(account.id)
     for (const item of listings) item.rights.sampleProofAvailable = item.rights.sampleDisclosure === 'licensed' && (await repo.listSellerEvidence(item.contentId, account.id)).length > 0
     return json(res, 200, { ok: true, data: listings.map(sellerListingWithAdminReview), requestId: id }, id, requestOrigin)
   }
   const sellerBeatListingMatch = path?.match(/^\/api\/seller\/beat-listings\/([a-f0-9-]{36})$/i)
   if (sellerBeatListingMatch && (req.method === 'GET' || req.method === 'PUT')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     const contentId = validateCatalogId(sellerBeatListingMatch[1])
     if (req.method === 'GET') {
       const listing = await repo.findBeatListingDraft(contentId, account.id)
       return listing
         ? json(res, 200, { ok: true, data: sellerListingWithAdminReview({ ...listing, rights: { ...listing.rights, sampleProofAvailable: listing.rights.sampleDisclosure === 'licensed' && (await repo.listSellerEvidence(contentId, account.id)).length > 0 } }), requestId: id }, id, requestOrigin)
         : json(res, 404, { ok: false, error: { code: 'LISTING_NOT_FOUND', message: 'Todavía no hay una ficha comercial para este beat.' }, requestId: id }, id, requestOrigin)
     }
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const catalogEntry = (await repo.listCatalog()).find(entry => entry.contentId === contentId && entry.creatorId === account.id)
     if (!catalogEntry || catalogEntry.type !== 'beat') return json(res, 404, { ok: false, error: { code: 'BEAT_NOT_FOUND', message: 'Solo puedes preparar una oferta para un Beat propio.' }, requestId: id }, id, requestOrigin)
     const submittedInput = validateBeatListingInput(await body(req))
     const previous = await repo.findBeatListingDraft(contentId, account.id)
     const uploadedEvidence = await repo.listSellerEvidence(contentId, account.id)
     const input = { ...submittedInput, rights: { ...submittedInput.rights, sampleProofAvailable: submittedInput.rights.sampleDisclosure === 'licensed' && uploadedEvidence.length > 0 } }
     const now = new Date().toISOString()
     const record: BeatListingRecord = {
       ...input,
       contentId,
       ownerId: account.id,
       currency: 'USD',
       status: 'draft-only',
       schemaVersion: 1,
       rightsDeclarationVersion: rightsIntakeVersion,
       ...(previous?.rightsDeclarationAcceptedAt ? { rightsDeclarationAcceptedAt: previous.rightsDeclarationAcceptedAt } : {}),
       ...(input.rights.declarationAccepted ? { rightsDeclarationAcceptedAt: previous?.rightsDeclarationAcceptedAt || now } : {}),
       offers: input.offers.map(offer => ({ ...offer, currency: 'USD', termsVersion: draftOfferTermsVersion, status: 'draft-only' })),
       createdAt: previous?.createdAt || now,
       updatedAt: now,
     }
     const saved = await repo.saveBeatListingDraft(record)
     audit.record(previous ? 'update' : 'create', id, account.id, contentId, true, { resource: 'beat-listing-draft', declarationAccepted: input.rights.declarationAccepted, offerCount: input.offers.length })
     return json(res, previous ? 200 : 201, { ok: true, data: sellerListingWithAdminReview(saved), requestId: id }, id, requestOrigin)
   }
   if (req.method === 'POST' && (path === '/api/auth/password-change' || path === '/api/auth/email-change')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const value = await body(req)
     if (!value || typeof value !== 'object') throw new ValidationError('body', 'Cuerpo inválido.')
     const input = value as Record<string, unknown>
     if (typeof input.currentPassword !== 'string' || !input.currentPassword) throw new ValidationError('currentPassword', 'Confirma tu contraseña actual.')
     if (path === '/api/auth/password-change') {
       if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new ValidationError('password', 'La nueva contraseña debe tener entre 12 y 128 caracteres.')
       const changed = await auth.changePassword(account.id, input.currentPassword, input.password, session)
       if (!changed) return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'La contraseña actual no coincide.' }, requestId: id }, id, requestOrigin)
       audit.record('update', id, account.id, account.id, true, { resource: 'account-password' })
       return json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin)
     }
     if (config.environment === 'production') return json(res, 501, { ok: false, error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'El cambio de correo requiere verificación por email y no está habilitado en este entorno.' }, requestId: id }, id, requestOrigin)
     if (typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || input.email.trim().length > 254) throw new ValidationError('email', 'Introduce un correo válido.')
     try {
       const updated = await auth.changeEmail(account.id, input.currentPassword, input.email)
       if (!updated) return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'La contraseña actual no coincide.' }, requestId: id }, id, requestOrigin)
       audit.record('update', id, account.id, account.id, true, { resource: 'account-email' })
       return json(res, 200, { ok: true, data: { id: updated.id, email: updated.email, role: updated.role, verificationState: updated.verificationState }, requestId: id }, id, requestOrigin)
     } catch (error) {
       if (error instanceof Error && error.message === 'DUPLICATE_ACCOUNT') return json(res, 409, { ok: false, error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'Ese correo ya está asociado a una cuenta.' }, requestId: id }, id, requestOrigin)
       throw error
     }
   }
  if (path?.startsWith('/api/projects') && !account) return unauthorized(res, id, requestOrigin)
   if (account && ['POST', 'PUT', 'DELETE'].includes(req.method || '') && !(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
   if (path === '/api/chat/presence' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const friendships = await repo.listFriendships(account.id)
     const friendIds = friendships.filter(item => item.status === 'accepted').map(item => item.requesterId === account.id ? item.recipientId : item.requesterId)
     return json(res, 200, { ok: true, data: { onlineIds: friendIds.filter(isChatOnline) }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/chat/events' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const friendIds = (await repo.listFriendships(account.id)).filter(item => item.status === 'accepted').map(item => item.requesterId === account.id ? item.recipientId : item.requesterId)
     const unsubscribe = subscribeToChat(account.id, res)
     if (!unsubscribe) return limited(res, id, requestOrigin)
     res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}) })
     res.write('retry: 3000\n: connected\n\n')
     for (const friendId of friendIds) publishChatEvent(friendId, { type: 'presence', peerId: account.id, online: true })
     const heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': keep-alive\n\n') }, 25000)
     res.on('close', () => {
       clearInterval(heartbeat)
       unsubscribe()
       if (!isChatOnline(account.id)) void repo.listFriendships(account.id).then(items => {
         const currentFriendIds = items.filter(item => item.status === 'accepted').map(item => item.requesterId === account.id ? item.recipientId : item.requesterId)
         for (const friendId of currentFriendIds) publishChatEvent(friendId, { type: 'presence', peerId: account.id, online: false })
       }).catch(() => undefined)
     })
     return
   }
   if (path === '/api/chat/conversations' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const relationships = (await repo.listFriendships(account.id)).filter(item => item.status === 'accepted')
     const friends = new Set(relationships.map(item => item.requesterId === account.id ? item.recipientId : item.requesterId))
     const conversations = (await repo.listChatConversations(account.id)).filter(item => friends.has(item.peerId))
     const data = await Promise.all(conversations.map(async item => {
       const profile = await repo.findProfile(item.peerId)
       return { ...item, profile: profile ? directoryProfile(profile) : { accountId: item.peerId, displayName: 'Productor', bio: '', genres: [], avatarId: 'initials', coverId: 'studio-electronic' } }
     }))
     return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
   }
   const chatMatch = path?.match(/^\/api\/chat\/conversations\/([a-zA-Z0-9_-]{1,80})(?:\/(messages|read))?$/)
   if (chatMatch && path !== '/api/chat/events') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const peerId = chatMatch[1]
     const action = chatMatch[2]
     if (!(await repo.listFriendships(account.id)).some(item => item.status === 'accepted' && (item.requesterId === account.id && item.recipientId === peerId || item.requesterId === peerId && item.recipientId === account.id)))
       return json(res, 403, { ok: false, error: { code: 'CHAT_FRIENDSHIP_REQUIRED', message: 'El chat está disponible solo entre amigos.' }, requestId: id }, id, requestOrigin)
     if (req.method === 'GET' && action === 'messages') {
       const messages = await repo.listChatMessages(account.id, peerId, 100)
       return json(res, 200, { ok: true, data: messages, requestId: id }, id, requestOrigin)
     }
     if (req.method === 'POST' && action === 'messages') {
       if (!chatMessageLimiter.allow(account.id)) return limited(res, id, requestOrigin)
       const value = await body(req)
       const text = value && typeof value === 'object' ? (value as Record<string, unknown>).body : undefined
       if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) throw new ValidationError('body', 'El mensaje debe tener entre 1 y 2000 caracteres.')
       const now = new Date().toISOString()
       const message = await repo.createChatMessage({ id: randomUUID(), senderId: account.id, recipientId: peerId, body: text.trim(), createdAt: now })
       publishChatEvent(account.id, { type: 'message', peerId })
       publishChatEvent(peerId, { type: 'message', peerId: account.id })
       audit.record('create', id, account.id, peerId, true, { resource: 'direct-message' })
       return json(res, 201, { ok: true, data: message, requestId: id }, id, requestOrigin)
     }
     if (req.method === 'POST' && action === 'read') {
       const readAt = new Date().toISOString()
       const updated = await repo.markChatMessagesRead(account.id, peerId, readAt)
       if (updated) publishChatEvent(peerId, { type: 'read', peerId: account.id })
       return json(res, 200, { ok: true, data: { updated, readAt }, requestId: id }, id, requestOrigin)
     }
     return json(res, 404, { ok: false, error: { code: 'CHAT_ROUTE_NOT_FOUND', message: 'Ruta de chat no encontrada.' }, requestId: id }, id, requestOrigin)
   }
   const profileImageUploadMatch = path?.match(/^\/api\/profile\/images\/(avatar|cover)$/)
   if (profileImageUploadMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     if (!limiter.allow(`profile-image:${account.id}`)) return limited(res, id, requestOrigin)
     const release = profileImageConcurrencyLimiter.acquire(account.id)
     if (!release) return json(res, 429, { ok: false, error: { code: 'PROFILE_IMAGE_BUSY', message: 'Ya se esta procesando una imagen de perfil.' }, requestId: id }, id, requestOrigin)
     const kind = profileImageUploadMatch[1] as ProfileImageKind
     try {
       if (Number(req.headers['content-length']) > profileImageMaxBytes) return json(res, 413, { ok: false, error: { code: 'PROFILE_IMAGE_TOO_LARGE', message: 'La imagen debe pesar como maximo 8 MB.' }, requestId: id }, id, requestOrigin)
       const current = await repo.findProfile(account.id) || emptyProfile(account.id)
       const fallback = kind === 'avatar' ? current.avatarFocalPoint || defaultAvatarFocalPoint : current.coverFocalPoint || defaultCoverFocalPoint
       const focalPoint = parseProfileImageFocalPoint(req.headers['x-profile-focal-point'], fallback)
       const bytes = await readRawBody(req, profileImageMaxBytes)
       const mimeType = req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase()
       validateProfileImageUpload(bytes, mimeType)
       const previous = kind === 'avatar' ? current.avatarImage : current.coverImage
       const other = kind === 'avatar' ? current.coverImage : current.avatarImage
       const usedProfileBytes = (other?.sizeBytes ?? 0) + (other?.thumbnailSizeBytes ?? 0)
       if (usedProfileBytes + bytes.length > profileImageMaxAccountBytes) return json(res, 409, { ok: false, error: { code: 'PROFILE_IMAGE_STORAGE_LIMIT', message: 'Avatar y portada no pueden superar 15 MB en total.' }, requestId: id }, id, requestOrigin)
       let image: ProfileImageRecord
       try { image = await persistProfileImage(account.id, kind, bytes, mimeType) }
       catch (error) {
         if (error instanceof Error && error.message.startsWith('PROFILE_IMAGE_PROCESS_')) return json(res, 422, { ok: false, error: { code: 'PROFILE_IMAGE_DECODE_FAILED', message: 'No se pudo decodificar por completo la imagen. Prueba con otro archivo JPG o PNG.' }, requestId: id }, id, requestOrigin)
         throw error
       }
       if (usedProfileBytes + image.sizeBytes + image.thumbnailSizeBytes > profileImageMaxAccountBytes) {
         await removeProfileImage(image, account.id, kind)
         return json(res, 409, { ok: false, error: { code: 'PROFILE_IMAGE_STORAGE_LIMIT', message: 'Avatar y portada no pueden superar 15 MB en total.' }, requestId: id }, id, requestOrigin)
       }
       let updated: CreatorProfile
       try {
         updated = await repo.saveProfile({ ...current, ...(kind === 'avatar' ? { avatarId: 'custom', avatarImage: image, avatarFocalPoint: focalPoint } : { coverId: 'custom', coverImage: image, coverFocalPoint: focalPoint }) })
       } catch (error) {
         await removeProfileImage(image, account.id, kind)
         throw error
       }
       await removeProfileImage(previous, account.id, kind)
       const packageBadges = (account.purchasedPlanIds || []).filter((planId): planId is 'creator' | 'studio' => planId !== 'free')
       await audit.recordAndWait('update', id, account.id, account.id, true, { resource: `profile-${kind}`, sizeBytes: image.sizeBytes, thumbnailSizeBytes: image.thumbnailSizeBytes, mimeType: image.mimeType })
       return json(res, 200, { ok: true, data: profileForClient(updated, packageBadges), requestId: id }, id, requestOrigin)
     } finally { release() }
   }
   const profileImageReadMatch = path?.match(/^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})\/images\/(avatar|cover)(\/thumbnail)?$/)
   if (profileImageReadMatch && (req.method === 'GET' || req.method === 'HEAD')) {
     const profile = await repo.findProfile(profileImageReadMatch[1])
     const isOwner = profile?.accountId === account?.id
     const isFriend = profile && !profile.publicProfile && !isOwner && await isAcceptedFriend(account?.id, profile.accountId)
     if (!profile || (!profile.publicProfile && !isOwner && !isFriend) || (!profile.publicProfile && isFriend && !profileImageReadMatch[3])) return json(res, 404, { ok: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil no disponible.' }, requestId: id }, id, requestOrigin)
     const kind = profileImageReadMatch[2] as ProfileImageKind
     const image = kind === 'avatar' ? profile.avatarImage : profile.coverImage
     const result = image ? await readProfileImage(image, Boolean(profileImageReadMatch[3]), profile.accountId, kind) : undefined
     if (!result) return json(res, 404, { ok: false, error: { code: 'PROFILE_IMAGE_NOT_FOUND', message: 'La imagen no esta disponible.' }, requestId: id }, id, requestOrigin)
     res.writeHead(200, { 'Content-Type': result.mimeType, 'Content-Length': result.bytes.length, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-site', ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}) })
     return req.method === 'HEAD' ? res.end() : res.end(result.bytes)
   }
   if (path === '/api/profile' && (req.method === 'GET' || req.method === 'PUT')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     let profile: CreatorProfile
     if (req.method === 'PUT') {
       const current = await repo.findProfile(account.id) || emptyProfile(account.id)
       const input = validateProfile(await body(req))
       if ((input.avatarId === 'custom' && !current.avatarImage) || (input.coverId === 'custom' && !current.coverImage)) throw new ValidationError('image', 'La imagen personalizada ya no esta disponible. Vuelve a subirla o elige un preset.')
       profile = await repo.saveProfile({ ...input, accountId: account.id,
         ...(input.avatarId === 'custom' && current.avatarImage ? { avatarImage: current.avatarImage } : {}),
         ...(input.coverId === 'custom' && current.coverImage ? { coverImage: current.coverImage } : {}),
         ...((input.avatarFocalPoint || current.avatarFocalPoint) ? { avatarFocalPoint: input.avatarFocalPoint || current.avatarFocalPoint } : {}),
         ...((input.coverFocalPoint || current.coverFocalPoint) ? { coverFocalPoint: input.coverFocalPoint || current.coverFocalPoint } : {}),
       })
       if (input.avatarId !== 'custom') await removeProfileImage(current.avatarImage, account.id, 'avatar')
       if (input.coverId !== 'custom') await removeProfileImage(current.coverImage, account.id, 'cover')
     } else profile = await repo.findProfile(account.id) || emptyProfile(account.id)
     const packageBadges = (account.purchasedPlanIds || []).filter((planId): planId is 'creator' | 'studio' => planId !== 'free')
     if (req.method === 'PUT') audit.record('update', id, account.id, account.id, true, { resource: 'creator-profile' })
     return json(res, 200, { ok: true, data: profileForClient(profile, packageBadges), requestId: id }, id, requestOrigin)
   }
   const profileMatch = path?.match(/^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})$/)
   if (profileMatch && req.method === 'GET') {
     const profile = await repo.findProfile(profileMatch[1])
     if (!profile || !(await canViewProfile(profile, account?.id))) return json(res, 404, { ok: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil no disponible.' } }, id, requestOrigin)
     if (!profile.publicProfile && profile.accountId !== account?.id) return json(res, 200, { ok: true, data: privateFriendProfileForClient(profile), requestId: id }, id, requestOrigin)
     const profileAccount = await repo.findAccountById(profile.accountId)
     const packageBadges = (profileAccount?.purchasedPlanIds || []).filter((planId): planId is 'creator' | 'studio' => planId !== 'free')
     return json(res, 200, { ok: true, data: profileForClient(profile, packageBadges), requestId: id }, id, requestOrigin)
   }
   if (path === '/api/creators' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!creatorSearchLimiter.allow(account.id)) return limited(res, id, requestOrigin)
     const query = new URL(req.url || '/', 'http://localhost').searchParams.get('q') || ''
     if (query.length > 80) throw new ValidationError('q', 'La búsqueda no puede superar 80 caracteres.')
     const profiles = await repo.listPublicProfiles(query, account.id)
     return json(res, 200, { ok: true, data: profiles.map(directoryProfile), requestId: id }, id, requestOrigin)
   }
   if (path === '/api/notifications' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!notificationLimiter.allow(account.id)) return limited(res, id, requestOrigin)
     const params = new URL(req.url || '/', 'http://localhost').searchParams
     await flushNotificationOutbox().catch(() => undefined)
     const rawLimit = params.get('limit')
     const requestedLimit = rawLimit === null ? 25 : Number(rawLimit)
     if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new ValidationError('limit', 'El límite debe ser un entero positivo.')
     const page = await repo.listNotifications(account.id, { limit: Math.min(50, requestedLimit), cursor: notificationCursor(params.get('cursor')) })
     const items = await Promise.all(page.items.map(async item => {
       const actorProfile = await repo.findProfile(item.actorId)
       const actorVisible = Boolean(actorProfile && await canViewProfile(actorProfile, account.id))
       return {
         id: item.id,
         type: item.type,
         actor: { id: actorVisible ? item.actorId : 'private-creator', displayName: actorVisible ? actorProfile!.displayName : 'BeatVault creator' },
         resource: { type: item.resourceType, id: item.resourceId },
         createdAt: item.createdAt,
         readAt: item.readAt,
       }
     }))
     return json(res, 200, { ok: true, data: { items, unreadCount: page.unreadCount, ...(page.nextCursor ? { nextCursor: encodeNotificationCursor(page.nextCursor) } : {}) }, requestId: id }, id, requestOrigin)
   }
   const markNotificationMatch = path?.match(/^\/api\/notifications\/([a-f0-9-]{36})\/read$/i)
   if (markNotificationMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!notificationLimiter.allow(account.id)) return limited(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const input = await body(req)
     if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 0) throw new ValidationError('body', 'La solicitud no admite campos adicionales.')
     const updated = await repo.markNotificationRead(markNotificationMatch[1], account.id, new Date().toISOString())
     if (!updated) return json(res, 404, { ok: false, error: { code: 'NOTIFICATION_NOT_FOUND', message: 'La notificación no está disponible.' }, requestId: id }, id, requestOrigin)
     return json(res, 200, { ok: true, data: { id: updated.id, readAt: updated.readAt }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/notifications/social' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const activity = await repo.listSocialActivity(account.id)
     const data = await Promise.all(activity.map(async item => {
       const profile = await repo.findProfile(item.actorId)
       const actorVisible = Boolean(profile && await canViewProfile(profile, account.id))
       return { id: item.id, type: item.type, contentId: item.contentId, contentTitle: item.contentTitle, actorId: actorVisible ? item.actorId : 'private-creator', actorName: actorVisible ? profile!.displayName : 'BeatVault creator', body: item.body, createdAt: item.createdAt }
     }))
     return json(res, 200, { ok: true, data, requestId: id }, id, requestOrigin)
   }
   const socialMatch = path?.match(/^\/api\/catalog\/([a-zA-Z0-9_-]{1,80})\/social(?:\/(comments|reaction))?$/)
   if (socialMatch) {
     if (!account) return unauthorized(res, id, requestOrigin)
     const contentId = validateCatalogId(socialMatch[1])
     const content = (await repo.listCatalog()).find(entry => entry.contentId === contentId)
     if (!content || (content.publicationStatus !== 'published' && content.creatorId !== account.id)) return json(res, 404, { ok: false, error: { code: 'CATALOG_NOT_FOUND', message: 'Beat no disponible.' }, requestId: id }, id, requestOrigin)
     const readSocial = async () => {
       const [comments, reactions] = await Promise.all([repo.listSocialComments(contentId), repo.listSocialReactions(contentId)])
       const enriched = await Promise.all(comments.map(async comment => {
         const profile = await repo.findProfile(comment.authorId)
         return { ...comment, authorName: comment.authorId === account.id || profile?.publicProfile ? profile?.displayName || 'Productor' : 'Productor' }
       }))
       return { comments: enriched, reactionCount: reactions.length, reactedByMe: reactions.includes(account.id) }
     }
     if (req.method === 'GET' && !socialMatch[2]) return json(res, 200, { ok: true, data: await readSocial(), requestId: id }, id, requestOrigin)
     if (req.method === 'POST' && socialMatch[2] === 'comments') {
       if (!socialInteractionLimiter.allow(account.id)) return limited(res, id, requestOrigin)
       const value = await body(req)
       const text = value && typeof value === 'object' ? (value as Record<string, unknown>).body : undefined
       if (typeof text !== 'string' || !text.trim() || text.trim().length > 500) throw new ValidationError('body', 'El comentario debe tener entre 1 y 500 caracteres.')
       const profile = await repo.findProfile(account.id)
       const createdAt = new Date().toISOString()
       const commentId = randomUUID()
       await repo.createSocialComment({ id: commentId, contentId, authorId: account.id, authorName: profile?.displayName || 'Productor', body: text.trim(), createdAt })
       if (content.creatorId !== account.id) await repo.recordSocialActivity({ id: commentId, type: 'comment', contentId, contentTitle: content.title, actorId: account.id, actorName: profile?.displayName || 'Productor', body: text.trim(), createdAt })
       if (content.creatorId !== account.id) publishChatEvent(content.creatorId, { type: 'activity', peerId: contentId })
       audit.record('create', id, account.id, content.creatorId, true, { resource: 'catalog-comment' })
       return json(res, 201, { ok: true, data: await readSocial(), requestId: id }, id, requestOrigin)
     }
     if (req.method === 'POST' && socialMatch[2] === 'reaction') {
       if (!socialInteractionLimiter.allow(account.id)) return limited(res, id, requestOrigin)
       const reacted = await repo.toggleSocialReaction(contentId, account.id)
       if (reacted && content.creatorId !== account.id) {
         const profile = await repo.findProfile(account.id)
         await repo.recordSocialActivity({ id: randomUUID(), type: 'reaction', contentId, contentTitle: content.title, actorId: account.id, actorName: profile?.displayName || 'Productor', createdAt: new Date().toISOString() })
         publishChatEvent(content.creatorId, { type: 'activity', peerId: contentId })
       }
       audit.record(reacted ? 'create' : 'delete', id, account.id, content.creatorId, true, { resource: 'catalog-reaction' })
       const reactions = await repo.listSocialReactions(contentId)
       return json(res, 200, { ok: true, data: { reacted, reactionCount: reactions.length }, requestId: id }, id, requestOrigin)
     }
     return json(res, 404, { ok: false, error: { code: 'SOCIAL_ROUTE_NOT_FOUND', message: 'Acción social no encontrada.' }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/friends' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const relationships = await repo.listFriendships(account.id)
     const overview = { friends: [] as Array<{ id: string; profile: ReturnType<typeof directoryProfile> }>, incoming: [] as Array<Friendship & { profile: ReturnType<typeof directoryProfile> }>, outgoing: [] as Array<Friendship & { profile: ReturnType<typeof directoryProfile> }> }
     for (const relation of relationships) {
       const otherId = relation.requesterId === account.id ? relation.recipientId : relation.requesterId
       const profile = await repo.findProfile(otherId)
       if (!profile?.publicProfile) continue
       const safeProfile = directoryProfile(profile)
       if (relation.status === 'accepted') overview.friends.push({ id: relation.id, profile: safeProfile })
       else if (relation.recipientId === account.id) overview.incoming.push({ ...relation, profile: safeProfile })
       else overview.outgoing.push({ ...relation, profile: safeProfile })
     }
     return json(res, 200, { ok: true, data: overview, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/friend-requests' && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const value = await body(req); const targetId = value && typeof value === 'object' ? (value as Record<string, unknown>).targetId : undefined
     if (typeof targetId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(targetId) || targetId === account.id) throw new ValidationError('targetId', 'Selecciona un perfil válido.')
     const target = await repo.findProfile(targetId)
     if (!target?.publicProfile) return json(res, 404, { ok: false, error: { code: 'CREATOR_NOT_FOUND', message: 'Ese perfil no está disponible para solicitudes.' }, requestId: id }, id, requestOrigin)
     const now = new Date().toISOString()
     const friendshipInput = { id: randomUUID(), requesterId: account.id, recipientId: targetId, status: 'pending' as const, createdAt: now, updatedAt: now }
     const result = await repo.createFriendshipWithNotification(friendshipInput, notificationSeed('friend_request', 'friendship', friendshipInput.id, friendshipInput.id))
     const request = result.value
     audit.record('create', id, account.id, targetId, true, { resource: 'friend-request' })
     publishNotifications(result.notifications)
     return json(res, 201, { ok: true, data: request, requestId: id }, id, requestOrigin)
   }
   const acceptRequestMatch = path?.match(/^\/api\/friend-requests\/([a-zA-Z0-9_-]{1,80})\/accept$/)
   if (acceptRequestMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const result = await repo.acceptFriendshipWithNotification(acceptRequestMatch[1], account.id, notificationSeed('friend_request_accepted', 'friendship', acceptRequestMatch[1], acceptRequestMatch[1]))
     const updated = result.value
     if (!updated) return json(res, 404, { ok: false, error: { code: 'REQUEST_NOT_FOUND', message: 'La solicitud ya no está disponible.' }, requestId: id }, id, requestOrigin)
     audit.record('update', id, account.id, updated.requesterId, true, { resource: 'friend-request' })
     publishNotifications(result.notifications)
     return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin)
   }
   const requestMatch = path?.match(/^\/api\/friend-requests\/([a-zA-Z0-9_-]{1,80})$/)
   if (requestMatch && req.method === 'DELETE') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const deleted = await repo.deleteFriendship(requestMatch[1], account.id, 'pending')
     if (!deleted) return json(res, 404, { ok: false, error: { code: 'REQUEST_NOT_FOUND', message: 'La solicitud ya no está disponible.' }, requestId: id }, id, requestOrigin)
     audit.record('delete', id, account.id, undefined, true, { resource: 'friend-request' })
     return json(res, 200, { ok: true, data: { id: requestMatch[1] }, requestId: id }, id, requestOrigin)
   }
   const friendMatch = path?.match(/^\/api\/friends\/([a-zA-Z0-9_-]{1,80})$/)
   if (friendMatch && req.method === 'DELETE') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const deleted = await repo.deleteFriendship(friendMatch[1], account.id, 'accepted')
     if (!deleted) return json(res, 404, { ok: false, error: { code: 'FRIEND_NOT_FOUND', message: 'Esa conexión ya no está disponible.' }, requestId: id }, id, requestOrigin)
     audit.record('delete', id, account.id, undefined, true, { resource: 'friendship' })
     return json(res, 200, { ok: true, data: { id: friendMatch[1] }, requestId: id }, id, requestOrigin)
   }
    const artworkViewMatch = path?.match(/^\/api\/catalog\/([a-zA-Z0-9_-]{1,80})\/artwork(\/thumbnail)?$/)
   if (artworkViewMatch && (req.method === 'GET' || req.method === 'HEAD')) {
     const entry = (await repo.listCatalog()).find(item => item.contentId === artworkViewMatch[1])
     const canViewPrivate = Boolean(account && (entry?.creatorId === account.id || account.role === 'admin'))
     if (!entry || entry.publicationStatus !== 'published' && !canViewPrivate || !entry.assetId) return json(res, 404, { ok: false, error: { code: 'ARTWORK_NOT_FOUND', message: 'Artwork no disponible.' }, requestId: id }, id, requestOrigin)
     const artwork = await repo.findCatalogArtwork(entry.assetId)
     if (!artwork) return json(res, 404, { ok: false, error: { code: 'ARTWORK_NOT_FOUND', message: 'Artwork no disponible.' }, requestId: id }, id, requestOrigin)
      const useThumbnail = artworkViewMatch[2] === '/thumbnail' && Boolean(artwork.thumbnailStorageKey)
      const storageKey = useThumbnail ? artwork.thumbnailStorageKey! : artwork.storageKey
      const expectedSize = useThumbnail ? artwork.thumbnailSizeBytes : artwork.sizeBytes
      const filePath = artworkPath(config.uploadDirectory, storageKey)
     let info
      try { info = await stat(filePath); if (!info.isFile() || info.size !== expectedSize) throw new Error('Artwork unavailable') }
     catch { return json(res, 404, { ok: false, error: { code: 'ARTWORK_NOT_FOUND', message: 'Artwork no disponible.' }, requestId: id }, id, requestOrigin) }
      res.writeHead(200, { 'Content-Type': useThumbnail ? 'image/webp' : artwork.mimeType, 'Content-Length': info.size, 'Content-Disposition': 'inline', 'Cache-Control': entry.publicationStatus === 'published' ? 'public, max-age=3600' : 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}) })
     if (req.method === 'HEAD') return res.end()
     const stream = createReadStream(filePath); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); return stream.pipe(res)
   }
   const publicPreviewMatch = path?.match(/^\/api\/catalog\/([a-zA-Z0-9_-]{1,80})\/preview$/)
   if (publicPreviewMatch && (req.method === 'GET' || req.method === 'HEAD')) {
     const entry = (await repo.listCatalog()).find(item => item.contentId === publicPreviewMatch[1] && item.publicationStatus === 'published')
     const asset = entry?.assetId ? await repo.findAsset(entry.assetId) : undefined
     if (!entry || !asset?.previewStorageKey || asset.state !== 'available') return json(res, 404, { ok: false, error: { code: 'PREVIEW_NOT_FOUND', message: 'Preview no disponible.' }, requestId: id }, id, requestOrigin)
     const previewPath = previewArtifactPath(config.uploadDirectory, asset.previewStorageKey)
     let info
     try { info = await stat(previewPath); if (!info.isFile() || info.size <= 0) throw new Error('Preview artifact unavailable') }
     catch { return json(res, 404, { ok: false, error: { code: 'PREVIEW_NOT_FOUND', message: 'Preview no disponible.' }, requestId: id }, id, requestOrigin) }
     const range = req.headers.range ? parseByteRange(req.headers.range, info.size) : undefined
     if (req.headers.range && !range) { res.setHeader('Content-Range', `bytes */${info.size}`); return json(res, 416, { ok: false, error: { code: 'INVALID_RANGE', message: 'Rango invalido.' }, requestId: id }, id, requestOrigin) }
     const start = range?.start ?? 0; const end = range?.end ?? info.size - 1
     res.writeHead(range ? 206 : 200, { 'Content-Type': 'audio/mp4', 'Content-Length': Math.max(0, end - start + 1), 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Request-Id': id, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}), ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}) })
     if (req.method === 'HEAD' || info.size === 0) return res.end()
     const stream = createReadStream(previewPath, { start, end })
     stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); return stream.pipe(res)
   }
   const previewRetryMatch = path?.match(/^\/api\/assets\/([a-zA-Z0-9_-]{1,80})\/preview\/process$/)
   if (previewRetryMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!previewRetryLimiter.allow(account.id)) return limited(res, id, requestOrigin)
     const result = await retryProcessedPreview(previewRetryMatch[1], account.id, repo)
     if (result === 'missing') return json(res, 404, { ok: false, error: { code: 'ASSET_NOT_AVAILABLE', message: 'No se encontró un audio disponible en tu cuenta.' }, requestId: id }, id, requestOrigin)
     if (result === 'unavailable') return json(res, 503, { ok: false, error: { code: 'PREVIEW_PROCESSING_FAILED', message: 'No se pudo generar el preview. Verifica FFmpeg y vuelve a intentarlo.' }, requestId: id }, id, requestOrigin)
     audit.record('update', id, account.id, previewRetryMatch[1], true, { resource: 'processed-preview' })
     return json(res, 200, { ok: true, data: { id: previewRetryMatch[1], previewReady: true }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/assets/upload' && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const release = uploadConcurrencyLimiter.acquire(account.id)
     if (!release) return json(res, 429, { ok: false, error: { code: 'UPLOAD_CONCURRENCY_LIMIT', message: 'Ya hay dos cargas procesándose en tu cuenta. Espera a que termine una e inténtalo de nuevo.' }, requestId: id }, id, requestOrigin)
     try {
       const accountLimit = await repo.getStorageQuota(account.id)
       const planId = account.planId || 'free'
       const planLimit = getPlanCatalog(config).find(item => item.id === planId)?.storageLimitBytes
       const limitBytes = getEffectiveStorageLimit({ accountLimit, planLimit, serverLimit: config.storageQuotaBytes }).limitBytes ?? undefined
       const result = await receiveUpload(req, account.id, repo, limitBytes)
       return json(res, 201, { ok: true, data: result.asset, requestId: id }, id, requestOrigin)
     } catch (error) {
       if (error instanceof Error && error.message === 'UPLOAD_LIMIT') return json(res, 413, { ok: false, error: { code: 'UPLOAD_LIMIT', message: 'El archivo o la solicitud supera el límite permitido.' }, requestId: id }, id, requestOrigin)
       if (error instanceof Error && error.message === 'STORAGE_QUOTA_EXCEEDED' && 'usedBytes' in error && 'limitBytes' in error) return json(res, 409, { ok: false, error: { code: 'STORAGE_QUOTA_EXCEEDED', message: 'Alcanzaste el almacenamiento disponible para tu cuenta.', usedBytes: error.usedBytes, limitBytes: error.limitBytes }, requestId: id }, id, requestOrigin)
       throw error
     } finally { release() }
   }
   const artworkUploadMatch = path?.match(/^\/api\/assets\/([a-zA-Z0-9_-]{1,80})\/artwork$/)
   if (artworkUploadMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!(await auth.verifyCsrf(session, req.headers['x-csrf-token']?.toString()))) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
     const release = uploadConcurrencyLimiter.acquire(account.id)
     if (!release) return json(res, 429, { ok: false, error: { code: 'UPLOAD_CONCURRENCY_LIMIT', message: 'Ya hay dos cargas procesándose en tu cuenta. Espera a que termine una e inténtalo de nuevo.' }, requestId: id }, id, requestOrigin)
     try {
     const asset = await repo.findAsset(artworkUploadMatch[1], account.id)
     if (!asset || asset.state !== 'available') return json(res, 404, { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'El audio no está disponible en tu cuenta.' }, requestId: id }, id, requestOrigin)
     if (Number(req.headers['content-length']) > maxArtworkBytes) return json(res, 413, { ok: false, error: { code: 'ARTWORK_TOO_LARGE', message: 'El artwork no puede superar 10 MB.' }, requestId: id }, id, requestOrigin)
     const bytes = await readRawBody(req, maxArtworkBytes)
     const format = validateArtwork(bytes, req.headers['content-type'])
     if (!format) return json(res, 400, { ok: false, error: { code: 'ARTWORK_INVALID', message: 'Usa JPG o PNG cuadrado, de 640 a 10 000 px por lado y hasta 10 MB.' }, requestId: id }, id, requestOrigin)
     const accountLimit = await repo.getStorageQuota(account.id)
     const planLimit = getPlanCatalog(config).find(item => item.id === (account.planId || 'free'))?.storageLimitBytes
     const limitBytes = getEffectiveStorageLimit({ accountLimit, planLimit, serverLimit: config.storageQuotaBytes }).limitBytes ?? undefined
     const previous = await repo.findCatalogArtwork(asset.id, account.id)
     if (limitBytes !== undefined) {
       const usedBytes = await repo.getStorageUsage(account.id)
       const previousBytes = (previous?.sizeBytes ?? 0) + (previous?.thumbnailSizeBytes ?? 0)
       if (usedBytes + bytes.length - previousBytes > limitBytes) return json(res, 409, { ok: false, error: { code: 'STORAGE_QUOTA_EXCEEDED', message: 'Alcanzaste el almacenamiento disponible para tu cuenta.', usedBytes, limitBytes }, requestId: id }, id, requestOrigin)
     }
     const stored = await persistArtwork(account.id, asset.id, bytes, format)
     const thumbnailResult = await persistArtworkThumbnail(stored.storageKey)
     if (!thumbnailResult.decoded) {
       await removeArtwork(stored.storageKey)
       return json(res, 422, { ok: false, error: { code: 'ARTWORK_DECODE_FAILED', message: 'No se pudo decodificar la imagen; no se guardó.' }, requestId: id }, id, requestOrigin)
     }
     const record: ArtworkRecord = { ...format, assetId: asset.id, ownerId: account.id, ...stored, ...thumbnailResult.thumbnail, updatedAt: new Date().toISOString() }
     let saved: ArtworkRecord
     try {
       saved = await repo.saveCatalogArtwork(record, limitBytes)
     } catch (error) {
       await removeArtwork(stored.storageKey)
       if (error instanceof StorageQuotaExceededError) return json(res, 409, { ok: false, error: { code: 'STORAGE_QUOTA_EXCEEDED', message: 'Alcanzaste el almacenamiento disponible para tu cuenta.', usedBytes: error.usedBytes, limitBytes: error.limitBytes }, requestId: id }, id, requestOrigin)
       throw error
     }
     if (previous && previous.storageKey !== saved.storageKey) await removeArtwork(previous.storageKey)
     await audit.recordAndWait('create', id, account.id, asset.id, true, { resource: 'catalog-artwork', sizeBytes: saved.sizeBytes, thumbnailSizeBytes: saved.thumbnailSizeBytes ?? 0, mimeType: saved.mimeType })
     return json(res, 201, { ok: true, data: { assetId: saved.assetId, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, thumbnailSizeBytes: saved.thumbnailSizeBytes ?? 0, thumbnailAvailable: Boolean(saved.thumbnailStorageKey), width: saved.width, height: saved.height }, requestId: id }, id, requestOrigin)
     } finally { release() }
   }
   const assetMatch = path?.match(/^\/api\/assets\/([^/]+)\/(preview|download)$/)
   if (assetMatch && (req.method === 'GET' || req.method === 'HEAD')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     const asset = await repo.findAsset(assetMatch[1], account.id)
     if (!asset) return json(res, 404, { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Asset no encontrado.' }, requestId: id }, id, requestOrigin)
     let info
     try { info = await stat(assetPath(asset)) }
     catch { await repo.updateAssetState(asset.id, 'missing'); return json(res, 404, { ok: false, error: { code: 'ASSET_MISSING', message: 'Archivo no disponible.' }, requestId: id }, id, requestOrigin) }
     const range = req.headers.range ? parseByteRange(req.headers.range, info.size) : undefined
     if (req.headers.range && !range) {
       res.setHeader('Content-Range', `bytes */${info.size}`)
       return json(res, 416, { ok: false, error: { code: 'INVALID_RANGE', message: 'Rango invalido.' }, requestId: id }, id, requestOrigin)
     }
     const start = range?.start ?? 0
     const end = range?.end ?? info.size - 1
     const filename = encodeURIComponent(asset.originalName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)
     const headers: Record<string, string | number> = {
       'Content-Type': asset.mimeType, 'Content-Length': Math.max(0, end - start + 1),
       'Accept-Ranges': 'bytes', 'X-Request-Id': id,
       'Content-Disposition': assetMatch[2] === 'download' ? `attachment; filename="download"; filename*=UTF-8''${filename}` : 'inline',
     }
     if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
     res.writeHead(range ? 206 : 200, headers)
     if (req.method === 'HEAD' || info.size === 0) return res.end()
     const stream = createReadStream(assetPath(asset), { start, end })
     stream.on('error', () => res.destroy())
     res.once('close', () => stream.destroy())
     return stream.pipe(res)
   }
   const deleteAssetMatch = path?.match(/^\/api\/assets\/([^/]+)$/); if (deleteAssetMatch && req.method === 'DELETE') { if (!account) return unauthorized(res, id, requestOrigin); const asset = await repo.findAsset(deleteAssetMatch[1], account.id); if (!asset) return json(res, 404, { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Asset no encontrado.' }, requestId: id }, id, requestOrigin); const artwork = await repo.findCatalogArtwork(asset.id, account.id); await repo.deleteAsset(asset.id, account.id); try { await unlink(assetPath(asset)) } catch { /* metadata is already gone; never expose path */ }; if (asset.previewStorageKey) try { await unlink(previewArtifactPath(config.uploadDirectory, asset.previewStorageKey)) } catch { /* derivative may already be absent */ }; if (artwork) await removeArtwork(artwork.storageKey); return json(res, 200, { ok: true, data: { id: asset.id }, requestId: id }, id, requestOrigin) }
  if (req.method === 'GET' && path === '/api/projects') return json(res, 200, { ok: true, data: await repo.listProjects(account?.id), requestId: id }, id, requestOrigin)
  if (req.method === 'POST' && path === '/api/projects') { const input = validateCreateProject(await body(req)); const project: ProjectRecord = { id: randomUUID(), ownerId: account!.id, title: input.title, status: 'draft', updatedAt: new Date().toISOString() }; const created = await repo.createProject(project); audit.record('create', id, account!.id); return json(res, 201, { ok: true, data: created, requestId: id }, id, requestOrigin) }
  const match = path?.match(/^\/api\/projects\/([^/]+)$/); if (match && (req.method === 'PUT' || req.method === 'DELETE')) { const projectId = validateProjectId(match[1]); if (req.method === 'PUT') { const updated = await repo.updateProject(projectId, validateUpdateProject(await body(req)), account!.id); audit.record('update', id, account!.id); return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin) }; await repo.deleteProject(projectId, account!.id); audit.record('delete', id, account!.id); return json(res, 200, { ok: true, data: { id: projectId }, requestId: id }, id, requestOrigin) }
   if (req.method === 'GET' && path === '/api/catalog') {
     const visible = (await repo.listCatalog()).filter(entry => entry.publicationStatus === 'published' || entry.creatorId === account?.id || account?.role === 'admin')
     const entries = await Promise.all(visible.map(async entry => ({ ...(await catalogForAccount(entry, account?.id, account?.role === 'admin')), creatorName: (await repo.findProfile(entry.creatorId))?.displayName || 'Productor' })))
     return json(res, 200, { ok: true, data: { entries, total: entries.length }, requestId: id }, id, requestOrigin)
   }
   if (req.method === 'GET' && path === '/api/marketplace') {
     const params = new URL(req.url || '/', 'http://localhost').searchParams
     const query = (params.get('q') || '').trim().toLocaleLowerCase('en')
     const type = params.get('type')
     const tag = (params.get('tag') || '').trim().toLocaleLowerCase('en')
     const creatorId = params.get('creatorId')
     const limitText = params.get('limit') || '24'
     const limit = Number(limitText)
     const cursor = params.get('cursor')
     if (query.length > 80 || tag.length > 48 || (creatorId !== null && !/^(?:[a-f0-9]{32}|[a-f0-9-]{36}|local-demo)$/i.test(creatorId)) || !Number.isInteger(limit) || limit < 1 || limit > 48 ||
       (type !== null && type !== 'beat' && type !== 'sample') ||
       (cursor !== null && !/^[0-9a-f-]{36}$/i.test(cursor))) {
       throw new ValidationError('query', 'Invalid marketplace filters.')
     }
     const candidates = (await repo.listCatalog())
       .filter(entry => entry.publicationStatus === 'published' && ['beat', 'sample'].includes(entry.type) && (type === null || entry.type === type) && (creatorId === null || entry.creatorId === creatorId))
       .filter(entry => !tag || entry.tagIds.some(item => item.toLocaleLowerCase('en') === tag))
     const searchable = await Promise.all(candidates.map(async entry => {
       const profile = await repo.findProfile(entry.creatorId)
       return { entry, creatorName: profile?.publicProfile ? profile.displayName : 'BeatVault creator' }
     }))
     const all = searchable.filter(({ entry, creatorName }) => !query || `${entry.title} ${creatorName} ${entry.tagIds.join(' ')}`.toLocaleLowerCase('en').includes(query))
     const start = cursor ? all.findIndex(item => item.entry.contentId === cursor) + 1 : 0
     if (cursor && start === 0) throw new ValidationError('cursor', 'Invalid marketplace cursor.')
     const page = all.slice(start, start + limit)
      const entries = await Promise.all(page.map(async ({ entry, creatorName }) => {
        const listing = entry.type === 'beat' ? await repo.findBeatListingDraft(entry.contentId, entry.creatorId) : undefined
        const connected = listing ? await repo.findStripeConnectAccount(entry.creatorId) : undefined
        let purchaseOffers: CatalogEntry['purchaseOffers']
        if (listing && connected && !connected.deauthorized && connected.payoutsEnabled) {
          const evidence = await repo.listSellerEvidence(entry.contentId, entry.creatorId)
          const reviewed = sellerListingWithAdminReview({ ...listing, rights: { ...listing.rights, sampleProofAvailable: listing.rights.sampleDisclosure === 'licensed' && evidence.length > 0 } })
          if (isBeatListingReady(reviewed) && reviewed.adminReview?.decision === 'approve' && reviewed.adminReview.current) {
            purchaseOffers = reviewed.offers.map(({ id, label, amountMinor, currency, deliverables }) => ({ id, label, amountMinor, currency, deliverables }))
          }
        }
        return { ...(await catalogForAccount(entry)), creatorName, ...(purchaseOffers?.length ? { purchaseOffers } : {}) }
      }))
     const hasMore = start + page.length < all.length
     return json(res, 200, { ok: true, data: { entries, total: all.length, ...(hasMore && page.length ? { nextCursor: page[page.length - 1].entry.contentId } : {}) }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/catalog' || path?.startsWith('/api/catalog/')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (req.method === 'POST' && path === '/api/catalog') {
       const input = validateCreateCatalog(await body(req))
       if (['published', 'rejected'].includes(input.publicationStatus)) return json(res, 403, { ok: false, error: { code: 'REVIEW_REQUIRED', message: 'La publicacion requiere revision.' }, requestId: id }, id, requestOrigin)
       if (input.assetId && (await repo.findAsset(input.assetId, account.id))?.state !== 'available') throw new ValidationError('assetId', 'Audio no disponible en tu cuenta.')
       const created = await repo.createCatalog({ contentId: randomUUID(), creatorId: account.id, previewIds: [], ...input })
       await audit.recordAndWait('create', id, account.id, created.contentId, true, { resource: 'catalog-submission' })
       return json(res, 201, { ok: true, data: await catalogForAccount(created, account.id), requestId: id }, id, requestOrigin)
     }
     const catalogMatch = path.match(/^\/api\/catalog\/([^/]+)$/)
     if (catalogMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
       const catalogId = validateCatalogId(catalogMatch[1])
       if (req.method === 'PUT') {
         const input = validateUpdateCatalog(await body(req))
         if (['published', 'rejected'].includes(input.publicationStatus)) return json(res, 403, { ok: false, error: { code: 'REVIEW_REQUIRED', message: 'La publicacion requiere revision.' }, requestId: id }, id, requestOrigin)
         const current = (await repo.listCatalog()).find(entry => entry.contentId === catalogId && entry.creatorId === account.id)
         if (!current) throw new Error('CATALOG_NOT_FOUND')
         if (input.assetId !== undefined && input.assetId !== current.assetId) throw new ValidationError('assetId', 'El audio de una subida no puede sustituirse.')
         const updated = await repo.updateCatalog(catalogId, input, account.id)
         await audit.recordAndWait('update', id, account.id, updated.contentId, true, { resource: 'catalog-submission' })
         return json(res, 200, { ok: true, data: await catalogForAccount(updated, account.id), requestId: id }, id, requestOrigin)
       }
       await repo.deleteCatalog(catalogId, account.id); audit.record('delete', id, account.id)
       return json(res, 200, { ok: true, data: { id: catalogId }, requestId: id }, id, requestOrigin)
     }
   }
   return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' }, requestId: id }, id, requestOrigin)
   } catch (error) { if (error instanceof HttpInputError) return json(res, error.status, { ok: false, error: { code: error.code, message: error.message }, requestId: id }, id, requestOrigin); if (error instanceof ValidationError) return json(res, 400, { ok: false, error: { code: 'VALIDATION_ERROR', message: error.message, field: error.field }, requestId: id }, id, requestOrigin); if (error instanceof StorageQuotaExceededError && path === '/api/posts' || error instanceof Error && 'code' in error && error.code === '23514' && path === '/api/posts') return json(res, 409, { ok: false, error: { code: 'SOCIAL_MEDIA_QUOTA_EXCEEDED', message: 'Alcanzaste el límite de almacenamiento social de 512 MB.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && (error.message === 'SOCIAL_REPORT_EXISTS' || (path?.includes('/reports') && 'code' in error && error.code === '23505'))) return json(res, 409, { ok: false, error: { code: 'SOCIAL_REPORT_EXISTS', message: 'Ya reportaste esta publicación.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'EVIDENCE_TOO_LARGE') return json(res, 413, { ok: false, error: { code: error.message, message: 'Evidence files must not exceed 10 MB.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'EVIDENCE_LIMIT') return json(res, 409, { ok: false, error: { code: error.message, message: 'This beat already has the maximum number of evidence files.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && ['EVIDENCE_CONTENT_TYPE', 'EVIDENCE_FILE_REQUIRED', 'EVIDENCE_SIGNATURE', 'EVIDENCE_EMPTY', 'EVIDENCE_ABORTED', 'EVIDENCE_INVALID_MULTIPART', 'EVIDENCE_PARSE_FAILED'].includes(error.message)) return json(res, 400, { ok: false, error: { code: error.message, message: 'The evidence file is invalid or has an unsupported format.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && (error.message === 'FRIENDSHIP_EXISTS' || (path === '/api/friend-requests' && 'code' in error && error.code === '23505'))) return json(res, 409, { ok: false, error: { code: 'FRIENDSHIP_EXISTS', message: 'Ya hay una solicitud o conexión con ese creador.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && ['UPLOAD_LIMIT', 'UPLOAD_CONTENT_TYPE', 'UPLOAD_FILE_REQUIRED', 'UPLOAD_MIME', 'UPLOAD_SIGNATURE', 'UPLOAD_EMPTY', 'UPLOAD_ABORTED'].includes(error.message)) return json(res, 400, { ok: false, error: { code: error.message, message: 'Upload inválido o excede los límites configurados.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'DUPLICATE_ASSET') return json(res, 409, { ok: false, error: { code: 'DUPLICATE_ASSET', message: 'Este archivo ya existe en tu biblioteca.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'DUPLICATE') return json(res, 409, { ok: false, error: { code: 'DUPLICATE_PROJECT', message: 'Ya existe un proyecto con ese título.' }, requestId: id, }, id, requestOrigin); if (error instanceof Error && error.message === 'DUPLICATE_CATALOG') return json(res, 409, { ok: false, error: { code: 'DUPLICATE_CATALOG', message: 'Ya existe un asset con ese título y tipo.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'NOT_FOUND') return json(res, 404, { ok: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'CATALOG_NOT_FOUND') return json(res, 404, { ok: false, error: { code: 'CATALOG_NOT_FOUND', message: 'Asset no encontrado.' }, requestId: id }, id, requestOrigin); return json(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' }, requestId: id }, id, requestOrigin) } })
let notificationOutboxTimer: NodeJS.Timeout | undefined
export const shutdown = () => { if (notificationOutboxTimer) clearInterval(notificationOutboxTimer); limiter.clear(); socialFeedLimiter.clear(); closeChatStreams(); server.close(); void runtime.close() }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { void Promise.all([auth.initialize(), audit.initialize()]).then(async () => { await reconcileUploads(repo); await reconcileSocialPostMedia(repo); await flushNotificationOutbox().catch(() => undefined); notificationOutboxTimer = setInterval(() => { void flushNotificationOutbox().catch(() => undefined) }, 5000); notificationOutboxTimer.unref(); server.listen(config.port, config.host, () => console.log(`BeatVault API listening on ${config.host}:${config.port}`)); process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown) }).catch(error => { console.error(error instanceof Error ? error.message : 'Configuración inválida'); process.exit(1) }) }
