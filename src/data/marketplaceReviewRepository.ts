import { ApiClient } from '../api/client'
import { isBeatListingRecord, type BeatListingRecord, type MarketplaceAdminReview, type MarketplaceCommunityReview } from '../domains/marketplace/sellerListings'
import type { SellerEvidenceView } from '../domains/marketplace/sellerEvidence'

export type MarketplaceReviewItem = {
  listing: BeatListingRecord
  title: string
  creatorId: string
  readyForReview: boolean
  commercialReviewApproved: boolean
  evidence: SellerEvidenceView[]
  latestCommunityReview?: MarketplaceCommunityReview
  communityReviewCurrent: boolean
  latestAdminDecision?: MarketplaceAdminReview
}

const isReviewItem = (value: unknown): value is MarketplaceReviewItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const community = item.latestCommunityReview
  const admin = item.latestAdminDecision
  const validCommunity = community === undefined || Boolean(community && typeof community === 'object' && ['approve', 'recommend', 'request-changes'].includes((community as Record<string, unknown>).decision as string) && typeof (community as Record<string, unknown>).note === 'string' && typeof (community as Record<string, unknown>).reviewerId === 'string' && typeof (community as Record<string, unknown>).createdAt === 'string' && typeof (community as Record<string, unknown>).current === 'boolean')
  const validAdmin = admin === undefined || Boolean(admin && typeof admin === 'object' && ['approve', 'reject', 'request-changes'].includes((admin as Record<string, unknown>).decision as string) && typeof (admin as Record<string, unknown>).note === 'string' && typeof (admin as Record<string, unknown>).reviewerId === 'string' && typeof (admin as Record<string, unknown>).createdAt === 'string' && typeof (admin as Record<string, unknown>).current === 'boolean')
  return isBeatListingRecord(item.listing) && typeof item.title === 'string' && typeof item.creatorId === 'string' && typeof item.readyForReview === 'boolean' && typeof item.commercialReviewApproved === 'boolean' && Array.isArray(item.evidence) && typeof item.communityReviewCurrent === 'boolean' && validCommunity && validAdmin
}

export class MarketplaceReviewRepository {
  constructor(private readonly api = new ApiClient()) {}
  list() {
    return this.api.request('/api/staff/marketplace-review', { method: 'GET' }, (value): value is MarketplaceReviewItem[] => Array.isArray(value) && value.every(isReviewItem))
  }
  adminList() {
    return this.api.request('/api/admin/marketplace-listings', { method: 'GET' }, (value): value is MarketplaceReviewItem[] => Array.isArray(value) && value.every(isReviewItem))
  }
  reviewCommunity(contentId: string, decision: 'approve' | 'request-changes', note: string) {
    return this.api.request(`/api/staff/marketplace-review/${encodeURIComponent(contentId)}`, { method: 'POST', body: JSON.stringify({ decision, note }) }, (value): value is { contentId: string; decision: 'approve' | 'request-changes'; note: string; reviewerId: string; createdAt: string } => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).contentId === contentId && ['approve', 'request-changes'].includes((value as Record<string, unknown>).decision as string) && typeof (value as Record<string, unknown>).note === 'string' && typeof (value as Record<string, unknown>).createdAt === 'string'))
  }
  finalize(contentId: string, decision: 'approve' | 'reject' | 'request-changes', note: string) {
    return this.api.request(`/api/admin/marketplace-listings/${encodeURIComponent(contentId)}`, { method: 'POST', body: JSON.stringify({ decision, note }) }, (value): value is { contentId: string; decision: 'approve' | 'reject' | 'request-changes'; note: string; reviewerId: string; createdAt: string } => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).contentId === contentId && ['approve', 'reject', 'request-changes'].includes((value as Record<string, unknown>).decision as string) && typeof (value as Record<string, unknown>).note === 'string' && typeof (value as Record<string, unknown>).createdAt === 'string'))
  }
}

export const defaultMarketplaceReviewRepository = new MarketplaceReviewRepository()
