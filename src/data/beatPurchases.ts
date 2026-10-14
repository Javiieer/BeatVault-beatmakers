import { ApiClient } from '../api/client'

export type BeatOrderView = { id: string; title: string; offerId: string; amountMinor: number; currency: 'usd'; status: 'pending' | 'paid' | 'failed' | 'refunded' | 'disputed'; createdAt: string; paidAt?: string; downloadUrl?: string }
const isOrder = (value: unknown): value is BeatOrderView => Boolean(value && typeof value === 'object' &&
  typeof (value as BeatOrderView).id === 'string' && typeof (value as BeatOrderView).title === 'string' &&
  typeof (value as BeatOrderView).offerId === 'string' && Number.isSafeInteger((value as BeatOrderView).amountMinor) &&
  (value as BeatOrderView).currency === 'usd' && ['pending', 'paid', 'failed', 'refunded', 'disputed'].includes((value as BeatOrderView).status) &&
  typeof (value as BeatOrderView).createdAt === 'string' && ((value as BeatOrderView).downloadUrl === undefined || typeof (value as BeatOrderView).downloadUrl === 'string'))
const isOrderList = (value: unknown): value is BeatOrderView[] => Array.isArray(value) && value.every(isOrder)
const api = new ApiClient()

export const loadBeatOrders = () => api.request('/api/orders', { method: 'GET' }, isOrderList)
export const createBeatCheckout = (contentId: string, offerId: string, idempotencyKey: string) => api.request(`/api/checkout/beats/${encodeURIComponent(contentId)}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ offerId }) }, (value): value is { orderId: string; url: string } => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.orderId !== 'string' || typeof item.url !== 'string') return false
  try { return new URL(item.url).origin === 'https://checkout.stripe.com' }
  catch { return false }
})
