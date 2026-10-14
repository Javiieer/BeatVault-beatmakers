export const currencies = ['USD', 'MXN', 'EUR'] as const
export const marketplaceBaseCurrency = 'USD' as const
export type CurrencyCode = typeof currencies[number]
export type ExchangeRates = { base: 'EUR'; date: string; rates: Record<CurrencyCode, number>; source: 'ECB' }

export const isCurrencyCode = (value: unknown): value is CurrencyCode => currencies.includes(value as CurrencyCode)
export const isExchangeRates = (value: unknown): value is ExchangeRates => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ExchangeRates>
  return item.base === 'EUR' && item.source === 'ECB' && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    Boolean(item.rates && currencies.every(code => Number.isFinite(item.rates?.[code]) && (item.rates?.[code] ?? 0) > 0))
}

export const exchangeRate = (from: CurrencyCode, to: CurrencyCode, rates: ExchangeRates): number => rates.rates[to] / rates.rates[from]

export const convertMinorUnits = (amount: number, from: CurrencyCode, to: CurrencyCode, rates: ExchangeRates): number => {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Amount must be a non-negative safe integer in minor units.')
  const converted = amount * exchangeRate(from, to, rates)
  if (!Number.isFinite(converted) || converted > Number.MAX_SAFE_INTEGER) throw new RangeError('Converted amount exceeds the supported range.')
  return Math.round(converted)
}

export const formatMinorUnits = (amount: number, currency: CurrencyCode, locale = 'en'): string => {
  if (!Number.isSafeInteger(amount)) throw new RangeError('Amount must be a safe integer in minor units.')
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100)
}
