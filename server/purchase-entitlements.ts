export type PurchaseFormat = 'mp3' | 'wav'
export type PurchaseEntitlement = {
  version: 1
  assetId: string
  sourceHash: string
  sourceSizeBytes: number
  sourceMimeType: string
  sourceName: string
  deliverables: PurchaseFormat[]
  offerLabel: string
  usageSummary: string
  termsVersion: string
}

export function isPurchaseEntitlement(value: unknown): value is PurchaseEntitlement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<PurchaseEntitlement>
  return item.version === 1 && typeof item.assetId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.assetId) &&
    typeof item.sourceHash === 'string' && /^[a-f0-9]{64}$/i.test(item.sourceHash) &&
    Number.isSafeInteger(item.sourceSizeBytes) && (item.sourceSizeBytes ?? 0) > 0 &&
    typeof item.sourceMimeType === 'string' && ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/mp4', 'audio/ogg', 'audio/webm'].includes(item.sourceMimeType) &&
    typeof item.sourceName === 'string' && item.sourceName.length > 0 && item.sourceName.length <= 255 &&
    Array.isArray(item.deliverables) && item.deliverables.length > 0 && item.deliverables.length <= 2 &&
    item.deliverables.every(format => format === 'mp3' || format === 'wav') && new Set(item.deliverables).size === item.deliverables.length &&
    typeof item.offerLabel === 'string' && item.offerLabel.length > 0 && item.offerLabel.length <= 60 &&
    typeof item.usageSummary === 'string' && item.usageSummary.length >= 10 && item.usageSummary.length <= 600 &&
    typeof item.termsVersion === 'string' && item.termsVersion.length > 0 && item.termsVersion.length <= 100
}

export function purchaseFormats(deliverables: readonly string[]): PurchaseFormat[] | undefined {
  return deliverables.length > 0 && deliverables.length <= 2 && new Set(deliverables).size === deliverables.length &&
    deliverables.every(format => format === 'mp3' || format === 'wav') ? deliverables as PurchaseFormat[] : undefined
}
