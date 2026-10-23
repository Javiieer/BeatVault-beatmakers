import type { EntityId } from '../core/types'
import type { ContentItem, ContentType } from '../content/types'

export interface CatalogEntry {
  contentId: EntityId
  type: ContentType
  title: string
  creatorId: EntityId
  tagIds: EntityId[]
  previewIds: EntityId[]
  publicationStatus: ContentItem['publicationStatus']
  assetId?: EntityId
  coverId?: '808' | 'orchestra' | 'lo-fi'
  reviewNote?: string
  creatorName?: string
  previewUrl?: string
  artworkUrl?: string
  audio?: { originalName: string; mimeType: string; sizeBytes: number; state: 'available' | 'missing' | 'metadata-only'; previewReady?: boolean }
  purchaseOffers?: Array<{ id: string; label: string; amountMinor: number; currency: 'USD'; deliverables: string[]; usageSummary: string }>
}

export type CatalogInput = Pick<CatalogEntry, 'title' | 'type' | 'tagIds' | 'publicationStatus' | 'assetId' | 'coverId'>

export interface CatalogFilter {
  query?: string
  type?: ContentType
  tagIds?: EntityId[]
  creatorId?: EntityId
  publicationStatus?: ContentItem['publicationStatus']
}

export interface CatalogPage {
  entries: CatalogEntry[]
  total: number
  nextCursor?: string
}
