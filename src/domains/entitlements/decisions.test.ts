import { describe, expect, it } from 'vitest'
import { decideDownloadAccess, decidePreviewAccess, type EntitlementContext } from './index'

const base: EntitlementContext = {
  product: { productId: 'pack-a', publicPreview: true, downloadRequiresEntitlement: true },
  usage: { downloads: { key: 'downloads', used: 0, limit: 1 }, previews: { key: 'previews', used: 0, limit: 10 }, storage: { key: 'storage', used: 0, limit: 10 } },
  now: '2026-01-01T00:00:00.000Z',
}
const licensed = { ...base, ownership: { productId: 'pack-a', kind: 'owned' as const, active: true }, entitlement: { productId: 'pack-a', source: 'purchase' as const, active: true }, license: { productId: 'pack-a', kind: 'commercial' as const, active: true } }

describe('entitlement decisions', () => {
  it('allows declared public preview without granting download', () => {
    expect(decidePreviewAccess(base)).toMatchObject({ allowed: true, reason: 'public-preview' })
    expect(decideDownloadAccess(base)).toMatchObject({ allowed: false, reason: 'missing-entitlement' })
  })
  it('requires an explicit product entitlement even with an active subscription', () => {
    expect(decideDownloadAccess({ ...base, subscription: { planId: 'creator', status: 'active' } })).toMatchObject({ allowed: false, reason: 'missing-entitlement' })
  })
  it('allows an active owned licensed product while quota remains', () => {
    expect(decideDownloadAccess(licensed)).toMatchObject({ allowed: true, reason: 'entitled-download' })
  })
  it('denies exhausted quota and expired licenses', () => {
    expect(decideDownloadAccess({ ...licensed, usage: { ...licensed.usage, downloads: { ...licensed.usage.downloads, used: 1 } } })).toMatchObject({ allowed: false, reason: 'quota-exhausted' })
    expect(decideDownloadAccess({ ...licensed, license: { ...licensed.license, expiresAt: '2025-12-31T00:00:00.000Z' } })).toMatchObject({ allowed: false, reason: 'expired-license' })
  })
  it('does not assume access during cancellation or grace', () => {
    const context = { ...base, subscription: { planId: 'creator' as const, status: 'grace' as const } }
    expect(decidePreviewAccess(context)).toMatchObject({ allowed: true, reason: 'public-preview' })
    expect(decideDownloadAccess(context)).toMatchObject({ allowed: false, reason: 'missing-entitlement' })
  })
})
