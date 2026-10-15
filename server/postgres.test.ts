import { describe, expect, it, vi } from 'vitest'
import { PostgresRepository, type SqlClient } from './postgres'
import { emptyProfile } from '../src/domains/profile'
import type { NotificationRecord } from './notifications'

describe('PostgresRepository', () => {
  it('lists account storage totals in one aggregate query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ owner_id: 'owner', used_bytes: '4096', original_count: '2', artwork_bytes: '128', artwork_count: '1', preview_bytes: '1024', preview_count: '1' }] })
    const result = await new PostgresRepository({ query: query as unknown as SqlClient['query'] }).listStorageUsage()
    expect(result).toEqual([{ ownerId: 'owner', usedBytes: 4096, originalCount: 2, artworkBytes: 128, artworkCount: 1, previewBytes: 1024, previewCount: 1, storedBytes: 5120 }])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SUM(size_bytes + COALESCE(thumbnail_size_bytes, 0)) AS artwork_bytes'))
  })
  it('persists or removes manual account storage limits with parameterized queries', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ limit_bytes: '8192' }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.getStorageQuota('owner')).toBe(8192)
    expect(query).toHaveBeenCalledWith('SELECT limit_bytes FROM account_storage_quotas WHERE owner_id = $1', ['owner'])
    await repo.setStorageQuota('owner', 4096, 'admin')
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('ON CONFLICT (owner_id) DO UPDATE'), ['owner', 4096, 'admin'])
    await repo.setStorageQuota('owner', null, 'admin')
    expect(query).toHaveBeenLastCalledWith('DELETE FROM account_storage_quotas WHERE owner_id = $1', ['owner'])
  })
  it('lists and persists marketplace promotion rules with parameterized queries', async () => {
    const row = { id: 'promotion-id', name: 'Launch', scope: 'loop' as const, percent_off: 10, starts_at: null, ends_at: null, enabled: true, created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z', updated_by: 'admin' }
    const query = vi.fn().mockResolvedValue({ rows: [row] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const promotion = { id: row.id, name: row.name, scope: row.scope, percentOff: 10, enabled: true, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by }
    expect(await repo.savePromotion(promotion)).toEqual(promotion)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id) DO UPDATE'), [row.id, row.name, 'loop', 10, null, null, true, row.created_at, 'admin'])
    expect(await repo.listPromotions()).toEqual([promotion])
    expect(await repo.deletePromotion(row.id)).toBe(true)
    expect(query).toHaveBeenLastCalledWith('DELETE FROM marketplace_promotions WHERE id = $1 RETURNING id', [row.id])
  })
  it('persists seller beat offer drafts as owner-scoped JSON with parameterized writes', async () => {
    const record = { contentId: 'content-id', ownerId: 'owner-id', description: 'Beat listing for artist placements.', genre: 'R&B', explicitContent: false, rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none' as const, sampleProofAvailable: false, collaborators: [], declarationAccepted: false }, offers: [{ id: 'standard', label: 'Standard', amountMinor: 3000, currency: 'USD' as const, deliverables: ['wav' as const], usageSummary: 'Draft only, not a license.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const }], currency: 'USD' as const, status: 'draft-only' as const, schemaVersion: 1 as const, rightsDeclarationVersion: 'rights-intake-v1' as const, createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' }
    const query = vi.fn().mockResolvedValue({ rows: [{ data: record }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.saveBeatListingDraft(record)).toEqual(record)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (content_id)'), [record.contentId, record.ownerId, JSON.stringify(record), record.createdAt])
    expect(await repo.findBeatListingDraft(record.contentId, record.ownerId)).toEqual(record)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE content_id = $1 AND owner_id = $2'), [record.contentId, record.ownerId])
    query.mockResolvedValueOnce({ rows: [] })
    await expect(repo.saveBeatListingDraft(record)).rejects.toThrow('LISTING_NOT_FOUND')
  })
  it('stores profile metadata separately and uses the account column as identity', async () => {
    const profile = { ...emptyProfile('owner'), displayName: 'Producer' };
    const { accountId, ...metadata } = profile;
    const query = vi.fn().mockResolvedValue({ rows: [{ account_id: accountId, metadata: { ...metadata, accountId: 'forged' } }] });
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] });
    expect(await repo.saveProfile(profile)).toEqual(profile);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO creator_profiles'), [accountId, JSON.stringify(metadata)]);
    expect(await repo.findProfile(accountId)).toEqual(profile);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE account_id = $1'), [accountId]);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await repo.findProfile('missing')).toBeUndefined();
  });
  it('persists and maps durable catalog references with parameterized retry handling', async () => {
    const row = { content_id: 'entry', creator_id: 'owner', type: 'beat', title: 'Audio', tag_ids: ['trap'], preview_ids: [], publication_status: 'draft', asset_id: 'asset', cover_id: 'lo-fi', review_note: null };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] });
    const input = { contentId: 'entry', creatorId: 'owner', type: 'beat' as const, title: 'Audio', tagIds: ['trap'], previewIds: [], publicationStatus: 'draft' as const, assetId: 'asset', coverId: 'lo-fi' as const };
    expect(await repo.createCatalog(input)).toEqual(input);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (creator_id, asset_id)'), ['entry', 'owner', 'beat', 'Audio', ['trap'], [], 'draft', 'asset', 'lo-fi', null]);
    expect(await repo.listCatalog()).toEqual([input]);
    await repo.updateCatalog('entry', { title: 'Audio', type: 'beat', tagIds: [], publicationStatus: 'draft' }, 'owner');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('cover_id = COALESCE($7, cover_id)'), ['Audio', 'beat', [], 'draft', 'entry', 'owner', null]);
  });
  it('uses parameterized account lookup and maps rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'a', email: 'a@test', password_hash: 'hash', role: 'creator' }] })
    const result = await new PostgresRepository({ query: query as unknown as SqlClient['query'] }).findAccountByEmail('a@test')
    expect(result?.passwordHash).toBe('hash')
    expect(result?.planId).toBe('free')
    expect(result?.purchasedPlanIds).toEqual([])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1'), ['a@test'])
  })
  it('stores only hashed durable sessions and scopes revocation by account', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ token_hash: 'a'.repeat(64), account_id: 'account-1', csrf_token_hash: 'b'.repeat(64), expires_at: '1792000000000' }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const session = { tokenHash: 'a'.repeat(64), accountId: 'account-1', csrfTokenHash: 'b'.repeat(64), expiresAt: 1792000000000 }
    await repo.createSession(session)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auth_sessions'), [session.tokenHash, session.accountId, session.csrfTokenHash, session.expiresAt])
    expect(await repo.findSession(session.tokenHash)).toEqual(session)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('expires_at > NOW()'), [session.tokenHash])
    await repo.deleteAccountSessions(session.accountId, session.tokenHash)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('token_hash <> $2'), [session.accountId, session.tokenHash])
    await repo.deleteExpiredSessions(1700000000000)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('expires_at <= to_timestamp($1 / 1000.0)'), [1700000000000])
  })
  it('maps project update and reports missing rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await expect(new PostgresRepository({ query: query as unknown as SqlClient['query'] }).updateProject('p', { title: 'x', status: 'draft' }, 'a')).rejects.toThrow('NOT_FOUND')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $3 AND owner_id = $4'), ['x', 'draft', 'p', 'a'])
  })
  it('stores direct messages with parameterized private conversation queries', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'm1', sender_id: 'a', recipient_id: 'b', body: 'Hello', created_at: '2026-10-10T10:00:00.000Z', read_at: null }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const message = { id: 'm1', senderId: 'a', recipientId: 'b', body: 'Hello', createdAt: '2026-10-10T10:00:00.000Z' }
    expect(await repo.createChatMessage(message)).toEqual(message)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO direct_messages'), ['m1', 'a', 'b', 'Hello', message.createdAt, null])
    query.mockResolvedValueOnce({ rows: [{ id: 'm1', sender_id: 'a', recipient_id: 'b', body: 'Hello', created_at: message.createdAt, read_at: null }] })
    expect(await repo.listChatMessages('b', 'a', 100)).toEqual([message])
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('recipient_id = $1'), ['b', 'a', 100])
    query.mockResolvedValueOnce({ rows: [{ id: 'm1' }] })
    expect(await repo.markChatMessagesRead('b', 'a', '2026-10-10T10:01:00.000Z')).toBe(1)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('read_at IS NULL'), ['b', 'a', '2026-10-10T10:01:00.000Z'])
  })
  it('persists social posts and reports through their dedicated parameterized tables', async () => {
    const createdAt = '2026-10-14T10:00:00.000Z'
    const row = { id: 'd276ad36-9d07-4d17-97e6-075ab8a81a0e', author_id: 'author', kind: 'status' as const, body: 'Status', audience: 'public' as const, visibility: 'pending-review' as const, media_storage_key: null, media_mime_type: null, media_size_bytes: null, media_sha256: null, created_at: createdAt, updated_at: createdAt, reviewed_at: null, reviewed_by: null, review_note: null }
    const query = vi.fn().mockResolvedValue({ rows: [row] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const post = { id: row.id, authorId: row.author_id, kind: row.kind, body: row.body, audience: row.audience, visibility: row.visibility, createdAt, updatedAt: createdAt }
    expect(await repo.createSocialPost(post, 512 * 1024 * 1024)).toEqual(post)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO social_posts'), [row.id, row.author_id, 'status', 'Status', 'public', 'pending-review', null, null, null, null, createdAt, createdAt, null, null, null])
    expect(await repo.listSocialPosts({ authorId: 'author', limit: 21, moderationOnly: true })).toEqual([post])
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("visibility = 'pending-review'"), ['author', true, null, null, 21])
    query.mockResolvedValueOnce({ rows: [{ ...row, visibility: 'published', reviewed_at: createdAt, reviewed_by: 'staff', review_note: 'approved' }] })
    expect(await repo.reviewSocialPost(row.id, 'published', 'staff', 'approved')).toMatchObject({ visibility: 'published', reviewedBy: 'staff' })

    const report = { id: '057d8889-83a8-42c2-89d6-da4a613ae674', postId: row.id, reporterId: 'reporter', reason: 'spam' as const, details: 'spam', status: 'open' as const, createdAt }
    query.mockResolvedValueOnce({ rows: [{ id: report.id, post_id: row.id, reporter_id: report.reporterId, reason: report.reason, details: report.details, status: 'open', created_at: createdAt, reviewed_at: null, reviewed_by: null }] })
    expect(await repo.createSocialPostReport(report)).toEqual(report)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO social_post_reports'), [report.id, row.id, report.reporterId, 'spam', 'spam', 'open', createdAt])
    query.mockResolvedValueOnce({ rows: [{ id: report.id, post_id: row.id, reporter_id: report.reporterId, reason: report.reason, details: report.details, status: 'reviewed', created_at: createdAt, reviewed_at: createdAt, reviewed_by: 'staff' }] })
    expect(await repo.reviewSocialPostReport(report.id, 'reviewed', 'staff')).toMatchObject({ status: 'reviewed', reviewedBy: 'staff' })
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("status = 'open'"), ['reviewed', 'staff', report.id])
  })
  it('persists social post comments and atomically toggles a unique account reaction', async () => {
    const postId = 'd276ad36-9d07-4d17-97e6-075ab8a81a0e'
    const comment = { id: '057d8889-83a8-42c2-89d6-da4a613ae674', postId, authorId: 'actor-1', body: 'Good groove.', createdAt: '2026-10-14T10:00:00.000Z' }
    const query = vi.fn().mockResolvedValue({ rows: [{ id: comment.id, post_id: postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.createSocialPostComment(comment)).toEqual(comment)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO social_post_comments'), [comment.id, postId, comment.authorId, comment.body, comment.createdAt])
    query.mockResolvedValueOnce({ rows: [{ id: comment.id, post_id: postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt }] })
    expect(await repo.listSocialPostComments(postId)).toEqual([comment])
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT 100'), [postId])
    query.mockResolvedValueOnce({ rows: [{ active: true }] })
    expect(await repo.toggleSocialPostReaction(postId, comment.authorId)).toBe(true)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('ON CONFLICT (post_id, actor_id) DO UPDATE SET active = NOT social_post_reactions.active'), [postId, comment.authorId])
    query.mockResolvedValueOnce({ rows: [{ active: false }] })
    expect(await repo.toggleSocialPostReaction(postId, comment.authorId)).toBe(false)
    query.mockResolvedValueOnce({ rows: [{ actor_id: 'actor-2' }] })
    expect(await repo.listSocialPostReactions(postId)).toEqual(['actor-2'])
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('active = TRUE'), [postId])
  })
  it('reads persisted social activity only for the catalog owner and keeps reaction rows valid', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'event-1', type: 'reaction', contentId: 'beat-1', contentTitle: 'Night Drive', actorId: 'listener', actorName: '', body: '', createdAt: '2026-10-10T10:00:00.000Z' }] })
    const activity = await new PostgresRepository({ query: query as unknown as SqlClient['query'] }).listSocialActivity('owner')
    expect(activity).toEqual([expect.objectContaining({ id: 'event-1', type: 'reaction', contentId: 'beat-1', body: '' })])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('COALESCE(e.body, \'\')'), ['owner'])
    expect(query).toHaveBeenCalledWith(expect.stringContaining("a.publication_status = 'published'"), ['owner'])
  })
  it('persists idempotent notifications and returns a recipient-scoped cursor page', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const createdAt = '2026-10-15T12:00:00.000Z'
    const row = { id, recipient_id: 'recipient', actor_id: 'actor', type: 'social_post_comment' as const, resource_type: 'post' as const, resource_id: 'post-1', source_id: 'comment-1', event_key: 'comment:comment-1', created_at: createdAt, read_at: null }
    const query = vi.fn().mockResolvedValue({ rows: [row] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const record = { id, recipientId: row.recipient_id, actorId: row.actor_id, type: row.type, resourceType: row.resource_type, resourceId: row.resource_id, sourceId: row.source_id, eventKey: row.event_key, createdAt, readAt: null }

    const recordWithUntrustedBody = { ...record, body: 'private comment text' } as NotificationRecord
    expect(await repo.createNotification(recordWithUntrustedBody)).toEqual(record)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key'), [id, 'recipient', 'actor', 'social_post_comment', 'post', 'post-1', 'comment-1', 'comment:comment-1', createdAt, null])

    const nextId = '00000000-0000-4000-8000-000000000002'
    query.mockResolvedValueOnce({ rows: [
      { ...row, id: nextId, event_key: 'comment:comment-2', unread_count: '3' },
      { ...row, unread_count: '3' },
    ] })
    expect(await repo.listNotifications('recipient', { limit: 1, cursor: { createdAt: '2026-10-16T00:00:00.000Z', id } })).toEqual({
      items: [{ ...record, id: nextId, eventKey: 'comment:comment-2' }], unreadCount: 3, nextCursor: { createdAt, id: nextId },
    })
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('created_at = $2 AND id < $3::uuid'), ['recipient', '2026-10-16T00:00:00.000Z', id, 2])

    const readAt = new Date('2026-10-15T12:05:00.000Z')
    query.mockResolvedValueOnce({ rows: [{ ...row, read_at: readAt }] })
    expect(await repo.markNotificationRead(id, 'recipient', readAt.toISOString())).toMatchObject({ id, recipientId: 'recipient', readAt: readAt.toISOString() })
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE id = $1 AND recipient_id = $2 RETURNING'), [id, 'recipient', readAt.toISOString()])
    query.mockResolvedValueOnce({ rows: [] })
    expect(await repo.markNotificationRead(id, 'other-recipient', readAt.toISOString())).toBeUndefined()
  })
  it('commits social comments, reactions, and friendship notifications in the same SQL statement', async () => {
    const createdAt = '2026-10-15T12:00:00.000Z'
    const postId = 'f276ad36-9d07-47cd-8a2f-97dc2b6b680a'
    const notificationFields = {
      notification_id: '80000000-0000-4000-8000-000000000001', notification_recipient_id: 'owner', notification_actor_id: 'actor',
      notification_type: 'social_post_comment' as const, notification_resource_type: 'post' as const, notification_resource_id: postId,
      notification_source_id: 'comment-1', notification_event_key: 'social_post_comment:comment-1', notification_created_at: createdAt, notification_read_at: null,
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'comment-1', post_id: postId, author_id: 'actor', body: 'Nice beat', created_at: createdAt, ...notificationFields }] })
      .mockResolvedValueOnce({ rows: [{ active: true, ...notificationFields, notification_type: 'social_post_reaction', notification_source_id: `${postId}:actor`, notification_event_key: `social_post_reaction:${postId}:actor` }] })
      .mockResolvedValueOnce({ rows: [{ active: false, ...notificationFields, notification_id: null, notification_recipient_id: null, notification_actor_id: null, notification_type: null, notification_resource_type: null, notification_resource_id: null, notification_source_id: null, notification_event_key: null, notification_created_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'friend-1', requesterId: 'actor', recipientId: 'owner', status: 'pending', createdAt, updatedAt: createdAt, ...notificationFields, notification_type: 'friend_request', notification_resource_type: 'friendship', notification_resource_id: 'friend-1', notification_source_id: 'friend-1', notification_event_key: 'friend_request:friend-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'friend-1', requesterId: 'actor', recipientId: 'owner', status: 'accepted', createdAt, updatedAt: createdAt, ...notificationFields, notification_type: 'friend_request_accepted', notification_resource_type: 'friendship', notification_resource_id: 'friend-1', notification_source_id: 'friend-1', notification_event_key: 'friend_request_accepted:friend-1' }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const commentSeed: NotificationRecord = { id: notificationFields.notification_id, recipientId: 'owner', actorId: 'actor', type: 'social_post_comment', resourceType: 'post', resourceId: postId, sourceId: 'comment-1', eventKey: notificationFields.notification_event_key, createdAt, readAt: null }
    const comment = await repo.createSocialPostCommentWithNotification({ id: 'comment-1', postId, authorId: 'actor', body: 'Nice beat', createdAt }, commentSeed)
    expect(comment.value).toEqual({ id: 'comment-1', postId, authorId: 'actor', body: 'Nice beat', createdAt })
    expect(comment.notifications[0]).toMatchObject({ id: notificationFields.notification_id, recipientId: 'owner', actorId: 'actor' })
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('FROM created JOIN social_posts post'), expect.arrayContaining(['comment-1', postId, 'actor', 'Nice beat', createdAt]))
    expect(query.mock.calls[0][0]).toContain('INSERT INTO notifications')

    const reactionSeed: NotificationRecord = { ...commentSeed, type: 'social_post_reaction', sourceId: `${postId}:actor`, eventKey: `social_post_reaction:${postId}:actor` }
    expect((await repo.toggleSocialPostReactionWithNotification(postId, 'actor', reactionSeed)).notifications).toHaveLength(1)
    expect(query.mock.calls[1][0]).toContain('changed.active = TRUE')
    expect((await repo.toggleSocialPostReactionWithNotification(postId, 'actor', reactionSeed)).notifications).toEqual([])

    const requestSeed: NotificationRecord = { ...commentSeed, type: 'friend_request', resourceType: 'friendship', resourceId: 'friend-1', sourceId: 'friend-1', eventKey: 'friend_request:friend-1' }
    const request = await repo.createFriendshipWithNotification({ id: 'friend-1', requesterId: 'actor', recipientId: 'owner', status: 'pending', createdAt, updatedAt: createdAt }, requestSeed)
    expect(request.value.status).toBe('pending')
    expect(query.mock.calls[3][0]).toContain('WITH created AS')

    const acceptedSeed: NotificationRecord = { ...requestSeed, type: 'friend_request_accepted', eventKey: 'friend_request_accepted:friend-1' }
    const accepted = await repo.acceptFriendshipWithNotification('friend-1', 'owner', acceptedSeed)
    expect(accepted.value?.status).toBe('accepted')
    expect(query.mock.calls[4][0]).toContain("status = 'pending'")
    expect(query.mock.calls[4][0]).toContain('INSERT INTO notifications')
  })
})
