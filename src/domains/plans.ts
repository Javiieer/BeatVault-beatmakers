export const DEFAULT_PLAN_STORAGE_BYTES = {
  free: 5 * 1024 ** 3,
  creator: 50 * 1024 ** 3,
  studio: 250 * 1024 ** 3,
} as const

export const CREATOR_PLAN_PRICING = {
  free: { monthlyCents: 0, annualCents: 0, marketplaceFeePercent: 12 },
  creator: { monthlyCents: 599, annualCents: 5900, marketplaceFeePercent: 8 },
  studio: { monthlyCents: 1299, annualCents: 12900, marketplaceFeePercent: 5 },
} as const

export type CreatorPlanId = keyof typeof CREATOR_PLAN_PRICING
export type BillingInterval = 'monthly' | 'annual'

export function getPlanPriceCents(planId: CreatorPlanId, interval: BillingInterval): number {
  return interval === 'annual'
    ? CREATOR_PLAN_PRICING[planId].annualCents
    : CREATOR_PLAN_PRICING[planId].monthlyCents
}

export function estimateSellerNetCents(planId: CreatorPlanId, grossSalesCents: number): number {
  const fee = CREATOR_PLAN_PRICING[planId].marketplaceFeePercent
  return Math.max(0, Math.round(grossSalesCents * (100 - fee) / 100))
}

export function getAnnualSavingsCents(planId: Exclude<CreatorPlanId, 'free'>): number {
  const pricing = CREATOR_PLAN_PRICING[planId]
  return pricing.monthlyCents * 12 - pricing.annualCents
}

export const REFERENCE_MEDIA_BYTES = {
  threeMinuteWav: 44_100 * 6 * 180,
  oneShot: 4 * 1024 ** 2,
} as const

export function estimateStorageCapacity(limitBytes: number | null) {
  if (limitBytes === null) return undefined
  return {
    threeMinuteWavs: Math.floor(limitBytes / REFERENCE_MEDIA_BYTES.threeMinuteWav),
    oneShots: Math.floor(limitBytes / REFERENCE_MEDIA_BYTES.oneShot),
  }
}
