import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { config } from './config'
import { LocalRepository } from './store'
import { isSocialPost, socialPostView } from './social-posts'
import { emptyProfile } from '../src/domains/profile'

describe('social posts JSON repository contract', () => {
  let oldDirectory: string
  let tempDirectory: string
  afterEach(async () => { if (oldDirectory) config.dataDirectory = oldDirectory; if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }) })

  it('persists isolated posts, applies cursor order, enforces ownership on delete and keeps reports auditable', async () => {
    oldDirectory = config.dataDirectory
    tempDirectory = await mkdtemp(join(tmpdir(), 'beatvault-social-posts-'))
    config.dataDirectory = tempDirectory
    const repository = new LocalRepository()
    const authorId = randomUUID()
    const createdAt = '2026-10-14T10:00:00.000Z'
    const first = { id: randomUUID(), authorId, kind: 'status' as const, body: 'First', audience: 'private' as const, visibility: 'published' as const, createdAt, updatedAt: createdAt }
    const second = { ...first, id: randomUUID(), body: 'Second', createdAt: '2026-10-14T11:00:00.000Z', updatedAt: '2026-10-14T11:00:00.000Z' }
    expect(isSocialPost(first)).toBe(true)
    expect(await repository.createSocialPost(first, 1024)).toEqual(first)
    await repository.createSocialPost(second, 1024)
    expect((await repository.listSocialPosts({ limit: 1 })).map(post => post.id)).toEqual([second.id])
    expect((await repository.listSocialPosts({ limit: 2, cursor: { createdAt: second.createdAt, id: second.id } })).map(post => post.id)).toEqual([first.id])
    expect(await repository.deleteSocialPost(first.id, randomUUID())).toBeUndefined()
    const report = { id: randomUUID(), postId: second.id, reporterId: randomUUID(), reason: 'spam' as const, details: 'Repeated spam', status: 'open' as const, createdAt }
    expect(await repository.createSocialPostReport(report)).toEqual(report)
    await expect(repository.createSocialPostReport({ ...report, id: randomUUID() })).rejects.toThrow('SOCIAL_REPORT_EXISTS')
    const reviewed = await repository.reviewSocialPostReport(report.id, 'dismissed', randomUUID())
    expect(reviewed).toMatchObject({ status: 'dismissed', reviewedBy: expect.any(String), reviewedAt: expect.any(String) })
    expect(await repository.listSocialPostReports('open')).toEqual([])
    expect((await repository.deleteSocialPost(second.id, authorId))?.id).toBe(second.id)
  })

  it('only releases a pending public post through a staff decision', async () => {
    oldDirectory = config.dataDirectory
    tempDirectory = await mkdtemp(join(tmpdir(), 'beatvault-social-review-'))
    config.dataDirectory = tempDirectory
    const repository = new LocalRepository()
    const now = new Date().toISOString()
    const post = { id: randomUUID(), authorId: randomUUID(), kind: 'status' as const, body: 'Pending', audience: 'public' as const, visibility: 'pending-review' as const, createdAt: now, updatedAt: now }
    await repository.createSocialPost(post, 1024)
    expect(await repository.reviewSocialPost(post.id, 'published', randomUUID(), 'Approved')).toMatchObject({ visibility: 'published', reviewNote: 'Approved', reviewedBy: expect.any(String) })
    expect(await repository.reviewSocialPost(post.id, 'published', randomUUID())).toBeUndefined()
    expect(await repository.reviewSocialPost(post.id, 'removed', randomUUID(), 'Reported')).toMatchObject({ visibility: 'removed' })
  })

  it('shows the effective friends-only audience for posts on private profiles', () => {
    const post = { id: randomUUID(), authorId: randomUUID(), kind: 'status' as const, body: 'Friends only', audience: 'public' as const, visibility: 'published' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const privateProfile = { ...emptyProfile(post.authorId), publicProfile: false }
    const publicProfile = { ...privateProfile, publicProfile: true }
    expect(socialPostView(post, privateProfile).audience).toBe('friends')
    expect(socialPostView(post, publicProfile).audience).toBe('public')
  })
})
