import type { EntityId } from '../core/types'

export type PreviewKind = 'audio' | 'video' | 'waveform' | 'thumbnail'

export interface PreviewReference {
  id: EntityId
  kind: PreviewKind
  url: string
  durationSeconds?: number
  mimeType?: string
}

export interface TechnicalMetadata {
  format?: string
  sizeBytes?: number
  durationSeconds?: number
  sampleRate?: number
  channels?: number
  bpm?: number
  musicalKey?: string
}
