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
}

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
