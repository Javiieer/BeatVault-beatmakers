import { describe, expect, it } from 'vitest'
import { draftOfferTermsVersion, isBeatListingInput, isBeatListingReady, isBeatListingRecord, rightsIntakeVersion, type BeatListingInput } from './sellerListings'

const validInput: BeatListingInput = {
  description: 'Warm, spacious drums with room for a melodic vocal.',
  genre: 'Hip-hop',
  bpm: 92,
  explicitContent: false,
  rights: { sellerCompositionShareBps: 7000, sellerMasterShareBps: 8000, sampleDisclosure: 'licensed', sampleSource: 'Licensed sample library', sampleProofAvailable: true, declarationAccepted: true, collaborators: [{ name: 'Co-producer', role: 'Producer', compositionShareBps: 3000, masterShareBps: 2000 }] },
  offers: [{ id: 'offer-1', label: 'WAV draft', amountMinor: 3500, currency: 'USD', deliverables: ['wav'], usageSummary: 'Draft usage terms pending legal review.', termsVersion: draftOfferTermsVersion, status: 'draft-only' }],
}

describe('seller beat listing drafts', () => {
  it('keeps legacy stem records readable but excludes them from current sales', () => {
    const legacy = { ...validInput, offers: [{ ...validInput.offers[0], deliverables: ['stems'] }] }
    expect(isBeatListingInput(legacy)).toBe(true)
    expect(isBeatListingReady(legacy)).toBe(false)
  })
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
    expect(isBeatListingRecord({ ...record, communityReview: { decision: 'recommend', note: 'Looks good.', reviewerId: 'cm-1', createdAt: record.updatedAt, current: true } })).toBe(true)
    expect(isBeatListingRecord({ ...record, communityReview: { decision: 'approved', note: 'Looks good.', reviewerId: 'cm-1', createdAt: record.updatedAt, current: true } })).toBe(false)
  })
})
