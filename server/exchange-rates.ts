import type { ExchangeRates } from '../src/domains/marketplace/currency'

const referenceUrl = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
let cached: { value: ExchangeRates; expiresAt: number } | undefined
let pending: Promise<ExchangeRates> | undefined
let retryAfter = 0

export function parseEcbReferenceRates(xml: string): ExchangeRates {
  if (xml.length > 128 * 1024) throw new Error('FX_RESPONSE_TOO_LARGE')
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/)?.[1]
  const readRate = (code: 'USD' | 'MXN') => {
    const match = xml.match(new RegExp(`<Cube\\s+currency=['"]${code}['"]\\s+rate=['"]([0-9]+(?:\\.[0-9]+)?)['"]\\s*\\/>`))
    return Number(match?.[1])
  }
  const usd = readRate('USD')
  const mxn = readRate('MXN')
  if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || !Number.isFinite(usd) || usd <= 0 || !Number.isFinite(mxn) || mxn <= 0) throw new Error('FX_RESPONSE_INVALID')
  return { base: 'EUR', date, rates: { EUR: 1, USD: usd, MXN: mxn }, source: 'ECB' }
}

export async function getEcbReferenceRates(fetcher: typeof fetch = fetch, now = Date.now()): Promise<ExchangeRates> {
  if (cached && cached.expiresAt > now) return cached.value
  if (pending) return pending
  if (retryAfter > now) throw new Error('FX_PROVIDER_COOLDOWN')
  pending = (async () => {
    try {
      const response = await fetcher(referenceUrl, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/xml, text/xml' } })
      if (!response.ok) throw new Error('FX_PROVIDER_UNAVAILABLE')
      const value = parseEcbReferenceRates(await response.text())
      cached = { value, expiresAt: now + 6 * 60 * 60 * 1000 }
      retryAfter = 0
      return value
    } catch (error) {
      retryAfter = now + 60 * 1000
      throw error
    } finally { pending = undefined }
  })()
  return pending
}

export const clearExchangeRateCache = () => { cached = undefined; pending = undefined; retryAfter = 0 }
