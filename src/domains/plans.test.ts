import { describe, expect, it } from 'vitest'
import { CREATOR_PLAN_PRICING, DEFAULT_PLAN_STORAGE_BYTES, estimateSellerNetCents, estimateStorageCapacity, getAnnualSavingsCents, getPlanPriceCents, REFERENCE_MEDIA_BYTES } from './plans'

describe('package storage estimates', () => {
  it('uses approximate non-compressed WAV and one-shot reference sizes', () => {
    expect(REFERENCE_MEDIA_BYTES.threeMinuteWav).toBe(47_628_000)
    expect(estimateStorageCapacity(DEFAULT_PLAN_STORAGE_BYTES.free)).toEqual({ threeMinuteWavs: 112, oneShots: 1280 })
  })

  it('returns whole-file estimates and handles an undefined quota', () => {
    expect(estimateStorageCapacity(REFERENCE_MEDIA_BYTES.threeMinuteWav - 1)?.threeMinuteWavs).toBe(0)
    expect(estimateStorageCapacity(null)).toBeUndefined()
  })

  it('keeps the proposed monthly and annual prices in USD cents', () => {
    expect(getPlanPriceCents('creator', 'monthly')).toBe(599)
    expect(getPlanPriceCents('creator', 'annual')).toBe(5900)
    expect(getPlanPriceCents('studio', 'monthly')).toBe(1299)
    expect(getPlanPriceCents('studio', 'annual')).toBe(12900)
    expect(getAnnualSavingsCents('creator')).toBe(1288)
    expect(getAnnualSavingsCents('studio')).toBe(2688)
  })

  it('estimates seller proceeds after only the proposed marketplace fee', () => {
    expect(CREATOR_PLAN_PRICING.free.marketplaceFeePercent).toBe(12)
    expect(estimateSellerNetCents('free', 10_000)).toBe(8_800)
    expect(estimateSellerNetCents('creator', 10_000)).toBe(9_200)
    expect(estimateSellerNetCents('studio', 10_000)).toBe(9_500)
    expect(estimateSellerNetCents('studio', -100)).toBe(0)
  })
})
