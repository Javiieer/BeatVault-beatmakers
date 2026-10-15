import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminRepositoryResult } from '../data/adminRepository'
import { Admin } from './Admin'

const mocks = vi.hoisted(() => ({ load: vi.fn(), savePromotion: vi.fn(), deletePromotion: vi.fn(), review: vi.fn(), setStorageQuota: vi.fn(), setPlan: vi.fn(), refundBeatOrder: vi.fn(), marketplaceList: vi.fn(), marketplaceFinalize: vi.fn(), readSocialModerationPosts: vi.fn(), readSocialModerationReports: vi.fn(), reviewSocialPost: vi.fn(), reviewSocialPostReport: vi.fn() }))
vi.mock('../data/adminRepository', () => ({
  defaultAdminRepository: mocks,
  providerHealth: [],
}))
vi.mock('../data/marketplaceReviewRepository', () => ({ defaultMarketplaceReviewRepository: { adminList: mocks.marketplaceList, finalize: mocks.marketplaceFinalize } }))
vi.mock('../data/socialPostRepository', () => ({ readSocialModerationPosts: mocks.readSocialModerationPosts, readSocialModerationReports: mocks.readSocialModerationReports, reviewSocialPost: mocks.reviewSocialPost, reviewSocialPostReport: mocks.reviewSocialPostReport }))

const result = {
  source: 'api', overview: { accounts: 0, creators: 0, admins: 0, projects: 0, catalog: 0, auditEntries: 0 },
  accounts: [], catalog: [], storage: [], promotions: [], beatOrders: [], rows: [],
} as unknown as AdminRepositoryResult

describe('Admin promotion controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.load.mockResolvedValue(result)
    mocks.savePromotion.mockResolvedValue({ ok: true })
    mocks.marketplaceList.mockResolvedValue({ ok: true, data: [] })
    mocks.readSocialModerationPosts.mockResolvedValue({ ok: true, data: { posts: [{ id: 'post-pending', author: { id: 'creator-1', displayName: 'Creator One' }, kind: 'status', body: 'Awaiting moderation', audience: 'public', visibility: 'pending-review', createdAt: '2026-10-15T10:00:00.000Z' }] } })
    mocks.readSocialModerationReports.mockResolvedValue({ ok: true, data: { reports: [{ id: 'report-1', postId: 'post-pending', reporterId: 'reporter-1', reason: 'spam', details: 'Repeated advertising', status: 'open', createdAt: '2026-10-15T10:10:00.000Z', post: { id: 'post-pending', author: { id: 'creator-1', displayName: 'Creator One' }, kind: 'status', body: 'Awaiting moderation', audience: 'public', visibility: 'pending-review', createdAt: '2026-10-15T10:00:00.000Z' } }] } })
    mocks.reviewSocialPost.mockResolvedValue({ ok: true, data: { id: 'post-pending' } })
    mocks.reviewSocialPostReport.mockResolvedValue({ ok: true, data: { id: 'report-1', status: 'dismissed' } })
  })

  it('creates a category-scoped 10% launch rule from the admin form', async () => {
    render(<Admin />)
    await screen.findByRole('heading', { name: 'Precios de referencia y descuentos' })
    fireEvent.change(screen.getByLabelText('Nombre de campaña'), { target: { value: 'Launch sale' } })
    fireEvent.change(screen.getByLabelText('Aplicar a'), { target: { value: 'one-shot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar descuento' }))

    await waitFor(() => expect(mocks.savePromotion).toHaveBeenCalledWith({ name: 'Launch sale', scope: 'one-shot', percentOff: 10, enabled: true }))
  })

  it('moderates pending social posts and resolves open reports through the staff API', async () => {
    render(<Admin />)
    expect(await screen.findAllByText('Awaiting moderation')).toHaveLength(2)
    expect(screen.getByText('Repeated advertising')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(mocks.reviewSocialPost).toHaveBeenCalledWith('post-pending', 'published', ''))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar reporte' }))
    await waitFor(() => expect(mocks.reviewSocialPostReport).toHaveBeenCalledWith('report-1', 'dismissed'))
  })
})
