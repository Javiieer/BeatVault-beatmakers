import { ApiClient } from '../api/client'
import { adminMetrics, accountReviews, moderationQueue, promotionSummary, providerHealth, type AdminRow } from './admin'
import { isPromotionRule, type PromotionInput, type PromotionRule } from '../domains/marketplace/promotions'

export type AdminOverview = { accounts: number; creators: number; admins: number; projects: number; catalog: number; auditEntries: number }
export type AdminAccount = { id: string; email: string; role: 'creator' | 'community_manager' | 'admin'; verificationState: 'unverified' | 'pending' | 'verified'; planId: 'free' | 'creator' | 'studio' }
export type AdminStorageAccount = Pick<AdminAccount, 'id' | 'email' | 'role'> & { usedBytes: number; originalCount: number; artworkBytes: number; artworkCount: number; previewBytes: number; previewCount: number; storedBytes: number; customQuotaBytes: number | null }
export type AdminCatalog = { contentId: string; creatorId: string; type: string; title: string; publicationStatus: string }
export type AdminBeatOrder = { id: string; buyerId: string; sellerId: string; title: string; offerId: string; amountMinor: number; currency: 'usd'; status: string; createdAt: string; paidAt?: string; refundRequestedAt?: string; disputeId?: string; disputeReason?: string }
export type AdminPayload = { overview: AdminOverview; accounts: AdminAccount[]; catalog: AdminCatalog[] }
const isPromotions = (value: unknown): value is PromotionRule[] => Array.isArray(value) && value.every(isPromotionRule)
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const isOverview = (value: unknown): value is AdminOverview => object(value) && ['accounts', 'creators', 'admins', 'projects', 'catalog', 'auditEntries'].every(key => typeof value[key] === 'number')
const isRole = (role: unknown): role is AdminAccount['role'] => role === 'creator' || role === 'community_manager' || role === 'admin'
const isAccounts = (value: unknown): value is AdminAccount[] => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string' && typeof item.email === 'string' && isRole(item.role) && typeof item.verificationState === 'string' && ['free', 'creator', 'studio'].includes(item.planId as string))
const isCatalog = (value: unknown): value is AdminCatalog[] => Array.isArray(value) && value.every(item => object(item) && typeof item.contentId === 'string' && typeof item.creatorId === 'string' && typeof item.title === 'string' && typeof item.type === 'string' && typeof item.publicationStatus === 'string')
const isBeatOrders = (value: unknown): value is AdminBeatOrder[] => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string' && typeof item.buyerId === 'string' && typeof item.sellerId === 'string' && typeof item.title === 'string' && typeof item.offerId === 'string' && Number.isSafeInteger(item.amountMinor) && item.currency === 'usd' && typeof item.status === 'string' && typeof item.createdAt === 'string')
const isStorage = (value: unknown): value is AdminStorageAccount[] => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string' && typeof item.email === 'string' && isRole(item.role) && ['usedBytes', 'originalCount', 'artworkBytes', 'artworkCount', 'previewBytes', 'previewCount', 'storedBytes'].every(key => typeof item[key] === 'number' && Number.isSafeInteger(item[key]) && (item[key] as number) >= 0) && (item.customQuotaBytes === null || typeof item.customQuotaBytes === 'number' && Number.isSafeInteger(item.customQuotaBytes) && item.customQuotaBytes > 0))
export type AdminRepositoryResult = { source: 'api' | 'fallback'; overview: AdminOverview; accounts: AdminAccount[]; catalog: AdminCatalog[]; storage: AdminStorageAccount[]; promotions: PromotionRule[]; beatOrders: AdminBeatOrder[]; rows: readonly AdminRow[]; error?: string }
export class AdminRepository {
  constructor(private readonly api = new ApiClient()) {}
  async load(): Promise<AdminRepositoryResult> {
    const [overview, accounts, catalog, storage, promotions, beatOrders] = await Promise.all([
      this.api.request('/api/admin/overview', { method: 'GET' }, isOverview),
      this.api.request('/api/admin/accounts', { method: 'GET' }, isAccounts),
      this.api.request('/api/admin/catalog-review', { method: 'GET' }, isCatalog),
      this.api.request('/api/admin/storage', { method: 'GET' }, isStorage),
      this.api.request('/api/admin/promotions', { method: 'GET' }, isPromotions),
      this.api.request('/api/admin/beat-orders', { method: 'GET' }, isBeatOrders),
    ])
    if (overview.ok && accounts.ok && catalog.ok && storage.ok && promotions.ok && beatOrders.ok) return { source: 'api', overview: overview.data, accounts: accounts.data, catalog: catalog.data, storage: storage.data, promotions: promotions.data, beatOrders: beatOrders.data, rows: [] }
    const error = [overview, accounts, catalog, storage, promotions, beatOrders].find(result => !result.ok)?.error.message || 'API no disponible.'
    return { source: 'fallback', overview: { accounts: Number(adminMetrics[0][1]), creators: 0, admins: 1, projects: 0, catalog: 0, auditEntries: 0 }, accounts: [], catalog: [], storage: [], promotions: [], beatOrders: [], rows: [...accountReviews, ...moderationQueue, ...promotionSummary], error }
  }
  async savePromotion(input: PromotionInput, id?: string): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(id ? `/api/admin/promotions/${encodeURIComponent(id)}` : '/api/admin/promotions', {
      method: id ? 'PATCH' : 'POST', body: JSON.stringify(input),
    }, isPromotionRule)
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  async deletePromotion(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' }, (value): value is { id: string } => object(value) && value.id === id)
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  async review(contentId: string, decision: 'approve' | 'reject', reason = ''): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/catalog-review/${encodeURIComponent(contentId)}`, {
      method: 'POST', body: JSON.stringify({ decision, reason }),
    }, (value): value is { contentId: string; publicationStatus: string } => object(value) && value.contentId === contentId && typeof value.publicationStatus === 'string')
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  async setStorageQuota(accountId: string, limitBytes: number | null): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/accounts/${encodeURIComponent(accountId)}/storage-quota`, {
      method: 'PATCH', body: JSON.stringify({ limitBytes }),
    }, (value): value is { ownerId: string; limitBytes: number | null } => object(value) && value.ownerId === accountId && (value.limitBytes === null || Number.isSafeInteger(value.limitBytes) && typeof value.limitBytes === 'number' && value.limitBytes > 0))
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  async setPlan(accountId: string, planId: AdminAccount['planId']): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/accounts/${encodeURIComponent(accountId)}/plan`, {
      method: 'PATCH', body: JSON.stringify({ planId }),
    }, (value): value is { accountId: string; planId: AdminAccount['planId'] } => object(value) && value.accountId === accountId && value.planId === planId)
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  async setStaffRole(accountId: string, role: 'creator' | 'community_manager'): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/accounts/${encodeURIComponent(accountId)}/role`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    }, (value): value is { accountId: string; role: 'creator' | 'community_manager' } => object(value) && value.accountId === accountId && (value.role === 'creator' || value.role === 'community_manager'))
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  async refundBeatOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/beat-orders/${encodeURIComponent(orderId)}/refund`, {
      method: 'POST', body: JSON.stringify({ reason: 'requested_by_customer' }),
    }, (value): value is { id: string; status: string; refundRequestedAt: string } => object(value) && value.id === orderId && value.status === 'refund_pending' && typeof value.refundRequestedAt === 'string')
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
}
export const defaultAdminRepository = new AdminRepository()
export { providerHealth }
