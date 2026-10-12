import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_STORAGE_BYTES, estimateStorageCapacity, REFERENCE_MEDIA_BYTES } from './plans'

describe('package storage estimates', () => {
  it('uses approximate non-compressed WAV and one-shot reference sizes', () => {
    expect(REFERENCE_MEDIA_BYTES.threeMinuteWav).toBe(47_628_000)
    expect(estimateStorageCapacity(DEFAULT_PLAN_STORAGE_BYTES.free)).toEqual({ threeMinuteWavs: 112, oneShots: 1280 })
  })

  it('returns whole-file estimates and handles an undefined quota', () => {
    expect(estimateStorageCapacity(REFERENCE_MEDIA_BYTES.threeMinuteWav - 1)?.threeMinuteWavs).toBe(0)
    expect(estimateStorageCapacity(null)).toBeUndefined()
  })
})
