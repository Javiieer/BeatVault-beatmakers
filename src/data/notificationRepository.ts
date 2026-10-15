import { authClient, type ApiClient } from '../api/client';

export type PersistentNotificationType = 'social_post_comment' | 'social_post_reaction' | 'friend_request' | 'friend_request_accepted';

export type PersistentNotification = {
  id: string;
  type: PersistentNotificationType;
  actor: { id: string; displayName: string };
  resource: { type: string; id: string };
  createdAt: string;
  readAt: string | null;
};

export type PersistentNotificationPage = {
  items: PersistentNotification[];
  unreadCount: number;
  nextCursor?: string;
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isUnknown = (value: unknown): value is unknown => value === null || value === undefined || ['string', 'number', 'boolean', 'object'].includes(typeof value);

export const isPersistentNotification = (value: unknown): value is PersistentNotification => {
  if (!isObject(value) || !isObject(value.actor) || !isObject(value.resource)) return false;
  return typeof value.id === 'string' && value.id.length > 0 &&
    (value.type === 'social_post_comment' || value.type === 'social_post_reaction' || value.type === 'friend_request' || value.type === 'friend_request_accepted') &&
    typeof value.actor.id === 'string' && typeof value.actor.displayName === 'string' &&
    typeof value.resource.type === 'string' && typeof value.resource.id === 'string' &&
    typeof value.createdAt === 'string' && (value.readAt === null || typeof value.readAt === 'string');
};

export const isPersistentNotificationPage = (value: unknown): value is PersistentNotificationPage => {
  if (!isObject(value) || !Array.isArray(value.items) || !value.items.every(isPersistentNotification) ||
    !Number.isSafeInteger(value.unreadCount) || (value.unreadCount as number) < 0) return false;
  return value.nextCursor === undefined || typeof value.nextCursor === 'string';
};

export class NotificationRepository {
  constructor(private readonly client: ApiClient = authClient) {}

  async list({ limit = 25, cursor }: { limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams({ limit: String(Math.min(25, Math.max(1, Math.floor(limit)))) });
    if (cursor) params.set('cursor', cursor);
    const result = await this.client.request(`/api/notifications?${params.toString()}`, { method: 'GET' }, isPersistentNotificationPage);
    if (!result.ok) return result;
    const { data } = result;
    return {
      ...result,
      data: {
        items: data.items.map(item => ({
          id: item.id,
          type: item.type,
          actor: { id: item.actor.id, displayName: item.actor.displayName },
          resource: { type: item.resource.type, id: item.resource.id },
          createdAt: item.createdAt,
          readAt: item.readAt,
        })),
        unreadCount: data.unreadCount,
        ...(data.nextCursor === undefined ? {} : { nextCursor: data.nextCursor }),
      },
    };
  }

  markRead(id: string) {
    return this.client.request<unknown>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: JSON.stringify({}) }, isUnknown);
  }
}

const notificationRepository = new NotificationRepository();
export const readNotifications = (options?: { limit?: number; cursor?: string }) => notificationRepository.list(options);
export const markNotificationRead = (id: string) => notificationRepository.markRead(id);
