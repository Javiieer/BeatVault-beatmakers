import type { EntityId, ISODateString } from '../core/types'

export type ProductKind = 'beat' | 'sound-pack' | 'sound' | 'preset' | 'midi' | 'stem' | 'template' | 'educational'
export type ProductStatus = 'draft' | 'review' | 'published' | 'archived' | 'removed'
export type ProductVisibility = 'private' | 'preview' | 'public'
export type LicenseKind = 'personal' | 'commercial' | 'premium' | 'exclusive' | 'custom'
export type ProductAvailability = 'free' | 'included' | 'preview-only' | 'purchased' | 'licensed' | 'expired' | 'unavailable'
export type ArchiveFormat = 'zip' | 'rar' | 'tar' | 'other'

export interface ProductMetadata {
  title: string
  creatorId: EntityId
  description?: string
  tags: string[]
  genre?: string
  tempo?: number
  key?: string
}

export interface ProductContent {
  id: EntityId
  kind: ProductKind
  title: string
  description?: string
  metadataOnly?: boolean
}

export interface BundleContent {
  contentId: EntityId
  quantity?: number
  summary?: string
}

export interface ProductVersion {
  version: string
  releasedAt?: ISODateString
  contents: ProductContent[]
  bundleContents?: BundleContent[]
  archiveFormat?: ArchiveFormat
  archiveLabel?: string
}

export interface PreviewPolicy {
  enabled: boolean
  public: boolean
  kind: 'audio' | 'video' | 'image' | 'sample' | 'description'
  durationSeconds?: number
}

export interface DownloadPolicy {
  available: boolean
  requiresEntitlement: boolean
  maxDownloads?: number
  redownloadsAllowed: boolean
}

export interface LicenseTerms {
  usage: string
  attribution: 'required' | 'optional' | 'not-required'
  modification: 'allowed' | 'restricted' | 'not-allowed'
  distribution: 'allowed' | 'restricted' | 'not-allowed'
  duration?: string
  territory?: string
  explicit: boolean
}

export interface ProductLicense {
  kind: LicenseKind
  version: string
  terms: LicenseTerms
}

export interface ProductOffer {
  id: EntityId
  productId: EntityId
  label: string
  availability: ProductAvailability
  currency?: string
  amountMinor?: number
  license: ProductLicense
}

export interface Product {
  id: EntityId
  kind: ProductKind
  status: ProductStatus
  visibility: ProductVisibility
  metadata: ProductMetadata
  versions: ProductVersion[]
  currentVersion: string
  previewPolicy?: PreviewPolicy
  downloadPolicy: DownloadPolicy
  offers: ProductOffer[]
}

export interface PurchaseReference {
  purchaseId: EntityId
  productId: EntityId
  offerId: EntityId
  recordedAt: ISODateString
}

export interface LicenseRecordReference {
  licenseId: EntityId
  productId: EntityId
  offerId: EntityId
  licenseVersion: string
  acceptedAt?: ISODateString
  expiresAt?: ISODateString
}
