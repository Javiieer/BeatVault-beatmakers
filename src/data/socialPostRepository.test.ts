import { beforeEach, describe, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../api/client', () => ({ authClient: { request } }))

import { readSocialAccountState, readSocialPostInteractionsBatch, setSocialFollow, setSocialPostBookmark } from './socialPostRepository'

describe('social account relationship API client', () => {
  beforeEach(() => request.mockReset())

  it('reads only the authenticated account relationship snapshot', async () => {
    const state = { followedAccountIds: ['account-b'], bookmarkedPostIds: ['d276ad36-9d07-4d17-97e6-075ab8a81a0e'] }
    request.mockResolvedValue({ ok: true, data: state })
    expect(await readSocialAccountState()).toEqual({ ok: true, data: state })
    expect(request).toHaveBeenCalledWith('/api/account/social-state', { method: 'GET' }, expect.any(Function))
  })

  it('uses idempotent account-ID methods for follows and post bookmarks', async () => {
    request.mockResolvedValueOnce({ ok: true, data: { following: true } })
    request.mockResolvedValueOnce({ ok: true, data: { bookmarked: true } })
    const accountId = 'account-b'
    const postId = 'd276ad36-9d07-4d17-97e6-075ab8a81a0e'
    await setSocialFollow(accountId, true)
    await setSocialPostBookmark(postId, true)
    expect(request).toHaveBeenNthCalledWith(1, `/api/follows/${accountId}`, { method: 'PUT', body: '{}' }, expect.any(Function))
    expect(request).toHaveBeenNthCalledWith(2, `/api/posts/${postId}/bookmark`, { method: 'PUT', body: '{}' }, expect.any(Function))
    await setSocialFollow(accountId, false)
    await setSocialPostBookmark(postId, false)
    expect(request).toHaveBeenNthCalledWith(3, `/api/follows/${accountId}`, { method: 'DELETE', body: '{}' }, expect.any(Function))
    expect(request).toHaveBeenNthCalledWith(4, `/api/posts/${postId}/bookmark`, { method: 'DELETE', body: '{}' }, expect.any(Function))
  })

  it('sends interaction reads as repeated post IDs', async () => {
    const postIds = ['d276ad36-9d07-4d17-97e6-075ab8a81a0e', '057d8889-83a8-42c2-89d6-da4a613ae674']
    request.mockResolvedValue({ ok: true, data: { items: Object.fromEntries(postIds.map(id => [id, { comments: [], reactionCount: 0, reactedByMe: false }])) } })
    await readSocialPostInteractionsBatch(postIds)
    expect(request).toHaveBeenCalledWith(`/api/posts/interactions?id=${postIds[0]}&id=${postIds[1]}`, { method: 'GET' }, expect.any(Function))
  })
})
