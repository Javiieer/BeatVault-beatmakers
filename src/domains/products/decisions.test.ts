import { describe, expect, it } from 'vitest'
import { decideAvailability, decidePublication, type Product } from './index'

const product: Product = {
  id: 'pack-1', kind: 'sound-pack', status: 'published', visibility: 'public',
  metadata: { title: 'Demo Pack', creatorId: 'creator-1', description: 'Sounds', tags: ['demo'] },
  versions: [{ version: '1.0.0', contents: [], bundleContents: [], archiveFormat: 'zip' }], currentVersion: '1.0.0',
  previewPolicy: { enabled: true, public: true, kind: 'audio' },
  downloadPolicy: { available: false, requiresEntitlement: true, redownloadsAllowed: true }, offers: [],
}

describe('product catalog decisions', () => {
  it('publishes a sound pack with descriptive archive metadata only', () => expect(decidePublication(product)).toEqual({ allowed: true, reason: 'publishable' }))
  it('rejects missing preview policy and pack metadata', () => {
    expect(decidePublication({ ...product, previewPolicy: undefined })).toMatchObject({ allowed: false, reason: 'missing-preview-policy' })
    expect(decidePublication({ ...product, versions: [{ version: '1.0.0', contents: [] }] })).toMatchObject({ reason: 'sound-pack-missing-archive-metadata' })
  })
  it('requires explicit commercial terms', () => {
    const commercial = { ...product, offers: [{ id: 'offer', productId: 'pack-1', label: 'Commercial', availability: 'licensed' as const, license: { kind: 'commercial' as const, version: 'draft-1', terms: { usage: 'Commercial use', attribution: 'optional' as const, modification: 'allowed' as const, distribution: 'restricted' as const, explicit: false } } }] }
    expect(decidePublication(commercial)).toMatchObject({ allowed: false, reason: 'explicit-terms-required' })
  })
  it('keeps preview separate from purchase/download', () => {
    expect(decideAvailability(product)).toEqual({ allowed: true, preview: true, download: false, reason: 'preview-only' })
  })
})
