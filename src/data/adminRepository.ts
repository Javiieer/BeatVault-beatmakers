import { ApiClient } from '../api/client'
import { adminMetrics, accountReviews, moderationQueue, promotionSummary, providerHealth, type AdminRow } from './admin'

export type AdminOverview = { accounts: number; creators: number; admins: number; projects: number; catalog: number; auditEntries: number }
export type AdminAccount = { id: string; email: string; role: 'creator' | 'admin'; verificationState: 'unverified' | 'pending' | 'verified' }
export type AdminCatalog = { contentId: string; creatorId: string; type: string; title: string; publicationStatus: string }
export type AdminPayload = { overview: AdminOverview; accounts: AdminAccount[]; catalog: AdminCatalog[] }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const isOverview = (value: unknown): value is AdminOverview => object(value) && ['accounts', 'creators', 'admins', 'projects', 'catalog', 'auditEntries'].every(key => typeof value[key] === 'number')
const isAccounts = (value: unknown): value is AdminAccount[] => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string' && typeof item.email === 'string' && (item.role === 'creator' || item.role === 'admin') && typeof item.verificationState === 'string')
const isCatalog = (value: unknown): value is AdminCatalog[] => Array.isArray(value) && value.every(item => object(item) && typeof item.contentId === 'string' && typeof item.creatorId === 'string' && typeof item.title === 'string' && typeof item.type === 'string' && typeof item.publicationStatus === 'string')
export type AdminRepositoryResult = { source: 'api' | 'fallback'; overview: AdminOverview; accounts: AdminAccount[]; catalog: AdminCatalog[]; rows: readonly AdminRow[]; error?: string }
export class AdminRepository {
  constructor(private readonly api = new ApiClient()) {}
  async load(): Promise<AdminRepositoryResult> {
    const [overview, accounts, catalog] = await Promise.all([
      this.api.request('/api/admin/overview', { method: 'GET' }, isOverview),
      this.api.request('/api/admin/accounts', { method: 'GET' }, isAccounts),
      this.api.request('/api/admin/catalog-review', { method: 'GET' }, isCatalog),
    ])
    if (overview.ok && accounts.ok && catalog.ok) return { source: 'api', overview: overview.data, accounts: accounts.data, catalog: catalog.data, rows: [] }
    const error = [overview, accounts, catalog].find(result => !result.ok)?.error.message || 'API no disponible.'
    return { source: 'fallback', overview: { accounts: Number(adminMetrics[0][1]), creators: 0, admins: 1, projects: 0, catalog: 0, auditEntries: 0 }, accounts: [], catalog: [], rows: [...accountReviews, ...moderationQueue, ...promotionSummary], error }
  }
  async review(contentId: string, decision: 'approve' | 'reject', reason = ''): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.request(`/api/admin/catalog-review/${encodeURIComponent(contentId)}`, {
      method: 'POST', body: JSON.stringify({ decision, reason }),
    }, (value): value is { contentId: string; publicationStatus: string } => object(value) && value.contentId === contentId && typeof value.publicationStatus === 'string')
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
}
export const defaultAdminRepository = new AdminRepository()
export { providerHealth }
