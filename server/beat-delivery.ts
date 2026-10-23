import { basename, extname } from 'node:path'
import { draftOfferTermsVersion, type BeatDeliverable, type BeatOfferDraft } from '../src/domains/marketplace/sellerListings'
import type { AssetRecord } from './store'

export type BeatPurchaseSnapshot = {
  offerLabel: string
  usageSummary: string
  termsVersion: typeof draftOfferTermsVersion
  deliverables: BeatDeliverable[]
  assetId: string
  assetContentHash: string
  fileName: string
  mimeType: 'audio/mpeg' | 'audio/wav'
  sizeBytes: number
}

const audioFormatByDeliverable: Record<BeatDeliverable, { mimeType: BeatPurchaseSnapshot['mimeType']; extension: string } | undefined> = {
  mp3: { mimeType: 'audio/mpeg', extension: '.mp3' },
  wav: { mimeType: 'audio/wav', extension: '.wav' },
  stems: undefined,
}

export function buildBeatPurchaseSnapshot(offer: BeatOfferDraft, asset: AssetRecord): BeatPurchaseSnapshot | undefined {
  if (offer.status !== 'draft-only' || offer.termsVersion !== draftOfferTermsVersion || offer.deliverables.length !== 1 || asset.state !== 'available' ||
    !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes <= 0 || !/^[a-f0-9]{64}$/i.test(asset.contentHash)) return undefined

  const deliverable = offer.deliverables[0]
  const format = audioFormatByDeliverable[deliverable]
  if (!format || asset.mimeType !== format.mimeType) return undefined

  const sourceName = basename(asset.originalName, extname(asset.originalName)).trim()
  return {
    offerLabel: offer.label,
    usageSummary: offer.usageSummary,
    termsVersion: offer.termsVersion,
    deliverables: [deliverable],
    assetId: asset.id,
    assetContentHash: asset.contentHash.toLowerCase(),
    fileName: `${sourceName || 'beat'}${format.extension}`,
    mimeType: format.mimeType,
    sizeBytes: asset.sizeBytes,
  }
}

export function isBeatPurchaseSnapshot(value: unknown): value is BeatPurchaseSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<BeatPurchaseSnapshot>
  if (typeof snapshot.offerLabel !== 'string' || snapshot.offerLabel.trim().length < 1 || snapshot.offerLabel.length > 60 ||
    typeof snapshot.usageSummary !== 'string' || snapshot.usageSummary.trim().length < 10 || snapshot.usageSummary.length > 600 ||
    snapshot.termsVersion !== draftOfferTermsVersion || !Array.isArray(snapshot.deliverables) || snapshot.deliverables.length !== 1 ||
    typeof snapshot.assetId !== 'string' || typeof snapshot.assetContentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(snapshot.assetContentHash) ||
    typeof snapshot.fileName !== 'string' || snapshot.fileName.length < 1 || snapshot.fileName.length > 240 || snapshot.fileName.includes('/') || snapshot.fileName.includes('\\') || basename(snapshot.fileName) !== snapshot.fileName ||
    !Number.isSafeInteger(snapshot.sizeBytes) || (snapshot.sizeBytes ?? 0) <= 0) return false

  const deliverable = snapshot.deliverables[0]
  const format = typeof deliverable === 'string' ? audioFormatByDeliverable[deliverable as BeatDeliverable] : undefined
  return Boolean(format && snapshot.mimeType === format.mimeType && snapshot.fileName.toLowerCase().endsWith(format.extension))
}

export function sameBeatPurchaseSnapshot(left: BeatPurchaseSnapshot, right: BeatPurchaseSnapshot): boolean {
  return left.offerLabel === right.offerLabel && left.usageSummary === right.usageSummary && left.termsVersion === right.termsVersion &&
    left.deliverables.length === right.deliverables.length && left.deliverables.every((item, index) => item === right.deliverables[index]) &&
    left.assetId === right.assetId && left.assetContentHash === right.assetContentHash && left.fileName === right.fileName &&
    left.mimeType === right.mimeType && left.sizeBytes === right.sizeBytes
}
