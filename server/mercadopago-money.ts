export type MercadoPagoQuote = {
  sourceAmountMinor: number
  sourceCurrency: 'usd'
  exchangeRateUsdMxn: number
  amountMinor: number
  currency: 'mxn'
  marketplaceFeeMinor: number
  sellerNetMinor: number
}

/** Convert the USD seller price to an explicit, server-configured MXN quote. */
export function createMercadoPagoQuote(sourceAmountMinor: number, exchangeRateUsdMxn: number, marketplaceFeeBps: number): MercadoPagoQuote {
  if (!Number.isSafeInteger(sourceAmountMinor) || sourceAmountMinor < 100 || sourceAmountMinor > 100_000_000) throw new Error('BEAT_PRICE_NOT_SUPPORTED')
  if (!Number.isFinite(exchangeRateUsdMxn) || exchangeRateUsdMxn < 5 || exchangeRateUsdMxn > 100) throw new Error('MP_EXCHANGE_RATE_NOT_CONFIGURED')
  if (!Number.isSafeInteger(marketplaceFeeBps) || marketplaceFeeBps < 0 || marketplaceFeeBps >= 10_000) throw new Error('MP_FEE_NOT_CONFIGURED')
  const amountMinor = Math.round(sourceAmountMinor * exchangeRateUsdMxn)
  const marketplaceFeeMinor = Math.round(amountMinor * marketplaceFeeBps / 10_000)
  const sellerNetMinor = amountMinor - marketplaceFeeMinor
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !Number.isSafeInteger(marketplaceFeeMinor) || marketplaceFeeMinor >= amountMinor || sellerNetMinor <= 0) throw new Error('BEAT_PRICE_NOT_SUPPORTED')
  return { sourceAmountMinor, sourceCurrency: 'usd', exchangeRateUsdMxn, amountMinor, currency: 'mxn', marketplaceFeeMinor, sellerNetMinor }
}

export const toMercadoPagoUnitPrice = (amountMinor: number) => Number((amountMinor / 100).toFixed(2))
