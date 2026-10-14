import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BeatListingRecord } from '../domains/marketplace/sellerListings'
import type { CatalogAsset } from '../data/localCatalog'
import { UploadCard } from './Studio'

const asset: CatalogAsset = {
  id: 'beat-1', name: 'Night Drive', type: 'Beat', metadata: { duration: '2:10', size: '4 MB', format: 'WAV' },
  tags: [], color: '#35d0ba', favorite: false, waveform: [], publicationStatus: 'published',
}

const listing: BeatListingRecord = {
  contentId: asset.id, ownerId: 'seller-1', description: 'A melodic beat prepared for review.', genre: 'R&B', explicitContent: false,
  rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, collaborators: [], declarationAccepted: true },
  offers: [{ id: 'basic', label: 'Basic', amountMinor: 3000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Draft terms pending activation.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
  currency: 'USD', status: 'draft-only', schemaVersion: 1, rightsDeclarationVersion: 'rights-intake-v1',
  createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z',
  communityReview: { decision: 'recommend', note: 'Rights information checked.', reviewerId: 'manager-1', createdAt: '2026-10-12T00:01:00.000Z', current: true },
  adminReview: { decision: 'approve', note: 'Approved for future activation.', reviewerId: 'admin-1', createdAt: '2026-10-12T00:02:00.000Z', current: true },
}

describe('seller marketplace review status', () => {
  it('shows the current community recommendation and clarifies approval does not enable sales', () => {
    render(<UploadCard asset={asset} listing={listing} onPlay={() => undefined} />)

    expect(screen.getByText(/Community Manager recommended this listing for final review/)).toBeInTheDocument()
    expect(screen.getByText(/Listing reviewed for possible future activation; sales remain disabled/)).toBeInTheDocument()
    expect(screen.getByText(/Approved for future activation/)).toBeInTheDocument()
  })

  it('marks both review decisions outdated after the listing changes', () => {
    const staleListing: BeatListingRecord = {
      ...listing,
      communityReview: { ...listing.communityReview!, current: false },
      adminReview: { ...listing.adminReview!, current: false },
    }
    render(<UploadCard asset={asset} listing={staleListing} onPlay={() => undefined} />)

    expect(screen.getByText(/Community Manager review is outdated because the listing or evidence changed/)).toBeInTheDocument()
    expect(screen.getByText(/Listing changed after the decision and needs another review/)).toBeInTheDocument()
  })
})
