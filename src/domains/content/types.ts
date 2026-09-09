import type { DomainEntity, EntityId } from '../core/types'
import type { CreatorReference } from '../creators/types'
import type { PreviewReference, TechnicalMetadata } from '../preview/types'
import type { TagSet } from '../tags/types'

export type ContentType = 'sample' | 'beat' | 'loop' | 'vocal' | 'midi' | 'preset' | 'pack' | 'stem' | 'template'

export type PublicationStatus = 'draft' | 'pending-review' | 'published' | 'rejected' | 'archived'

export interface ContentItem extends DomainEntity {
  title: string
  type: ContentType
  creator: CreatorReference
  description?: string
  publicationStatus: PublicationStatus
  tags: TagSet
  technicalMetadata?: TechnicalMetadata
  previews: PreviewReference[]
  sourceAssetId?: EntityId
}

export interface PublicationValidation {
  canPublish: boolean
  missingFields: string[]
  missingRequiredTags: string[]
}
