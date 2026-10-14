export const promotionScopes = ['all', 'beat', 'loop', 'one-shot', 'sample-pack'] as const
export type PromotionScope = typeof promotionScopes[number]
export type PromotionRule = {
  id: string
  name: string
  scope: PromotionScope
  percentOff: number
  startsAt?: string
  endsAt?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  updatedBy: string
}
export type PromotionInput = Pick<PromotionRule, 'name' | 'scope' | 'percentOff' | 'startsAt' | 'endsAt' | 'enabled'>

export const isPromotionScope = (value: unknown): value is PromotionScope => promotionScopes.includes(value as PromotionScope)
export const isPromotionRule = (value: unknown): value is PromotionRule => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<PromotionRule>
  return typeof item.id === 'string' && typeof item.name === 'string' && item.name.length >= 1 && item.name.length <= 64 &&
    isPromotionScope(item.scope) && Number.isInteger(item.percentOff) && (item.percentOff ?? 0) >= 1 && (item.percentOff ?? 0) <= 75 &&
    (item.startsAt === undefined || typeof item.startsAt === 'string' && Number.isFinite(Date.parse(item.startsAt))) &&
    (item.endsAt === undefined || typeof item.endsAt === 'string' && Number.isFinite(Date.parse(item.endsAt))) &&
    (item.startsAt === undefined || item.endsAt === undefined || Date.parse(item.endsAt) > Date.parse(item.startsAt)) &&
    typeof item.enabled === 'boolean' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' && typeof item.updatedBy === 'string'
}
