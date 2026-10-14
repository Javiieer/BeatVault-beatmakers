import { describe, expect, it } from 'vitest'
import { convertMinorUnits, exchangeRate, formatMinorUnits, type ExchangeRates } from './currency'

const rates: ExchangeRates = { base: 'EUR', date: '2026-10-12', rates: { EUR: 1, USD: 1.1, MXN: 20 }, source: 'ECB' }

describe('marketplace currency math', () => {
  it('converts integer minor units using reference rates and rounds to target minor units', () => {
    expect(exchangeRate('USD', 'MXN', rates)).toBeCloseTo(20 / 1.1)
    expect(convertMinorUnits(1000, 'USD', 'MXN', rates)).toBe(18182)
    expect(convertMinorUnits(1000, 'USD', 'USD', rates)).toBe(1000)
  })

  it('formats money using the selected display currency', () => {
    expect(formatMinorUnits(1299, 'MXN', 'es-MX')).toContain('$')
    expect(formatMinorUnits(1299, 'EUR', 'de-DE')).toContain('€')
  })

  it('rejects invalid minor amounts', () => {
    expect(() => convertMinorUnits(-1, 'USD', 'MXN', rates)).toThrow(RangeError)
    expect(() => convertMinorUnits(1.5, 'USD', 'MXN', rates)).toThrow(RangeError)
  })
})
