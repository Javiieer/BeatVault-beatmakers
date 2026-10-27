import { describe, expect, it } from 'vitest'
import { isBeatOrderView } from './beatPurchases'

const order = { id: 'order-1', title: 'Beat', offerId: 'standard', amountMinor: 12000, currency: 'usd', status: 'paid', createdAt: '2026-10-27T00:00:00.000Z' }

describe('beat purchase API records', () => {
  it('accepts legacy USD and Mercado Pago MXN orders', () => {
    expect(isBeatOrderView(order)).toBe(true)
    expect(isBeatOrderView({ ...order, currency: 'mxn' })).toBe(true)
  })

  it('rejects currencies and data outside the order contract', () => {
    expect(isBeatOrderView({ ...order, currency: 'eur' })).toBe(false)
    expect(isBeatOrderView({ ...order, status: 'authorized' })).toBe(false)
    expect(isBeatOrderView({ ...order, downloads: [{ format: 'stems', url: '/api/download' }] })).toBe(false)
  })
})
