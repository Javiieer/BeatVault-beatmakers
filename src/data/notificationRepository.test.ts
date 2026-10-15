import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { isPersistentNotificationPage, NotificationRepository } from './notificationRepository';

const response = (data: unknown, status = 200) => new Response(JSON.stringify({ ok: true, data }), { status });

const commentNotification = {
  id: 'notification-1',
  type: 'social_post_comment',
  actor: { id: 'creator-2', displayName: 'Producer Two' },
  resource: { type: 'social_post', id: 'post-1' },
  createdAt: '2026-10-15T12:00:00.000Z',
  readAt: null,
};

describe('NotificationRepository', () => {
  it('validates the persistent page contract and rejects malformed records', () => {
    expect(isPersistentNotificationPage({ items: [commentNotification], unreadCount: 1, nextCursor: 'opaque' })).toBe(true);
    expect(isPersistentNotificationPage({ items: [{ ...commentNotification, actor: { id: 2 } }], unreadCount: 1 })).toBe(false);
    expect(isPersistentNotificationPage({ items: [], unreadCount: -1 })).toBe(false);
    expect(isPersistentNotificationPage({ items: [], unreadCount: 0, nextCursor: 12 })).toBe(false);
  });

  it('loads a cursor page using the future API contract', async () => {
    const privateFields = { recipientId: 'private-recipient', eventKey: 'private-event', reportText: 'private report detail' };
    const fetcher = vi.fn().mockResolvedValue(response({ items: [{ ...commentNotification, ...privateFields, actor: { ...commentNotification.actor, email: 'private@example.test' } }], unreadCount: 2, nextCursor: 'next/page+token=' }));
    const repository = new NotificationRepository(new ApiClient('http://api', 100, fetcher));

    const result = await repository.list({ cursor: 'opaque/page+token=' });

    expect(fetcher.mock.calls[0][0]).toBe('http://api/api/notifications?limit=25&cursor=opaque%2Fpage%2Btoken%3D');
    expect(result).toMatchObject({ ok: true, data: { items: [commentNotification], unreadCount: 2, nextCursor: 'next/page+token=' } });
    if (result.ok) {
      expect(result.data.items[0]).not.toHaveProperty('recipientId');
      expect(result.data.items[0]).not.toHaveProperty('eventKey');
      expect(result.data.items[0]).not.toHaveProperty('reportText');
      expect(result.data.items[0].actor).not.toHaveProperty('email');
    }
  });

  it('marks one encoded notification id with an idempotent POST body', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ readAt: '2026-10-15T12:01:00.000Z' }));
    const repository = new NotificationRepository(new ApiClient('http://api', 100, fetcher));

    await repository.markRead('notification/id');

    expect(fetcher.mock.calls[0][0]).toBe('http://api/api/notifications/notification%2Fid/read');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include', body: '{}' });
  });
});
