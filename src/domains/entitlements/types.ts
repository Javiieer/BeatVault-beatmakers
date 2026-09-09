import type { EntityId, ISODateString } from '../core/types'

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'grace' | 'cancelled' | 'expired' | 'suspended'
export type SubscriptionPlanId = 'free' | 'creator' | 'studio' | (string & {})

export interface SubscriptionState {
  planId: SubscriptionPlanId
  status: SubscriptionStatus
  accessUntil?: ISODateString
}

export type FeatureEntitlement = {
  key: string
  enabled: boolean
  limit?: number
}

export type ProductAccessDeclaration = {
  productId: EntityId
  publicPreview: boolean
  previewRequiresEntitlement?: boolean
  downloadRequiresEntitlement: boolean
}

export type ProductOwnershipKind = 'owned' | 'included' | 'demo'
export interface ProductOwnership {
  productId: EntityId
  kind: ProductOwnershipKind
  active: boolean
  expiresAt?: ISODateString
}

export type EntitlementSource = 'purchase' | 'subscription' | 'promotion' | 'manual'
export interface ProductEntitlement {
  productId: EntityId
  source: EntitlementSource
  active: boolean
  expiresAt?: ISODateString
}

export type LicenseKind = 'preview' | 'personal' | 'commercial' | 'royalty-free'
export interface LicenseRecord {
  productId: EntityId
  kind: LicenseKind
  active: boolean
  acceptedAt?: ISODateString
  expiresAt?: ISODateString
}

export type PreviewAccess = 'public' | 'entitled' | 'denied'
export type DownloadAccess = 'entitled' | 'denied'

export interface Quota {
  key: 'downloads' | 'previews' | 'storage'
  limit: number
  used: number
}

export interface Usage {
  downloads: Quota
  previews: Quota
  storage: Quota
}

export type EntitlementDecisionReason =
  | 'public-preview'
  | 'entitled-preview'
  | 'entitled-download'
  | 'missing-preview-declaration'
  | 'missing-entitlement'
  | 'inactive-entitlement'
  | 'inactive-license'
  | 'expired-entitlement'
  | 'expired-license'
  | 'subscription-not-eligible'
  | 'quota-exhausted'
  | 'invalid-quota'

export interface EntitlementDecision<TAccess extends PreviewAccess | DownloadAccess> {
  allowed: boolean
  access: TAccess
  reason: EntitlementDecisionReason
}

export interface EntitlementContext {
  product: ProductAccessDeclaration
  subscription?: SubscriptionState
  ownership?: ProductOwnership
  entitlement?: ProductEntitlement
  license?: LicenseRecord
  usage: Usage
  now?: ISODateString
}
