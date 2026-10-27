import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAccountFavorites, setAccountFavorite } from './accountFavoriteRepository'
import { readFavoriteIds, writeFavoriteIds } from './localFavorites'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../api/client', () => ({ authClient: { request } }))
const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const third = '33333333-3333-4333-8333-333333333333'
beforeEach(() => { localStorage.clear(); request.mockReset() })

describe('account favorite persistence and browser migration', () => {
  it('unions only this account browser IDs into the server collection and keeps the source intact', async () => {
    const userId = 'favorites-union'
    writeFavoriteIds(new Set([first]), userId)
    writeFavoriteIds(new Set([third]))
    writeFavoriteIds(new Set([third]), 'someone-else')
    const remote = new Set([second])
    request.mockImplementation(async (path: string, init: RequestInit) => {
      expect(init.headers).toEqual({ 'X-BeatVault-Account': userId })
      if (init.method === 'PUT') remote.add(path.split('/').at(-1)!)
      return { ok: true, data: { accountId: userId, contentIds: [...remote] } }
    })
    const result = await loadAccountFavorites(userId)
    expect(result).toEqual({ ok: true, data: { accountId: userId, contentIds: [second, first] } })
    expect(request.mock.calls.filter(call => call[1].method === 'PUT').map(call => call[0])).toEqual([`/api/account/favorites/${first}`])
    expect(readFavoriteIds(userId)).toEqual(new Set([first]))
    expect(readFavoriteIds()).toEqual(new Set([third]))
    remote.delete(first)
    await loadAccountFavorites(userId)
    expect(remote.has(first)).toBe(false)
  })
  it('never migrates stale browser data into a different logged-in account', async () => {
    writeFavoriteIds(new Set([first]), 'old-session')
    request.mockResolvedValue({ ok: true, data: { accountId: 'new-session', contentIds: [second] } })
    const result = await loadAccountFavorites('old-session')
    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CHANGED' } })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not promote browser IDs to successful server reads while offline', async () => {
    writeFavoriteIds(new Set([first]), 'offline-user')
    request.mockResolvedValue({ ok: false, error: { code: 'NETWORK_ERROR', message: 'Offline' } })
    expect(await loadAccountFavorites('offline-user')).toMatchObject({ ok: false, error: { code: 'NETWORK_ERROR' } })
    expect(readFavoriteIds('offline-user')).toEqual(new Set([first]))
  })
  it('keeps migration retryable after a lost response and uses idempotent additions', async () => {
    const userId = 'retry-user'
    writeFavoriteIds(new Set([first, second]), userId)
    const remote = new Set<string>()
    let fail = true
    request.mockImplementation(async (path: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        remote.add(path.split('/').at(-1)!)
        if (fail) { fail = false; return { ok: false, error: { code: 'TIMEOUT', message: 'Response lost' } } }
      }
      return { ok: true, data: { accountId: userId, contentIds: [...remote] } }
    })
    expect(await loadAccountFavorites(userId)).toMatchObject({ ok: true, data: { migrationWarning: expect.any(String) } })
    expect(await loadAccountFavorites(userId)).toMatchObject({ ok: true, data: { contentIds: [first, second] } })
    expect(readFavoriteIds(userId)).toEqual(new Set([first, second]))
  })
  it('validates UUID paths, session binding, and the remote collection decoder', async () => {
    expect(await setAccountFavorite('buyer', '../private', true)).toMatchObject({ ok: false, error: { code: 'INVALID_FAVORITE' } })
    expect(request).not.toHaveBeenCalled()
    request.mockResolvedValue({ ok: true, data: { accountId: 'other-buyer', contentIds: [first] } })
    expect(await setAccountFavorite('buyer', first, true)).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CHANGED' } })
    const decoder = request.mock.calls[0][2] as (value: unknown) => boolean
    expect(decoder({ accountId: 'buyer', contentIds: [first] })).toBe(true)
    expect(decoder({ accountId: 'buyer', contentIds: ['../private'] })).toBe(false)
    expect(decoder({ accountId: 'buyer', contentIds: [first, first] })).toBe(false)
    expect(decoder({ accountId: 'buyer', contentIds: Array(1001).fill(first) })).toBe(false)
  })
})
