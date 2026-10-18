import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { config } from './config'
import { PostgresRepository, type SqlClient } from './postgres'
import { LocalRepository } from './store'

describe('social account relationships', () => {
  it('persists account-scoped follows and bookmarks idempotently in the JSON repository', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-social-relations-'))
    const previousDirectory = config.dataDirectory
    config.dataDirectory = directory
    try {
      const repo = new LocalRepository()
      const postA = 'd276ad36-9d07-4d17-97e6-075ab8a81a0e'
      const postB = '057d8889-83a8-42c2-89d6-da4a613ae674'
      await repo.followSocialAccount('account-a', 'account-b', 1)
      await repo.followSocialAccount('account-a', 'account-b', 1)
      await expect(repo.followSocialAccount('account-a', 'account-c', 1)).rejects.toThrow('SOCIAL_FOLLOW_LIMIT')
      await expect(repo.followSocialAccount('account-a', 'account-a', 10)).rejects.toThrow('SOCIAL_SELF_FOLLOW')
      await repo.bookmarkSocialPost('account-a', postA, 1)
      await repo.bookmarkSocialPost('account-a', postA, 1)
      await expect(repo.bookmarkSocialPost('account-a', postB, 1)).rejects.toThrow('SOCIAL_BOOKMARK_LIMIT')

      expect(await repo.getSocialAccountState('account-a')).toEqual({ followedAccountIds: ['account-b'], bookmarkedPostIds: [postA] })
      expect(await repo.getSocialAccountState('account-b')).toEqual({ followedAccountIds: [], bookmarkedPostIds: [] })
      await repo.unfollowSocialAccount('account-a', 'account-b')
      await repo.unfollowSocialAccount('account-a', 'account-b')
      await repo.unbookmarkSocialPost('account-a', postA)
      await repo.unbookmarkSocialPost('account-a', postA)
      expect(await repo.getSocialAccountState('account-a')).toEqual({ followedAccountIds: [], bookmarkedPostIds: [] })

      const createdAt = new Date().toISOString()
      await repo.createSocialPost({ id: postB, authorId: 'account-c', kind: 'status', body: 'Delete me', audience: 'public', visibility: 'published', createdAt, updatedAt: createdAt }, 1024)
      await repo.bookmarkSocialPost('account-a', postB, 10)
      await repo.deleteSocialPost(postB, 'account-c')
      expect(await repo.getSocialAccountState('account-a')).toEqual({ followedAccountIds: [], bookmarkedPostIds: [] })
    } finally {
      config.dataDirectory = previousDirectory
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('uses parameterized PostgreSQL writes, account locks, and unique-conflict idempotence', async () => {
    const query = vi.fn().mockImplementation(async (text: string) => {
      if (text.includes('AS exists')) return { rows: [{ exists: false }] }
      if (text.includes('count(*)')) return { rows: [{ count: 0 }] }
      return { rows: [] }
    })
    const release = vi.fn()
    const connect = vi.fn(async () => ({ query, release }))
    const repo = new PostgresRepository({ query, connect } as unknown as SqlClient)
    await repo.followSocialAccount('account-a', 'account-b', 500)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), ['account-a'])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (follower_id, following_id) DO NOTHING'), ['account-a', 'account-b'])
    expect(query).toHaveBeenCalledWith('COMMIT')
    expect(release).toHaveBeenCalledOnce()
    await repo.unfollowSocialAccount('account-a', 'account-b')
    expect(query).toHaveBeenLastCalledWith('DELETE FROM social_account_follows WHERE follower_id = $1 AND following_id = $2', ['account-a', 'account-b'])
  })

  it('reads only the requested account state and applies the bounded query limits', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ following_id: 'account-b' }] })
      .mockResolvedValueOnce({ rows: [{ post_id: 'd276ad36-9d07-4d17-97e6-075ab8a81a0e' }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.getSocialAccountState('account-a')).toEqual({ followedAccountIds: ['account-b'], bookmarkedPostIds: ['d276ad36-9d07-4d17-97e6-075ab8a81a0e'] })
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE follower_id = $1'), ['account-a'])
    expect(query.mock.calls[0][0]).toContain('LIMIT 500')
    expect(query.mock.calls[1][0]).toContain('WHERE account_id = $1')
    expect(query.mock.calls[1][0]).toContain('LIMIT 1000')
  })

  it('summarizes reactions with a bounded aggregate instead of returning every actor ID', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ reaction_count: '42', reacted_by_me: true }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.getSocialPostReactionSummary('d276ad36-9d07-4d17-97e6-075ab8a81a0e', 'account-a')).toEqual({ reactionCount: 42, reactedByMe: true })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('COUNT(*) FILTER'), ['d276ad36-9d07-4d17-97e6-075ab8a81a0e', 'account-a'])
  })
})
