import { ApiClient, safeMercadoPagoUrl } from '../api/client'

export type BeatOrderView = { id: string; title: string; offerId: string; amountMinor: number; currency: 'usd' | 'mxn'; status: 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded' | 'partially_refunded' | 'disputed'; createdAt: string; paidAt?: string; downloadUrl?: string; offerLabel?: string; usageSummary?: string; termsVersion?: string; deliverables?: Array<'mp3' | 'wav'>; downloads?: Array<{ format: 'mp3' | 'wav'; url: string }> }
export const isBeatOrderView = (value: unknown): value is BeatOrderView => Boolean(value && typeof value === 'object' &&
  typeof (value as BeatOrderView).id === 'string' && typeof (value as BeatOrderView).title === 'string' &&
  typeof (value as BeatOrderView).offerId === 'string' && Number.isSafeInteger((value as BeatOrderView).amountMinor) &&
  ['usd', 'mxn'].includes((value as BeatOrderView).currency) && ['pending', 'paid', 'failed', 'refund_pending', 'refunded', 'partially_refunded', 'disputed'].includes((value as BeatOrderView).status) &&
  typeof (value as BeatOrderView).createdAt === 'string' && ((value as BeatOrderView).downloadUrl === undefined || typeof (value as BeatOrderView).downloadUrl === 'string') &&
  ['offerLabel', 'usageSummary', 'termsVersion'].every(key => (value as Record<string, unknown>)[key] === undefined || typeof (value as Record<string, unknown>)[key] === 'string') &&
  ((value as BeatOrderView).deliverables === undefined || Array.isArray((value as BeatOrderView).deliverables) && (value as BeatOrderView).deliverables!.every(format => format === 'mp3' || format === 'wav')) &&
  ((value as BeatOrderView).downloads === undefined || Array.isArray((value as BeatOrderView).downloads) && (value as BeatOrderView).downloads!.every(download => Boolean(download && (download.format === 'mp3' || download.format === 'wav') && typeof download.url === 'string'))))
const isOrderList = (value: unknown): value is BeatOrderView[] => Array.isArray(value) && value.every(isBeatOrderView)
const api = new ApiClient()
const checkoutApi = new ApiClient(undefined, 60000)

export const loadBeatOrders = () => api.request('/api/orders', { method: 'GET' }, isOrderList)
export const createBeatCheckout = (contentId: string, offerId: string, idempotencyKey: string) => checkoutApi.request(`/api/checkout/beats/${encodeURIComponent(contentId)}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ offerId }) }, (value): value is { orderId: string; url: string } => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.orderId !== 'string' || typeof item.url !== 'string') return false
  return Boolean(safeMercadoPagoUrl(item.url));
})
