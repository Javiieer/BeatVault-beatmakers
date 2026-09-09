import type { EntityId } from '../core/types'

export type TagKind = 'genre' | 'mood' | 'style' | 'character' | 'usage' | 'custom'

export interface ContentTag {
  id: EntityId
  label: string
  kind: TagKind
  required: boolean
}

export interface TagSet {
  tags: ContentTag[]
  isComplete: boolean
}
