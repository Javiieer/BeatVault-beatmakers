import { authClient } from '../api/client'
import type { ApiResult } from '../domains/core/contracts'
import { readFavoriteIds } from './localFavorites'
import { scopedKey } from './storageScope'

export type AccountFavorites = { accountId: string; contentIds: string[]; migrationWarning?: string }
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const migrationKey = (userId: string) => scopedKey('beatvault:library-favorites-migrated-v1', userId)
const syncKey = (userId: string) => scopedKey('beatvault:library-favorites-sync', userId)
const migratedThisSession = new Set<string>()
const inFlightLoads = new Map<string, Promise<ApiResult<AccountFavorites>>>()
const accountHeaders = (userId: string) => ({ 'X-BeatVault-Account': userId })
function isFavorites(value: unknown): value is AccountFavorites {
  if (!value || typeof value !== 'object') return false
  const row = value as AccountFavorites
  return typeof row.accountId === 'string' && row.accountId.length > 0 && row.accountId.length <= 100 &&
    Array.isArray(row.contentIds) && row.contentIds.length <= 1000 && row.contentIds.every(id => typeof id === 'string' && uuid.test(id)) && new Set(row.contentIds).size === row.contentIds.length
}
function checkAccount(result: ApiResult<AccountFavorites>, userId: string): ApiResult<AccountFavorites> {
  return result.ok && result.data.accountId !== userId ? { ok: false, error: { code: 'ACCOUNT_CHANGED', message: 'Your account changed. Reload your library.' } } : result
}
const readRemote = async (userId: string) => checkAccount(await authClient.request('/api/account/favorites', { method: 'GET', headers: accountHeaders(userId) }, isFavorites), userId)
export async function setAccountFavorite(userId: string, contentId: string, saved: boolean): Promise<ApiResult<AccountFavorites>> {
  if (!uuid.test(contentId)) return { ok: false, error: { code: 'INVALID_FAVORITE', message: 'This audio link is not valid.' } }
  return checkAccount(await authClient.request(`/api/account/favorites/${encodeURIComponent(contentId)}`, { method: saved ? 'PUT' : 'DELETE', headers: accountHeaders(userId) }, isFavorites), userId)
}
function hasMigrated(userId: string) {
  if (migratedThisSession.has(userId)) return true
  try { return localStorage.getItem(migrationKey(userId)) === '1' } catch { return false }
}
async function loadAndMigrate(userId: string): Promise<ApiResult<AccountFavorites>> {
  const current = await readRemote(userId)
  if (!current.ok || hasMigrated(userId)) return current
  // Preserve the old scoped browser record. Never claim unscoped keys for an account.
  const previous = [...(readFavoriteIds(userId) || [])].filter(id => uuid.test(id))
  const missing = previous.filter(id => !current.data.contentIds.includes(id)).slice(0, 1000)
  let unavailable = 0
  for (const contentId of missing) {
    const result = await setAccountFavorite(userId, contentId, true)
    if (!result.ok) {
      if (['FAVORITE_NOT_AVAILABLE', 'CATALOG_NOT_FOUND', 'NOT_FOUND', 'FAVORITE_UNAVAILABLE'].includes(result.error.code)) { unavailable++; continue }
      return { ok: true, data: { ...current.data, migrationWarning: 'Some browser-saved audio could not be transferred. Its browser copy was kept; retry to finish.' } }
    }
  }
  const canonical = missing.length ? await readRemote(userId) : current
  if (!canonical.ok) return canonical
  migratedThisSession.add(userId)
  try { localStorage.setItem(migrationKey(userId), '1') } catch { /* Server data does not require browser persistence. */ }
  return { ok: true, data: { ...canonical.data, ...(unavailable ? { migrationWarning: 'Some browser-saved audio is no longer public. Its original browser record was kept.' } : {}) } }
}
export function loadAccountFavorites(userId: string): Promise<ApiResult<AccountFavorites>> {
  const existing = inFlightLoads.get(userId)
  if (existing) return existing
  const pending = loadAndMigrate(userId).finally(() => { if (inFlightLoads.get(userId) === pending) inFlightLoads.delete(userId) })
  inFlightLoads.set(userId, pending)
  return pending
}
export function publishFavoriteChange(userId: string) {
  window.dispatchEvent(new CustomEvent('beatvault:favorites-changed', { detail: { userId } }))
  try { localStorage.setItem(syncKey(userId), `${Date.now()}-${Math.random()}`) } catch { /* Same-window subscriptions still refresh. */ }
}
