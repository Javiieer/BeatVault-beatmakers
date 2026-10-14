import { ApiClient } from '../api/client'
import { isBeatListingRecord, type BeatListingRecord, type MarketplaceAdminReview } from '../domains/marketplace/sellerListings'
import type { SellerEvidenceView } from '../domains/marketplace/sellerEvidence'

export type MarketplaceReviewItem = {
  listing: BeatListingRecord
  title: string
  creatorId: string
  readyForFinalReview: boolean
  evidence: SellerEvidenceView[]
  latestRecommendation?: { decision: 'recommend' | 'request-changes'; note: string; reviewerId?: string; createdAt: string }
  recommendationCurrent?: boolean
  latestAdminDecision?: MarketplaceAdminReview
}

const isReviewItem = (value: unknown): value is MarketplaceReviewItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const latest = item.latestRecommendation
  const final = item.latestAdminDecision
  const validFinal = final === undefined || Boolean(final && typeof final === 'object' && ['approve', 'reject', 'request-changes'].includes((final as Record<string, unknown>).decision as string) && typeof (final as Record<string, unknown>).note === 'string' && typeof (final as Record<string, unknown>).reviewerId === 'string' && typeof (final as Record<string, unknown>).createdAt === 'string' && typeof (final as Record<string, unknown>).current === 'boolean')
  return isBeatListingRecord(item.listing) && typeof item.title === 'string' && typeof item.creatorId === 'string' && typeof item.readyForFinalReview === 'boolean' && Array.isArray(item.evidence) && validFinal && (item.recommendationCurrent === undefined || typeof item.recommendationCurrent === 'boolean') && (latest === undefined || Boolean(latest && typeof latest === 'object' && ['recommend', 'request-changes'].includes((latest as Record<string, unknown>).decision as string) && typeof (latest as Record<string, unknown>).note === 'string' && typeof (latest as Record<string, unknown>).createdAt === 'string'))
}

export class MarketplaceReviewRepository {
  constructor(private readonly api = new ApiClient()) {}
  list() {
    return this.api.request('/api/staff/marketplace-review', { method: 'GET' }, (value): value is MarketplaceReviewItem[] => Array.isArray(value) && value.every(isReviewItem))
  }
  adminList() {
    return this.api.request('/api/admin/marketplace-listings', { method: 'GET' }, (value): value is MarketplaceReviewItem[] => Array.isArray(value) && value.every(isReviewItem))
  }
  recommend(contentId: string, decision: 'recommend' | 'request-changes', note: string) {
    return this.api.request(`/api/staff/marketplace-review/${encodeURIComponent(contentId)}`, { method: 'POST', body: JSON.stringify({ decision, note }) }, (value): value is { contentId: string; decision: 'recommend' | 'request-changes'; note: string; reviewerId: string; createdAt: string } => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).contentId === contentId && ['recommend', 'request-changes'].includes((value as Record<string, unknown>).decision as string) && typeof (value as Record<string, unknown>).note === 'string' && typeof (value as Record<string, unknown>).createdAt === 'string'))
  }
  finalize(contentId: string, decision: 'approve' | 'reject' | 'request-changes', note: string) {
    return this.api.request(`/api/admin/marketplace-listings/${encodeURIComponent(contentId)}`, { method: 'POST', body: JSON.stringify({ decision, note }) }, (value): value is { contentId: string; decision: 'approve' | 'reject' | 'request-changes'; note: string; reviewerId: string; createdAt: string } => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).contentId === contentId && ['approve', 'reject', 'request-changes'].includes((value as Record<string, unknown>).decision as string) && typeof (value as Record<string, unknown>).note === 'string' && typeof (value as Record<string, unknown>).createdAt === 'string'))
  }
}

export const defaultMarketplaceReviewRepository = new MarketplaceReviewRepository()
