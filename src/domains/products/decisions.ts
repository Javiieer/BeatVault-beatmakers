import type { Product } from './types'

export type ProductDecisionReason =
  | 'publishable'
  | 'missing-metadata'
  | 'missing-version'
  | 'missing-preview-policy'
  | 'invalid-preview-policy'
  | 'missing-license-terms'
  | 'explicit-terms-required'
  | 'sound-pack-missing-archive-metadata'
  | 'unavailable'
  | 'preview-only'
  | 'available'

export interface ProductDecision {
  allowed: boolean
  reason: ProductDecisionReason
}

export interface AvailabilityDecision extends ProductDecision {
  preview: boolean
  download: boolean
}

export function decidePublication(product: Product): ProductDecision {
  const { metadata, versions, currentVersion, previewPolicy, offers } = product
  if (!metadata.title.trim() || !metadata.creatorId.trim() || metadata.tags.length === 0) return { allowed: false, reason: 'missing-metadata' }
  const version = versions.find((item) => item.version === currentVersion)
  if (!version) return { allowed: false, reason: 'missing-version' }
  if (!previewPolicy) return { allowed: false, reason: 'missing-preview-policy' }
  if (!previewPolicy.enabled || (previewPolicy.public && previewPolicy.kind === 'description' && !metadata.description?.trim())) return { allowed: false, reason: 'invalid-preview-policy' }
  if (product.kind === 'sound-pack' && (!version.archiveFormat || !version.bundleContents)) return { allowed: false, reason: 'sound-pack-missing-archive-metadata' }
  for (const offer of offers) {
    if (!offer.license.terms.usage.trim()) return { allowed: false, reason: 'missing-license-terms' }
    if ((offer.license.kind === 'commercial' || offer.license.kind === 'exclusive') && !offer.license.terms.explicit) return { allowed: false, reason: 'explicit-terms-required' }
  }
  return { allowed: true, reason: 'publishable' }
}

export function decideAvailability(product: Product): AvailabilityDecision {
  const preview = product.previewPolicy?.enabled === true && product.visibility !== 'private'
  const download = product.downloadPolicy.available && product.downloadPolicy.requiresEntitlement === false && product.status === 'published'
  if (product.status !== 'published' || product.visibility === 'private') return { allowed: false, preview, download: false, reason: 'unavailable' }
  if (preview && !download) return { allowed: true, preview: true, download: false, reason: 'preview-only' }
  return { allowed: download || preview, preview, download, reason: download ? 'available' : 'preview-only' }
}
