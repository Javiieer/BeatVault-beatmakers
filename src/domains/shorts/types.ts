import type { DomainEntity, EntityId } from '../core/types'
import type { CreatorReference } from '../creators/types'
import type { PreviewReference } from '../preview/types'

export interface Short extends DomainEntity {
  creator: CreatorReference
  videoPreview: PreviewReference
  caption?: string
  tagIds: EntityId[]
  linkedContentIds: EntityId[]
}
