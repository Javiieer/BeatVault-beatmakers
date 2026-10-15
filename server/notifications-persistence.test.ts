import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonStore, LocalRepository } from './store'
import type { NotificationRecord } from './notifications'
import type { NotificationSeed } from './notifications'
import type { SocialPost } from './social-posts'
import { config } from './config'

const createdAt = '2026-10-15T12:00:00.000Z'
const recipientId = 'recipient-account'
const otherRecipientId = 'other-account'
const notification = (id: string, eventKey = `comment:${id}`, overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id,
  recipientId,
  actorId: 'actor-account',
  type: 'social_post_comment',
  resourceType: 'post',
  resourceId: 'f276ad36-9d07-4d17-97e6-075ab8a81a0e',
  sourceId: 'comment-source',
  eventKey,
  createdAt,
  readAt: null,
  ...overrides,
})

describe('JSON notification persistence contract', () => {
  let directory = ''
  let repository: LocalRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'beatvault-notifications-'))
    repository = new LocalRepository(undefined, undefined, undefined, undefined, undefined, new JsonStore(join(directory, 'notifications.json')))
  })

  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('deduplicates concurrent event keys and only lets the recipient mark a notification read', async () => {
    const original = notification('00000000-0000-4000-8000-000000000001', 'comment:shared')
    const retry = notification('00000000-0000-4000-8000-000000000002', 'comment:shared', { actorId: 'different-retry-actor' })
    const inputWithUntrustedBody = { ...original, body: 'comment text must not be stored' } as NotificationRecord
    const [first, second] = await Promise.all([repository.createNotification(inputWithUntrustedBody), repository.createNotification(retry)])
    expect(first).toEqual(original)
    expect(second).toEqual(original)

    expect(await repository.markNotificationRead(original.id, otherRecipientId, createdAt)).toBeUndefined()
    expect((await repository.listNotifications(recipientId, { limit: 25 })).unreadCount).toBe(1)
    const readAt = '2026-10-15T12:05:00.000Z'
    expect(await repository.markNotificationRead(original.id, recipientId, readAt)).toMatchObject({ id: original.id, readAt })
    expect(await repository.markNotificationRead(original.id, recipientId, '2026-10-15T12:10:00.000Z')).toMatchObject({ id: original.id, readAt })
    expect(await repository.listNotifications(recipientId, { limit: 25 })).toMatchObject({ items: [{ id: original.id, readAt }], unreadCount: 0, nextCursor: null })
    expect(await repository.listNotifications(recipientId, { limit: 25 })).not.toHaveProperty('items.0.body')
  })

  it('paginates by createdAt and id descending, scopes items and unread count by recipient', async () => {
    const ids = [1, 2, 3].map(value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`)
    for (const id of ids) await repository.createNotification(notification(id))
    await repository.createNotification(notification('10000000-0000-4000-8000-000000000001', 'other:1', { recipientId: otherRecipientId }))

    const firstPage = await repository.listNotifications(recipientId, { limit: 2 })
    expect(firstPage).toEqual({ items: [notification(ids[2]), notification(ids[1])], unreadCount: 3, nextCursor: { createdAt, id: ids[1] } })
    const secondPage = await repository.listNotifications(recipientId, { limit: 2, cursor: firstPage.nextCursor! })
    expect(secondPage).toEqual({ items: [notification(ids[0])], unreadCount: 3, nextCursor: null })
  })

  it('recovers local notification delivery only after its comment or friendship action is durable', async () => {
    const postId = 'f276ad36-9d07-47cd-8a2f-97dc2b6b680a'
    const post: SocialPost = { id: postId, authorId: recipientId, kind: 'status', body: 'A local post', audience: 'public', visibility: 'published', createdAt, updatedAt: createdAt }
    await repository.createSocialPost(post, 512 * 1024 * 1024)
    const commentId = '20000000-0000-4000-8000-000000000001'
    const commentSeed: NotificationSeed = { id: '30000000-0000-4000-8000-000000000001', type: 'social_post_comment', resourceType: 'post', resourceId: postId, sourceId: commentId, eventKey: `social_post_comment:${commentId}`, createdAt }
    const comment = await repository.createSocialPostCommentWithNotification({ id: commentId, postId, authorId: 'actor-account', body: 'Nice', createdAt }, commentSeed)
    expect(comment.value.id).toBe(commentId)
    expect(comment.notifications).toHaveLength(1)

    const friendshipId = '40000000-0000-4000-8000-000000000001'
    const requestSeed: NotificationSeed = { id: '50000000-0000-4000-8000-000000000001', type: 'friend_request', resourceType: 'friendship', resourceId: friendshipId, sourceId: friendshipId, eventKey: `friend_request:${friendshipId}`, createdAt }
    const request = await repository.createFriendshipWithNotification({ id: friendshipId, requesterId: 'actor-account', recipientId, status: 'pending', createdAt, updatedAt: createdAt }, requestSeed)
    expect(request.value.status).toBe('pending')
    expect(request.notifications).toHaveLength(1)
    const acceptedSeed: NotificationSeed = { id: '60000000-0000-4000-8000-000000000001', type: 'friend_request_accepted', resourceType: 'friendship', resourceId: friendshipId, sourceId: friendshipId, eventKey: `friend_request_accepted:${friendshipId}`, createdAt }
    const accepted = await repository.acceptFriendshipWithNotification(friendshipId, recipientId, acceptedSeed)
    expect(accepted.value?.status).toBe('accepted')
    expect(accepted.notifications).toHaveLength(1)

    expect((await repository.listNotifications(recipientId, { limit: 10 })).items.map(item => item.type)).toEqual(['friend_request', 'social_post_comment'])
    expect((await repository.listNotifications('actor-account', { limit: 10 })).items.map(item => item.type)).toEqual(['friend_request_accepted'])
    expect(await repository.drainNotificationOutbox()).toEqual([])
  })

  it('notifies only when a local reaction becomes active', async () => {
    const postId = 'f276ad36-9d07-47cd-8a2f-97dc2b6b680b'
    await repository.createSocialPost({ id: postId, authorId: recipientId, kind: 'status', body: 'Another local post', audience: 'public', visibility: 'published', createdAt, updatedAt: createdAt }, 512 * 1024 * 1024)
    const sourceId = `${postId}:actor-account`
    const seed: NotificationSeed = { id: '70000000-0000-4000-8000-000000000001', type: 'social_post_reaction', resourceType: 'post', resourceId: postId, sourceId, eventKey: `social_post_reaction:${sourceId}`, createdAt }
    const liked = await repository.toggleSocialPostReactionWithNotification(postId, 'actor-account', seed)
    expect(liked.value).toBe(true)
    expect(liked.notifications).toHaveLength(1)
    const unliked = await repository.toggleSocialPostReactionWithNotification(postId, 'actor-account', seed)
    expect(unliked.value).toBe(false)
    expect(unliked.notifications).toEqual([])
    expect((await repository.listNotifications(recipientId, { limit: 10 })).items.filter(item => item.type === 'social_post_reaction')).toHaveLength(1)
  })

  it('drops uncommitted local journal entries and recovers committed actions after restart', async () => {
    const postId = 'f276ad36-9d07-47cd-8a2f-97dc2b6b680c'
    const commentId = '20000000-0000-4000-8000-000000000002'
    await repository.createSocialPost({ id: postId, authorId: recipientId, kind: 'status', body: 'Journal recovery post', audience: 'public', visibility: 'published', createdAt, updatedAt: createdAt }, 512 * 1024 * 1024)
    const record = notification('90000000-0000-4000-8000-000000000001', `social_post_comment:${commentId}`, { type: 'social_post_comment', resourceType: 'post', resourceId: postId, sourceId: commentId })
    const outbox = new JsonStore(`${config.dataDirectory}/notification-outbox.json`)
    await outbox.write([{ action: 'social_post_comment', notification: record }])
    expect(await repository.drainNotificationOutbox()).toEqual([])
    expect(await repository.listNotifications(recipientId, { limit: 10 })).toMatchObject({ items: [] })

    await repository.createSocialPostComment({ id: commentId, postId, authorId: 'actor-account', body: 'Committed before recovery', createdAt })
    await outbox.write([{ action: 'social_post_comment', notification: record }])
    expect(await repository.drainNotificationOutbox()).toEqual([record])
    expect((await repository.listNotifications(recipientId, { limit: 10 })).items).toEqual([record])
    expect(await repository.drainNotificationOutbox()).toEqual([])
  })
})
