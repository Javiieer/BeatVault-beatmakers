import { describe, expect, it, vi } from 'vitest'
import { AdminRepository } from './adminRepository'

const overview = { accounts: 1, creators: 1, admins: 0, projects: 2, catalog: 3, auditEntries: 4 }
const account = { id: 'a', email: 'creator@test.local', role: 'creator', verificationState: 'verified' }
const catalog = { contentId: 'c', creatorId: 'a', type: 'beat', title: 'Beat', publicationStatus: 'published' }
describe('AdminRepository', () => {
  it('uses API data when every response is valid', async () => {
    const api = { request: vi.fn().mockResolvedValueOnce({ ok: true, data: overview }).mockResolvedValueOnce({ ok: true, data: [account] }).mockResolvedValueOnce({ ok: true, data: [catalog] }) }
    const loaded = await new AdminRepository(api as never).load()
    expect(loaded.source).toBe('api'); expect(loaded.accounts).toEqual([account])
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
})
