import { ApiClient } from '../api/client'
import { adminMetrics, accountReviews, moderationQueue, promotionSummary, providerHealth, type AdminRow } from './admin'

export type AdminOverview = { accounts: number; creators: number; admins: number; projects: number; catalog: number; auditEntries: number }
export type AdminAccount = { id: string; email: string; role: 'creator' | 'admin'; verificationState: 'unverified' | 'pending' | 'verified'; planId: 'free' | 'creator' | 'studio' }
export type AdminStorageAccount = Pick<AdminAccount, 'id' | 'email' | 'role'> & { usedBytes: number; originalCount: number; previewBytes: number; previewCount: number; storedBytes: number; customQuotaBytes: number | null }
export type AdminCatalog = { contentId: string; creatorId: string; type: string; title: string; publicationStatus: string }
export type AdminPayload = { overview: AdminOverview; accounts: AdminAccount[]; catalog: AdminCatalog[] }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const isOverview = (value: unknown): value is AdminOverview => object(value) && ['accounts', 'creators', 'admins', 'projects', 'catalog', 'auditEntries'].every(key => typeof value[key] === 'number')
const isAccounts = (value: unknown): value is AdminAccount[] => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string' && typeof item.email === 'string' && (item.role === 'creator' || item.role === 'admin') && typeof item.verificationState === 'string' && ['free', 'creator', 'studio'].includes(item.planId as string))
const isCatalog = (value: unknown): value is AdminCatalog[] => Array.isArray(value) && value.every(item => object(item) && typeof item.contentId === 'string' && typeof item.creatorId === 'string' && typeof item.title === 'string' && typeof item.type === 'string' && typeof item.publicationStatus === 'string')
const isStorage = (value: unknown): value is AdminStorageAccount[] => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string' && typeof item.email === 'string' && (item.role === 'creator' || item.role === 'admin') && ['usedBytes', 'originalCount', 'previewBytes', 'previewCount', 'storedBytes'].every(key => typeof item[key] === 'number' && Number.isSafeInteger(item[key]) && (item[key] as number) >= 0) && (item.customQuotaBytes === null || typeof item.customQuotaBytes === 'number' && Number.isSafeInteger(item.customQuotaBytes) && item.customQuotaBytes > 0))
export type AdminRepositoryResult = { source: 'api' | 'fallback'; overview: AdminOverview; accounts: AdminAccount[]; catalog: AdminCatalog[]; storage: AdminStorageAccount[]; rows: readonly AdminRow[]; error?: string }
export class AdminRepository {
  constructor(private readonly api = new ApiClient()) {}
  async load(): Promise<AdminRepositoryResult> {
    const [overview, accounts, catalog, storage] = await Promise.all([
      this.api.request('/api/admin/overview', { method: 'GET' }, isOverview),
      this.api.request('/api/admin/accounts', { method: 'GET' }, isAccounts),
      this.api.request('/api/admin/catalog-review', { method: 'GET' }, isCatalog),
      this.api.request('/api/admin/storage', { method: 'GET' }, isStorage),
    ])
    if (overview.ok && accounts.ok && catalog.ok && storage.ok) return { source: 'api', overview: overview.data, accounts: accounts.data, catalog: catalog.data, storage: storage.data, rows: [] }
    const error = [overview, accounts, catalog, storage].find(result => !result.ok)?.error.message || 'API no disponible.'
    return { source: 'fallback', overview: { accounts: Number(adminMetrics[0][1]), creators: 0, admins: 1, projects: 0, catalog: 0, auditEntries: 0 }, accounts: [], catalog: [], storage: [], rows: [...accountReviews, ...moderationQueue, ...promotionSummary], error }
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
}
export const defaultAdminRepository = new AdminRepository()
export { providerHealth }
