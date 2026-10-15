import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogUploadReview } from './CatalogUploadReview'

const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }))
vi.mock('../data/catalogUploadReviewRepository', () => ({
  defaultCatalogUploadReviewRepository: mocks,
}))

describe('CatalogUploadReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ ok: true, data: [{ contentId: 'beat-1', title: 'Night Drive', type: 'beat', creatorId: 'creator-1', previewAvailable: true, previewUrl: '/api/staff/catalog-review/beat-1/preview' }] })
    mocks.decide.mockResolvedValue({ ok: true, data: { contentId: 'beat-1', publicationStatus: 'published' } })
  })

  it('requires a note and sends CM approval for the selected Beat', async () => {
    render(<CatalogUploadReview />)
    expect(await screen.findByText('Night Drive')).toBeTruthy()
    expect(document.querySelector('audio')).toHaveAttribute('src', '/api/staff/catalog-review/beat-1/preview')
    const approve = screen.getByRole('button', { name: 'Approve and publish' })
    expect(approve).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Review note'), { target: { value: 'Preview and metadata verified.' } })
    fireEvent.click(approve)
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('beat-1', 'approve', 'Preview and metadata verified.'))
  })

  it('lets a Community Manager reject a Beat with a review note', async () => {
    render(<CatalogUploadReview />)
    const reject = await screen.findByRole('button', { name: 'Reject Beat' })
    fireEvent.change(screen.getByLabelText('Review note'), { target: { value: 'The preview contains clipping.' } })
    fireEvent.click(reject)
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('beat-1', 'reject', 'The preview contains clipping.'))
  })
})
