import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceReview } from './MarketplaceReview'

const mocks = vi.hoisted(() => ({ list: vi.fn(), reviewCommunity: vi.fn() }))
vi.mock('../data/marketplaceReviewRepository', () => ({ defaultMarketplaceReviewRepository: mocks }))

const item = {
  listing: {
    contentId: 'beat-cm-approval', ownerId: 'seller-1', description: 'A complete beat listing with sufficient detail for review.', genre: 'Hip-hop', explicitContent: false,
    rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, collaborators: [], declarationAccepted: true },
    offers: [{ id: 'offer-1', label: 'Basic', amountMinor: 3000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Preliminary terms; final agreement is not enabled.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
    currency: 'USD', status: 'draft-only', schemaVersion: 1, rightsDeclarationVersion: 'rights-intake-v1', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z',
  },
  title: 'Night Drive', creatorId: 'seller-1', readyForReview: true, commercialReviewApproved: false, evidence: [], communityReviewCurrent: false,
}

describe('Community Manager marketplace commercial review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ ok: true, data: [item] })
    mocks.reviewCommunity.mockResolvedValue({ ok: true, data: { contentId: 'beat-cm-approval', decision: 'approve', note: 'Reviewed and ready for commercial review.', reviewerId: 'manager-1', createdAt: '2026-10-12T00:01:00.000Z' } })
  })

  it('lets Community Manager approve without an Admin decision', async () => {
    render(<MarketplaceReview />)
    const approve = await screen.findByRole('button', { name: 'Approve commercial review' })
    expect(approve).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Review note'), { target: { value: 'Reviewed and ready for commercial review.' } })
    fireEvent.click(approve)
    await waitFor(() => expect(mocks.reviewCommunity).toHaveBeenCalledWith('beat-cm-approval', 'approve', 'Reviewed and ready for commercial review.'))
    expect(screen.getByText(/does not grant payment, refund, price, payout, or account administration controls/i)).toBeInTheDocument()
  })
})
