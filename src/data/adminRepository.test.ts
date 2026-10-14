import { describe, expect, it, vi } from 'vitest'
import { AdminRepository } from './adminRepository'

const overview = { accounts: 1, creators: 1, admins: 0, projects: 2, catalog: 3, auditEntries: 4 }
const account = { id: 'a', email: 'creator@test.local', role: 'creator', verificationState: 'verified', planId: 'free' }
const catalog = { contentId: 'c', creatorId: 'a', type: 'beat', title: 'Beat', publicationStatus: 'published' }
const storage = [{ id: 'a', email: 'creator@test.local', role: 'creator', usedBytes: 4096, originalCount: 1, previewBytes: 1024, previewCount: 1, storedBytes: 5120, customQuotaBytes: null }]
describe('AdminRepository', () => {
  it('uses API data when every response is valid', async () => {
    const api = { request: vi.fn().mockResolvedValueOnce({ ok: true, data: overview }).mockResolvedValueOnce({ ok: true, data: [account] }).mockResolvedValueOnce({ ok: true, data: [catalog] }).mockResolvedValueOnce({ ok: true, data: storage }).mockResolvedValueOnce({ ok: true, data: [] }).mockResolvedValueOnce({ ok: true, data: [] }) }
    const loaded = await new AdminRepository(api as never).load()
    expect(loaded.source).toBe('api'); expect(loaded.accounts).toEqual([account]); expect(loaded.storage).toEqual(storage)
  })
  it('falls back when a response is invalid', async () => {
    const api = { request: vi.fn().mockResolvedValue({ ok: false, error: { message: 'invalid response' } }) }
    const result = await new AdminRepository(api as never).load()
    expect(result.source).toBe('fallback'); expect(result.error).toContain('invalid')
  })
  it('sends an explicit review decision and optional rejection reason to the protected API', async () => {
    const api = { request: vi.fn().mockResolvedValue({ ok: true, data: { contentId: 'c', publicationStatus: 'rejected' } }) }
    const result = await new AdminRepository(api as never).review('c', 'reject', 'Fix clipping')
    expect(result).toEqual({ ok: true })
    expect(api.request).toHaveBeenCalledWith('/api/admin/catalog-review/c', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'reject', reason: 'Fix clipping' }) }), expect.any(Function))
  })
  it('sends account quota updates to the protected API', async () => {
    const api = { request: vi.fn().mockResolvedValue({ ok: true, data: { ownerId: 'a', limitBytes: 1048576 } }) }
    const result = await new AdminRepository(api as never).setStorageQuota('a', 1048576)
    expect(result).toEqual({ ok: true })
    expect(api.request).toHaveBeenCalledWith('/api/admin/accounts/a/storage-quota', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ limitBytes: 1048576 }) }), expect.any(Function))
  })
  it('sends account plan assignments to the protected API', async () => {
    const api = { request: vi.fn().mockResolvedValue({ ok: true, data: { accountId: 'a', planId: 'creator' } }) }
    const result = await new AdminRepository(api as never).setPlan('a', 'creator')
    expect(result).toEqual({ ok: true })
    expect(api.request).toHaveBeenCalledWith('/api/admin/accounts/a/plan', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ planId: 'creator' }) }), expect.any(Function))
  })
  it('limits role assignment to creator and community manager roles', async () => {
    const api = { request: vi.fn().mockResolvedValue({ ok: true, data: { accountId: 'a', role: 'community_manager' } }) }
    const result = await new AdminRepository(api as never).setStaffRole('a', 'community_manager')
    expect(result).toEqual({ ok: true })
    expect(api.request).toHaveBeenCalledWith('/api/admin/accounts/a/role', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'community_manager' }) }), expect.any(Function))
  })
  it('requests full order refunds through the administrator API', async () => {
    const api = { request: vi.fn().mockResolvedValue({ ok: true, data: { id: 'order-id', status: 'refund_pending', refundRequestedAt: new Date().toISOString() } }) }
    const result = await new AdminRepository(api as never).refundBeatOrder('order-id')
    expect(result).toEqual({ ok: true })
    expect(api.request).toHaveBeenCalledWith('/api/admin/beat-orders/order-id/refund', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'requested_by_customer' }) }), expect.any(Function))
  })
})
