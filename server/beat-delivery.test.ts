import { describe, expect, it } from 'vitest'
import type { AssetRecord } from './store'
import { buildBeatPurchaseSnapshot, isBeatPurchaseSnapshot, sameBeatPurchaseSnapshot } from './beat-delivery'
import type { BeatOfferDraft } from '../src/domains/marketplace/sellerListings'

const makeAsset = (overrides: Partial<AssetRecord> = {}): AssetRecord => ({
  id: 'asset-1', ownerId: 'seller-1', originalName: 'Night drive.wav', storageKey: 'seller-1/asset-1',
  mimeType: 'audio/mpeg', sizeBytes: 1024, contentHash: 'a'.repeat(64), state: 'available',
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), ...overrides,
})
const makeOffer = (deliverables: BeatOfferDraft['deliverables']): BeatOfferDraft => ({
  id: 'standard', label: 'Standard license', amountMinor: 3000, currency: 'USD', deliverables,
  usageSummary: 'Commercial release with producer credit.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only',
})

describe('Beat purchase delivery snapshots', () => {
  it.each([
    ['mp3', 'audio/mpeg', 'Night drive.mp3'],
    ['wav', 'audio/wav', 'Night drive.wav'],
  ] as const)('snapshots a single matching %s file and its license terms', (deliverable, mimeType, fileName) => {
    const snapshot = buildBeatPurchaseSnapshot(makeOffer([deliverable]), makeAsset({ mimeType }))
    expect(snapshot).toMatchObject({
      offerLabel: 'Standard license', usageSummary: 'Commercial release with producer credit.',
      termsVersion: 'non-exclusive-offer-draft-v1', deliverables: [deliverable], fileName, mimeType,
      assetId: 'asset-1', assetContentHash: 'a'.repeat(64), sizeBytes: 1024,
    })
    expect(isBeatPurchaseSnapshot(snapshot)).toBe(true)
  })

  it.each([
    ['stems', ['stems'], 'audio/mpeg'],
    ['multiple formats', ['mp3', 'wav'], 'audio/mpeg'],
    ['format mismatch', ['wav'], 'audio/mpeg'],
    ['missing file', ['mp3'], 'audio/mpeg'],
  ] as const)('rejects %s that the one-file delivery path cannot fulfill', (_name, deliverables, mimeType) => {
    const state = _name === 'missing file' ? 'missing' : 'available'
    expect(buildBeatPurchaseSnapshot(makeOffer([...deliverables]), makeAsset({ mimeType, state }))).toBeUndefined()
  })

  it('validates safe immutable manifests and compares license changes', () => {
    const snapshot = buildBeatPurchaseSnapshot(makeOffer(['mp3']), makeAsset())!
    expect(isBeatPurchaseSnapshot({ ...snapshot, fileName: '../Night drive.mp3' })).toBe(false)
    expect(isBeatPurchaseSnapshot({ ...snapshot, mimeType: 'audio/wav' })).toBe(false)
    expect(sameBeatPurchaseSnapshot(snapshot, { ...snapshot })).toBe(true)
    expect(sameBeatPurchaseSnapshot(snapshot, { ...snapshot, usageSummary: 'Different license terms.' })).toBe(false)
  })
})
