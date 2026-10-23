import { describe, expect, it } from 'vitest'
import { draftOfferTermsVersion, hasCurrentMarketplaceApproval, isBeatListingInput, isBeatListingReady, isBeatListingRecord, rightsIntakeVersion, type BeatListingInput, type BeatListingRecord } from './sellerListings'

const validInput: BeatListingInput = {
  description: 'Warm, spacious drums with room for a melodic vocal.',
  genre: 'Hip-hop',
  bpm: 92,
  explicitContent: false,
  rights: { sellerCompositionShareBps: 7000, sellerMasterShareBps: 8000, sampleDisclosure: 'licensed', sampleSource: 'Licensed sample library', sampleProofAvailable: true, declarationAccepted: true, collaborators: [{ name: 'Co-producer', role: 'Producer', compositionShareBps: 3000, masterShareBps: 2000 }] },
  offers: [{ id: 'offer-1', label: 'WAV draft', amountMinor: 3500, currency: 'USD', deliverables: ['wav'], usageSummary: 'Draft usage terms pending legal review.', termsVersion: draftOfferTermsVersion, status: 'draft-only' }],
}

describe('seller beat listing drafts', () => {
  it('accepts separate composition/master splits and USD-only non-binding offer drafts', () => {
    expect(isBeatListingInput(validInput)).toBe(true)
    expect(isBeatListingReady(validInput)).toBe(true)
    expect(isBeatListingReady({ ...validInput, description: '' })).toBe(false)
    expect(isBeatListingRecord({ ...validInput, contentId: 'beat-id', ownerId: 'creator-id', currency: 'USD', status: 'draft-only', schemaVersion: 1, rightsDeclarationVersion: rightsIntakeVersion, rightsDeclarationAcceptedAt: '2026-10-12T00:00:00.000Z', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' })).toBe(true)
  })

  it('rejects inaccurate splits, undisclosed licensed samples, duplicate offers, and unsupported license states', () => {
    expect(isBeatListingInput({ ...validInput, rights: { ...validInput.rights, sellerCompositionShareBps: 10100 } })).toBe(false)
    expect(isBeatListingReady({ ...validInput, rights: { ...validInput.rights, sellerCompositionShareBps: 8000 } })).toBe(false)
    expect(isBeatListingInput({ ...validInput, rights: { ...validInput.rights, sampleProofAvailable: false } })).toBe(true)
    expect(isBeatListingReady({ ...validInput, rights: { ...validInput.rights, sampleProofAvailable: false } })).toBe(false)
    expect(isBeatListingInput({ ...validInput, offers: [validInput.offers[0], validInput.offers[0]] })).toBe(false)
    expect(isBeatListingInput({ ...validInput, offers: [{ ...validInput.offers[0], status: 'active' }] })).toBe(false)
    expect(isBeatListingInput({ ...validInput, offers: [{ ...validInput.offers[0], currency: 'MXN' }] })).toBe(false)
    expect(isBeatListingInput({ ...validInput, description: '' })).toBe(true)
    expect(isBeatListingReady({ ...validInput, rights: { ...validInput.rights, sampleProofAvailable: false } })).toBe(false)
  })

  it('validates the optional seller-visible review stages', () => {
    const record = { ...validInput, contentId: 'beat-id', ownerId: 'creator-id', currency: 'USD', status: 'draft-only', schemaVersion: 1, rightsDeclarationVersion: rightsIntakeVersion, createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' }
    expect(isBeatListingRecord({ ...record, communityReview: { decision: 'approve', note: 'Looks good.', reviewerId: 'cm-1', createdAt: record.updatedAt, current: true } })).toBe(true)
    expect(isBeatListingRecord({ ...record, communityReview: { decision: 'recommend', note: 'Legacy review.', reviewerId: 'cm-1', createdAt: record.updatedAt, current: true } })).toBe(true)
    expect(isBeatListingRecord({ ...record, communityReview: { decision: 'approved', note: 'Looks good.', reviewerId: 'cm-1', createdAt: record.updatedAt, current: true } })).toBe(false)
  })

  it('accepts a current approval from either staff role independently', () => {
    const base = { ...validInput, contentId: 'beat-id', ownerId: 'creator-id', currency: 'USD' as const, status: 'draft-only' as const, schemaVersion: 1 as const, rightsDeclarationVersion: rightsIntakeVersion, createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' }
    const communityApproved: BeatListingRecord = { ...base, communityReview: { decision: 'approve', note: 'Community review complete.', reviewerId: 'cm-1', createdAt: '2026-10-12T00:01:00.000Z', current: true } }
    const adminApproved: BeatListingRecord = { ...base, adminReview: { decision: 'approve', note: 'Admin review complete.', reviewerId: 'admin-1', createdAt: '2026-10-12T00:01:00.000Z', current: true } }

    expect(hasCurrentMarketplaceApproval(communityApproved)).toBe(true)
    expect(hasCurrentMarketplaceApproval(adminApproved)).toBe(true)
    expect(hasCurrentMarketplaceApproval({ ...communityApproved, communityReview: { ...communityApproved.communityReview!, current: false } })).toBe(false)
    expect(hasCurrentMarketplaceApproval({ ...adminApproved, adminReview: { ...adminApproved.adminReview!, current: false } })).toBe(false)
  })
})
