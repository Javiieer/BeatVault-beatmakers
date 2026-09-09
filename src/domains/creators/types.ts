import type { DomainEntity, EntityId } from '../core/types'

export interface Creator extends DomainEntity {
  handle: string
  displayName: string
  avatarUrl?: string
  bio?: string
}

export interface CreatorReference {
  creatorId: EntityId
  handle: string
  displayName: string
}
