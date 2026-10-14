import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminRepositoryResult } from '../data/adminRepository'
import { Admin } from './Admin'

const mocks = vi.hoisted(() => ({ load: vi.fn(), savePromotion: vi.fn(), deletePromotion: vi.fn(), review: vi.fn(), setStorageQuota: vi.fn(), setPlan: vi.fn(), refundBeatOrder: vi.fn(), marketplaceList: vi.fn(), marketplaceFinalize: vi.fn() }))
vi.mock('../data/adminRepository', () => ({
  defaultAdminRepository: mocks,
  providerHealth: [],
}))
vi.mock('../data/marketplaceReviewRepository', () => ({ defaultMarketplaceReviewRepository: { adminList: mocks.marketplaceList, finalize: mocks.marketplaceFinalize } }))

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
  })

  it('creates a category-scoped 10% launch rule from the admin form', async () => {
    render(<Admin />)
    await screen.findByRole('heading', { name: 'Precios de referencia y descuentos' })
    fireEvent.change(screen.getByLabelText('Nombre de campaña'), { target: { value: 'Launch sale' } })
    fireEvent.change(screen.getByLabelText('Aplicar a'), { target: { value: 'one-shot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar descuento' }))

    await waitFor(() => expect(mocks.savePromotion).toHaveBeenCalledWith({ name: 'Launch sale', scope: 'one-shot', percentOff: 10, enabled: true }))
  })
})
