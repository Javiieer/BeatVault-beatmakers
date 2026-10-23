import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminMarketplaceReview } from './AdminMarketplaceReview'

const mocks = vi.hoisted(() => ({ adminList: vi.fn(), finalize: vi.fn() }))
vi.mock('../data/marketplaceReviewRepository', () => ({ defaultMarketplaceReviewRepository: mocks }))

const item = {
  listing: {
    contentId: 'beat-123', ownerId: 'seller-1', description: 'A complete seller listing with proper artist details.', genre: 'Hip-hop', explicitContent: false,
    rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, collaborators: [], declarationAccepted: true },
    offers: [{ id: 'offer-1', label: 'Standard', amountMinor: 3000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Draft terms pending marketplace activation.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
    currency: 'USD', status: 'draft-only', schemaVersion: 1, rightsDeclarationVersion: 'rights-intake-v1', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z',
  },
  title: 'Night Drive', creatorId: 'seller-1', readyForReview: true, commercialReviewApproved: false, evidence: [], communityReviewCurrent: false,
}

describe('Admin marketplace commercial review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.adminList.mockResolvedValue({ ok: true, data: [item] })
    mocks.finalize.mockResolvedValue({ ok: true, data: { contentId: 'beat-123', decision: 'approve', note: 'Reviewed and ready for future activation.', reviewerId: 'admin-1', createdAt: '2026-10-12T00:02:00.000Z' } })
  })

  it('lets Admin approve a complete listing without a Community Manager review', async () => {
    render(<AdminMarketplaceReview />)
    const approve = await screen.findByRole('button', { name: 'Approve commercial review' })
    expect(approve).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Reviewed and ready for future activation.' } })
    fireEvent.click(approve)
    await waitFor(() => expect(mocks.finalize).toHaveBeenCalledWith('beat-123', 'approve', 'Reviewed and ready for future activation.'))
    expect(screen.getByText(/Admin y Community Manager pueden aprobar la ficha comercial por separado/i)).toBeInTheDocument()
  })
})
