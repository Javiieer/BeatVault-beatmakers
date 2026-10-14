import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearExchangeRateCache, getEcbReferenceRates, parseEcbReferenceRates } from './exchange-rates'

const xml = `<?xml version="1.0"?><Envelope><Cube><Cube time='2026-10-12'><Cube currency='USD' rate='1.1181'/><Cube currency='MXN' rate='20.5081'/></Cube></Cube></Envelope>`

afterEach(() => { clearExchangeRateCache(); vi.restoreAllMocks() })

describe('ECB reference rates', () => {
  it('parses the date and supported reference currencies', () => {
    expect(parseEcbReferenceRates(xml)).toEqual({ base: 'EUR', date: '2026-10-12', rates: { EUR: 1, USD: 1.1181, MXN: 20.5081 }, source: 'ECB' })
  })

  it('rejects missing or malformed provider data', () => {
    expect(() => parseEcbReferenceRates('<Cube time="2026-10-12"/>')).toThrow('FX_RESPONSE_INVALID')
    expect(() => parseEcbReferenceRates('x'.repeat(128 * 1024 + 1))).toThrow('FX_RESPONSE_TOO_LARGE')
  })

  it('caches a validated snapshot instead of requesting on every view', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => xml })
    const first = await getEcbReferenceRates(fetcher, 1000)
    const second = await getEcbReferenceRates(fetcher, 2000)
    expect(first).toEqual(second)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('deduplicates parallel requests and cools down after provider failures', async () => {
    const delayedFetcher = vi.fn(async () => { await Promise.resolve(); return { ok: true, text: async () => xml } })
    const delayedResponse = delayedFetcher as unknown as typeof fetch
    await Promise.all([getEcbReferenceRates(delayedResponse, 1000), getEcbReferenceRates(delayedResponse, 1000)])
    expect(delayedFetcher).toHaveBeenCalledOnce()
    clearExchangeRateCache()
    const failedFetcher = vi.fn().mockResolvedValue({ ok: false, text: async () => '' })
    const failedResponse = failedFetcher as unknown as typeof fetch
    await expect(getEcbReferenceRates(failedResponse, 1000)).rejects.toThrow('FX_PROVIDER_UNAVAILABLE')
    await expect(getEcbReferenceRates(failedResponse, 2000)).rejects.toThrow('FX_PROVIDER_COOLDOWN')
    expect(failedFetcher).toHaveBeenCalledOnce()
  })
})
