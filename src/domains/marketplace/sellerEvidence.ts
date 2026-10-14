export type SellerEvidenceRecord = {
  id: string
  contentId: string
  ownerId: string
  originalName: string
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
  sizeBytes: number
  storageKey: string
  contentHash: string
  createdAt: string
}

export type SellerEvidenceView = Pick<SellerEvidenceRecord, 'id' | 'contentId' | 'originalName' | 'mimeType' | 'sizeBytes' | 'createdAt'>
export const sellerEvidenceMaxBytes = 10 * 1024 * 1024
export const sellerEvidenceMaxFiles = 3

export const isSellerEvidenceRecord = (value: unknown): value is SellerEvidenceRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SellerEvidenceRecord>
  return typeof item.id === 'string' && typeof item.contentId === 'string' && typeof item.ownerId === 'string' &&
    typeof item.originalName === 'string' && ['application/pdf', 'image/jpeg', 'image/png'].includes(item.mimeType || '') &&
    Number.isSafeInteger(item.sizeBytes) && (item.sizeBytes ?? 0) > 0 && item.sizeBytes! <= sellerEvidenceMaxBytes &&
    typeof item.storageKey === 'string' && typeof item.contentHash === 'string' && /^[a-f0-9]{64}$/.test(item.contentHash) &&
    typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
}

export const sellerEvidenceView = ({ id, contentId, originalName, mimeType, sizeBytes, createdAt }: SellerEvidenceRecord): SellerEvidenceView => ({ id, contentId, originalName, mimeType, sizeBytes, createdAt })
