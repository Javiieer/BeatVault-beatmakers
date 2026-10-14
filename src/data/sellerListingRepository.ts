import { ApiClient } from '../api/client'
import { isBeatListingRecord, type BeatListingInput, type BeatListingRecord } from '../domains/marketplace/sellerListings'
import type { SellerEvidenceView } from '../domains/marketplace/sellerEvidence'

const isBeatListingRecordList = (value: unknown): value is BeatListingRecord[] => Array.isArray(value) && value.every(isBeatListingRecord)
const isEvidence = (value: unknown): value is SellerEvidenceView[] => Array.isArray(value) && value.every(item => Boolean(item && typeof item === 'object' && typeof (item as SellerEvidenceView).id === 'string' && typeof (item as SellerEvidenceView).contentId === 'string' && typeof (item as SellerEvidenceView).originalName === 'string' && ['application/pdf', 'image/jpeg', 'image/png'].includes((item as SellerEvidenceView).mimeType) && typeof (item as SellerEvidenceView).sizeBytes === 'number' && typeof (item as SellerEvidenceView).createdAt === 'string'))
const isEvidenceView = (value: unknown): value is SellerEvidenceView => isEvidence([value])
const evidenceUploadClient = new ApiClient(undefined, 60_000)

export class SellerListingRepository {
  constructor(private readonly api = new ApiClient()) {}

  list() {
    return this.api.request('/api/seller/beat-listings', { method: 'GET' }, isBeatListingRecordList)
  }

  save(contentId: string, input: BeatListingInput) {
    return this.api.request(`/api/seller/beat-listings/${encodeURIComponent(contentId)}`, {
      method: 'PUT', body: JSON.stringify(input),
    }, isBeatListingRecord)
  }

  listEvidence(contentId: string) {
    return this.api.request(`/api/seller/beat-listings/${encodeURIComponent(contentId)}/evidence`, { method: 'GET' }, isEvidence)
  }

  uploadEvidence(contentId: string, file: File) {
    const form = new FormData()
    form.append('file', file, file.name)
    return evidenceUploadClient.request(`/api/seller/beat-listings/${encodeURIComponent(contentId)}/evidence`, { method: 'POST', body: form }, isEvidenceView)
  }

  removeEvidence(contentId: string, evidenceId: string) {
    return this.api.request(`/api/seller/beat-listings/${encodeURIComponent(contentId)}/evidence/${encodeURIComponent(evidenceId)}`, { method: 'DELETE' }, (value): value is null => value === null)
  }
}

export const defaultSellerListingRepository = new SellerListingRepository()
