export const rightsIntakeVersion = 'rights-intake-v1' as const
export const draftOfferTermsVersion = 'non-exclusive-offer-draft-v1' as const

export type SampleDisclosure = 'none' | 'original' | 'licensed'
export type BeatDeliverable = 'mp3' | 'wav' | 'stems'

export type BeatCollaborator = {
  name: string
  role: string
  compositionShareBps: number
  masterShareBps: number
}

export type BeatOfferDraft = {
  id: string
  label: string
  amountMinor: number
  currency: 'USD'
  deliverables: BeatDeliverable[]
  usageSummary: string
  termsVersion: typeof draftOfferTermsVersion
  status: 'draft-only'
}

export type BeatListingInput = {
  description: string
  genre: string
  bpm?: number
  musicalKey?: string
  explicitContent: boolean
  rights: {
    sellerCompositionShareBps: number
    sellerMasterShareBps: number
    sampleDisclosure: SampleDisclosure
    sampleSource?: string
    sampleProofAvailable: boolean
    collaborators: BeatCollaborator[]
    declarationAccepted: boolean
  }
  offers: BeatOfferDraft[]
}

export type BeatListingRecord = BeatListingInput & {
  contentId: string
  ownerId: string
  currency: 'USD'
  status: 'draft-only'
  schemaVersion: 1
  rightsDeclarationVersion: typeof rightsIntakeVersion
  rightsDeclarationAcceptedAt?: string
  createdAt: string
  updatedAt: string
  communityReview?: MarketplaceCommunityReview
  adminReview?: MarketplaceAdminReview
}

export type MarketplaceCommunityReview = {
  decision: 'approve' | 'recommend' | 'request-changes'
  note: string
  reviewerId: string
  createdAt: string
  current: boolean
}

export type MarketplaceAdminReview = {
  decision: 'approve' | 'reject' | 'request-changes'
  note: string
  reviewerId: string
  createdAt: string
  current: boolean
}

export function hasCurrentMarketplaceApproval(listing: Pick<BeatListingRecord, 'communityReview' | 'adminReview'>): boolean {
  const communityApproved = listing.communityReview?.current && (listing.communityReview.decision === 'approve' || listing.communityReview.decision === 'recommend')
  const adminApproved = listing.adminReview?.current && listing.adminReview.decision === 'approve'
  return Boolean(communityApproved || adminApproved)
}
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const isBps = (value: unknown): value is number => Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 10000

export function isBeatListingInput(value: unknown): value is BeatListingInput {
  if (!isObject(value) || typeof value.description !== 'string' || value.description.length > 2000 ||
    typeof value.genre !== 'string' || value.genre.length > 48 ||
    (value.bpm !== undefined && (typeof value.bpm !== 'number' || !Number.isInteger(value.bpm) || value.bpm < 40 || value.bpm > 240)) ||
    (value.musicalKey !== undefined && (typeof value.musicalKey !== 'string' || value.musicalKey.length > 12)) ||
    typeof value.explicitContent !== 'boolean' || !isObject(value.rights) || !Array.isArray(value.offers)) return false

  const rights = value.rights
  if (!isBps(rights.sellerCompositionShareBps) || !isBps(rights.sellerMasterShareBps) ||
    !['none', 'original', 'licensed'].includes(rights.sampleDisclosure as string) ||
    (rights.sampleSource !== undefined && (typeof rights.sampleSource !== 'string' || rights.sampleSource.length > 300)) ||
    typeof rights.sampleProofAvailable !== 'boolean' || typeof rights.declarationAccepted !== 'boolean' ||
    !Array.isArray(rights.collaborators) || rights.collaborators.length > 20) return false

  if (rights.sampleDisclosure !== 'licensed' && (rights.sampleSource !== undefined || rights.sampleProofAvailable)) return false

  const collaborators = rights.collaborators
  if (!collaborators.every(item => isObject(item) && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 100 &&
    typeof item.role === 'string' && item.role.trim().length > 0 && item.role.length <= 80 &&
    isBps(item.compositionShareBps) && isBps(item.masterShareBps))) return false
  if (value.offers.length < 1 || value.offers.length > 5) return false
  const offerIds = new Set<string>()
  return value.offers.every(item => {
    if (!isObject(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) || offerIds.has(item.id) ||
      typeof item.label !== 'string' || item.label.trim().length < 1 || item.label.length > 60 ||
      typeof item.amountMinor !== 'number' || !Number.isSafeInteger(item.amountMinor) || item.amountMinor < 100 || item.amountMinor > 100000000 ||
      item.currency !== 'USD' || !Array.isArray(item.deliverables) || item.deliverables.length < 1 || item.deliverables.length > 3 ||
      !item.deliverables.every(deliverable => ['mp3', 'wav', 'stems'].includes(deliverable as string)) ||
      new Set(item.deliverables).size !== item.deliverables.length ||
      typeof item.usageSummary !== 'string' || item.usageSummary.trim().length < 10 || item.usageSummary.length > 600 ||
      item.termsVersion !== draftOfferTermsVersion || item.status !== 'draft-only') return false
    offerIds.add(item.id)
    return true
  })
}

