import { ApiClient } from '../api/client'

export type CatalogUploadReviewItem = {
  contentId: string
  title: string
  type: 'beat'
  creatorId: string
  previewAvailable: boolean
  previewUrl?: string
  artworkUrl?: string
}

const isItem = (value: unknown): value is CatalogUploadReviewItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.contentId === 'string' && typeof item.title === 'string' && item.type === 'beat' && typeof item.creatorId === 'string' && typeof item.previewAvailable === 'boolean' && (item.previewUrl === undefined || typeof item.previewUrl === 'string') && (item.artworkUrl === undefined || typeof item.artworkUrl === 'string')
}

export class CatalogUploadReviewRepository {
  constructor(private readonly api = new ApiClient()) {}
  list() {
    return this.api.request('/api/staff/catalog-review', { method: 'GET' }, (value): value is CatalogUploadReviewItem[] => Array.isArray(value) && value.every(isItem))
  }
  decide(contentId: string, decision: 'approve' | 'reject', note: string) {
    return this.api.request(`/api/staff/catalog-review/${encodeURIComponent(contentId)}`, { method: 'POST', body: JSON.stringify({ decision, note }) }, (value): value is { contentId: string; publicationStatus: 'published' | 'rejected' } => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).contentId === contentId && ['published', 'rejected'].includes((value as Record<string, unknown>).publicationStatus as string)))
  }
}

export const defaultCatalogUploadReviewRepository = new CatalogUploadReviewRepository()
