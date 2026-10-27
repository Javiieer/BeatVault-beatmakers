import { createHash } from 'node:crypto'
import type { BeatListingRecord, MarketplaceAdminReview, MarketplaceCommunityReview } from '../src/domains/marketplace/sellerListings'
import type { SellerEvidenceRecord } from '../src/domains/marketplace/sellerEvidence'
import type { AuditEvent } from './security'

export type MarketplaceReviewState = { contentId: string; ownerId: string; revision: string; communityReview?: MarketplaceCommunityReview; adminReview?: MarketplaceAdminReview }
export type MarketplaceReviewWrite = { contentId: string; ownerId: string; expectedRevision: string; stage: 'community' | 'admin'; review: MarketplaceCommunityReview | MarketplaceAdminReview }
export type MarketplaceReviewJournal = MarketplaceReviewState & { auditOutbox?: AuditEvent[] }
export const marketplaceRevision = (listing: BeatListingRecord, evidence: SellerEvidenceRecord[]): string => createHash('sha256').update(JSON.stringify({
  contentId: listing.contentId, ownerId: listing.ownerId, updatedAt: listing.updatedAt, evidenceRevision: (listing as BeatListingRecord & { reviewEvidenceRevision?: string }).reviewEvidenceRevision || 'legacy',
  description: listing.description, genre: listing.genre, bpm: listing.bpm, musicalKey: listing.musicalKey, explicitContent: listing.explicitContent,
  rights: { sellerCompositionShareBps: listing.rights.sellerCompositionShareBps, sellerMasterShareBps: listing.rights.sellerMasterShareBps, sampleDisclosure: listing.rights.sampleDisclosure, sampleSource: listing.rights.sampleSource, declarationAccepted: listing.rights.declarationAccepted, collaborators: listing.rights.collaborators.map(item => ({ name: item.name, role: item.role, compositionShareBps: item.compositionShareBps, masterShareBps: item.masterShareBps })) },
  offers: listing.offers.map(item => ({ id: item.id, label: item.label, amountMinor: item.amountMinor, currency: item.currency, deliverables: item.deliverables, usageSummary: item.usageSummary, termsVersion: item.termsVersion, status: item.status })),
  evidence: [...evidence].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({ id: item.id, contentHash: item.contentHash, sizeBytes: item.sizeBytes, createdAt: item.createdAt })),
})).digest('hex')

export function applyMarketplaceReview(previous: MarketplaceReviewState | undefined, input: MarketplaceReviewWrite, actorRole: string | undefined, recommenderRole?: string): MarketplaceReviewState {
  if (input.review.reviewerId === input.ownerId) throw new Error('SELF_REVIEW_FORBIDDEN')
  if (input.stage === 'community' && !['admin', 'community_manager'].includes(actorRole || '') || input.stage === 'admin' && actorRole !== 'admin') throw new Error('REVIEW_ROLE_REQUIRED')
  const current = previous?.revision === input.expectedRevision ? previous : undefined
  if (input.stage === 'community') return { contentId: input.contentId, ownerId: input.ownerId, revision: input.expectedRevision, communityReview: input.review as MarketplaceCommunityReview }
  if (input.review.decision === 'approve' && (!current?.communityReview?.current || current.communityReview.decision !== 'recommend' || current.communityReview.reviewerId === input.review.reviewerId || recommenderRole !== 'community_manager')) throw new Error('COMMUNITY_RECOMMENDATION_REQUIRED')
  return { contentId: input.contentId, ownerId: input.ownerId, revision: input.expectedRevision, ...(current?.communityReview ? { communityReview: current.communityReview } : {}), adminReview: input.review as MarketplaceAdminReview }
}
export function isMarketplaceReviewState(value: unknown): value is MarketplaceReviewJournal {
  if (!value || typeof value !== 'object') return false
  const state = value as MarketplaceReviewJournal
  const validReview = (review: MarketplaceAdminReview | MarketplaceCommunityReview | undefined) => !review || typeof review.reviewerId === 'string' && typeof review.note === 'string' && review.note.length <= 160 && typeof review.createdAt === 'string' && Number.isFinite(Date.parse(review.createdAt))
  const validAudit = (item: AuditEvent) => Boolean(item && typeof item.id === 'string' && typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)) && typeof item.requestId === 'string' && typeof item.actorId === 'string' && item.actorId !== state.ownerId && item.targetId === state.contentId && item.success === true && item.metadata && typeof item.metadata === 'object' && typeof item.metadata.note === 'string' && item.metadata.note.length <= 160 && (item.action === 'marketplace_review_recommendation' && ['recommend','request-changes'].includes(String(item.metadata.decision)) || item.action === 'marketplace_admin_decision' && ['approve','reject','request-changes'].includes(String(item.metadata.decision))))
  return typeof state.contentId === 'string' && typeof state.ownerId === 'string' && typeof state.revision === 'string' && (/^[a-f0-9]{64}$/.test(state.revision) || state.revision === 'legacy-stale') && validReview(state.communityReview) && validReview(state.adminReview) &&
    (!state.communityReview || ['recommend', 'request-changes'].includes(state.communityReview.decision) && typeof state.communityReview.current === 'boolean') &&
    (!state.adminReview || ['approve', 'reject', 'request-changes'].includes(state.adminReview.decision) && typeof state.adminReview.current === 'boolean') &&
    (!state.auditOutbox || Array.isArray(state.auditOutbox) && state.auditOutbox.every(validAudit))
}
