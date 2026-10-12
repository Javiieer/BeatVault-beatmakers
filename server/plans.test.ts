import { describe, expect, it } from 'vitest'
import { getEffectiveStorageLimit, getPlanCatalog, isPlanId } from './plans'
import { DEFAULT_PLAN_STORAGE_BYTES } from '../src/domains/plans'
import { loadConfig } from './config'

describe('plan storage policy', () => {
  it('uses calculated local package limits with environment overrides', () => {
    expect(getPlanCatalog(loadConfig({})).map(plan => plan.storageLimitBytes)).toEqual([5, 50, 250].map(value => value * 1024 ** 3))
    expect(DEFAULT_PLAN_STORAGE_BYTES.creator).toBe(50 * 1024 ** 3)
    expect(getPlanCatalog(loadConfig({ BEATVAULT_PLAN_FREE_STORAGE_BYTES: '1024' }))[0].storageLimitBytes).toBe(1024)
  })

  it('uses account test override, then configured plan quota, then technical server fallback', () => {
    expect(getEffectiveStorageLimit({ accountLimit: 300, planLimit: 200, serverLimit: 100 })).toEqual({ limitBytes: 300, source: 'account' })
    expect(getEffectiveStorageLimit({ planLimit: 200, serverLimit: 100 })).toEqual({ limitBytes: 200, source: 'plan' })
    expect(getEffectiveStorageLimit({ planLimit: null, serverLimit: 100 })).toEqual({ limitBytes: 100, source: 'server' })
    expect(getEffectiveStorageLimit({ planLimit: null })).toEqual({ limitBytes: null, source: 'none' })
  })

  it('accepts only the supported package identifiers', () => {
    expect(isPlanId('studio')).toBe(true)
    expect(isPlanId('enterprise')).toBe(false)
  })
})
