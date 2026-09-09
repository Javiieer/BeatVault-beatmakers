import type { EntitlementContext, EntitlementDecision, PreviewAccess, DownloadAccess } from './types'

function isAvailable(expiresAt: string | undefined, now: string | undefined): boolean {
  return expiresAt === undefined || now === undefined || expiresAt > now
}

function hasExplicitEntitlement(context: EntitlementContext): boolean {
  const { ownership, entitlement, subscription, now } = context
  const owned = ownership?.active === true && isAvailable(ownership.expiresAt, now)
  const granted = entitlement?.active === true && isAvailable(entitlement.expiresAt, now)
  const included = ownership?.kind === 'included' && owned
  const demo = ownership?.kind === 'demo' && owned
  const subscriptionAccess = subscription?.status === 'active' && subscription.accessUntil !== undefined
    ? isAvailable(subscription.accessUntil, now)
    : false
  return owned || granted || included || demo || subscriptionAccess
}

function validQuota(used: number, limit: number): boolean {
  return Number.isFinite(used) && Number.isFinite(limit) && used >= 0 && limit >= 0
}

export function decidePreviewAccess(context: EntitlementContext): EntitlementDecision<PreviewAccess> {
  if (context.product.publicPreview && context.product.previewRequiresEntitlement !== true) {
    return { allowed: true, access: 'public', reason: 'public-preview' }
  }
  if (!hasExplicitEntitlement(context)) {
    return { allowed: false, access: 'denied', reason: context.product.publicPreview ? 'subscription-not-eligible' : 'missing-preview-declaration' }
  }
  if (context.license?.expiresAt !== undefined && !isAvailable(context.license.expiresAt, context.now)) {
    return { allowed: false, access: 'denied', reason: 'expired-license' }
  }
  return { allowed: true, access: 'entitled', reason: 'entitled-preview' }
}

export function decideDownloadAccess(context: EntitlementContext): EntitlementDecision<DownloadAccess> {
  if (!context.product.downloadRequiresEntitlement) {
    return { allowed: false, access: 'denied', reason: 'missing-entitlement' }
  }
  if (!hasExplicitEntitlement(context)) {
    return { allowed: false, access: 'denied', reason: 'missing-entitlement' }
  }
  if (context.entitlement?.active === false || context.ownership?.active === false) {
    return { allowed: false, access: 'denied', reason: 'inactive-entitlement' }
  }
  if (context.entitlement?.expiresAt !== undefined && !isAvailable(context.entitlement.expiresAt, context.now)) {
    return { allowed: false, access: 'denied', reason: 'expired-entitlement' }
  }
  if (context.license?.active !== true) {
    return { allowed: false, access: 'denied', reason: 'inactive-license' }
  }
  if (context.license.expiresAt !== undefined && !isAvailable(context.license.expiresAt, context.now)) {
    return { allowed: false, access: 'denied', reason: 'expired-license' }
  }
  const quota = context.usage.downloads
  if (!validQuota(quota.used, quota.limit)) {
    return { allowed: false, access: 'denied', reason: 'invalid-quota' }
  }
  if (quota.used >= quota.limit) {
    return { allowed: false, access: 'denied', reason: 'quota-exhausted' }
  }
  return { allowed: true, access: 'entitled', reason: 'entitled-download' }
}