export function isBeatListingReady(value: unknown): value is BeatListingInput {
  if (!isBeatListingInput(value)) return false
  const rights = value.rights
  const compositionTotal = rights.sellerCompositionShareBps + rights.collaborators.reduce((sum, item) => sum + item.compositionShareBps, 0)
  const masterTotal = rights.sellerMasterShareBps + rights.collaborators.reduce((sum, item) => sum + item.masterShareBps, 0)
  return value.description.trim().length >= 20 && value.genre.trim().length > 0 && compositionTotal === 10000 && masterTotal === 10000 &&
    (rights.sampleDisclosure !== 'licensed' || Boolean(rights.sampleSource?.trim() && rights.sampleProofAvailable)) && rights.declarationAccepted
}

export function isBeatListingRecord(value: unknown): value is BeatListingRecord {
  if (!isObject(value)) return false
  const item = value as unknown as BeatListingRecord
  if (!isBeatListingInput(value) || typeof item.contentId !== 'string' ||
    typeof item.ownerId !== 'string' || item.currency !== 'USD' || item.status !== 'draft-only' ||
    item.schemaVersion !== 1 || item.rightsDeclarationVersion !== rightsIntakeVersion ||
    typeof item.createdAt !== 'string' || Number.isNaN(Date.parse(item.createdAt)) ||
    typeof item.updatedAt !== 'string' || Number.isNaN(Date.parse(item.updatedAt))) return false
  const validDeclarationTime = item.rightsDeclarationAcceptedAt === undefined || typeof item.rightsDeclarationAcceptedAt === 'string' && !Number.isNaN(Date.parse(item.rightsDeclarationAcceptedAt))
  const communityReview = item.communityReview
  const validCommunityReview = communityReview === undefined || Boolean(communityReview && typeof communityReview === 'object' && ['approve', 'recommend', 'request-changes'].includes((communityReview as MarketplaceCommunityReview).decision) && typeof (communityReview as MarketplaceCommunityReview).note === 'string' && typeof (communityReview as MarketplaceCommunityReview).reviewerId === 'string' && typeof (communityReview as MarketplaceCommunityReview).createdAt === 'string' && typeof (communityReview as MarketplaceCommunityReview).current === 'boolean')
  const review = item.adminReview
  const validReview = review === undefined || Boolean(review && typeof review === 'object' && ['approve', 'reject', 'request-changes'].includes((review as MarketplaceAdminReview).decision) && typeof (review as MarketplaceAdminReview).note === 'string' && typeof (review as MarketplaceAdminReview).reviewerId === 'string' && typeof (review as MarketplaceAdminReview).createdAt === 'string' && typeof (review as MarketplaceAdminReview).current === 'boolean')
  return validDeclarationTime && validCommunityReview && validReview
}
