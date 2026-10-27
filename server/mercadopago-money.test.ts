import { describe, expect, it } from 'vitest'
import { createMercadoPagoQuote, toMercadoPagoUnitPrice } from './mercadopago-money'

describe('Mercado Pago MXN quote', () => {
  it('freezes USD source price, configured FX, MXN fee and seller net', () => {
    expect(createMercadoPagoQuote(2500, 18.25, 500)).toEqual({
      sourceAmountMinor: 2500,
      sourceCurrency: 'usd',
      exchangeRateUsdMxn: 18.25,
      amountMinor: 45625,
      currency: 'mxn',
      marketplaceFeeMinor: 2281,
      sellerNetMinor: 43344,
    })
    expect(toMercadoPagoUnitPrice(45625)).toBe(456.25)
  })

  it('rejects unsafe price, rate and fee inputs', () => {
    expect(() => createMercadoPagoQuote(99, 18, 500)).toThrow('BEAT_PRICE_NOT_SUPPORTED')
    expect(() => createMercadoPagoQuote(1000, 0, 500)).toThrow('MP_EXCHANGE_RATE_NOT_CONFIGURED')
    expect(() => createMercadoPagoQuote(1000, 18, 10000)).toThrow('MP_FEE_NOT_CONFIGURED')
    expect(() => createMercadoPagoQuote(1000, 18, 10000)).toThrow()
  })
})
