import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './NotificationCenter';

const mocks = vi.hoisted(() => ({
  readFriendOverview: vi.fn(),
  readChatConversations: vi.fn(),
  readCatalog: vi.fn(),
  readSocialNotifications: vi.fn(),
  readNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  notificationPrefs: { messages: true, friendRequests: true, comments: true, reactions: true, reviews: true },
}));

vi.mock('../data/friendRepository', () => ({ readFriendOverview: mocks.readFriendOverview }));
vi.mock('../data/chatRepository', () => ({ readChatConversations: mocks.readChatConversations }));
vi.mock('../data/catalogRepository', () => ({ CatalogRepository: class { list() { return mocks.readCatalog(); } } }));
vi.mock('../data/socialRepository', () => ({ readSocialNotifications: mocks.readSocialNotifications }));
vi.mock('../data/notificationRepository', () => ({ readNotifications: mocks.readNotifications, markNotificationRead: mocks.markNotificationRead }));
vi.mock('../data/userSettings', () => ({
  defaultUserSettings: { notifications: mocks.notificationPrefs },
  readUserSettings: () => ({ notifications: mocks.notificationPrefs }),
}));

const ok = <T,>(data: T) => ({ ok: true as const, data });
const comment = (id: string, readAt: string | null = null) => ({
  id,
  type: 'social_post_comment' as const,
  actor: { id: 'actor-1', displayName: 'Post Producer' },
  resource: { type: 'social_post', id: 'post-1' },
  createdAt: '2026-10-15T12:00:00.000Z',
  readAt,
});
const friendshipRequest = {
  id: 'persistent-request-1',
  type: 'friend_request' as const,
  actor: { id: 'friend-1', displayName: 'Legacy Friend' },
  resource: { type: 'friendship', id: 'legacy-request-1' },
  createdAt: '2026-10-15T12:00:00.000Z',
  readAt: null,
};

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners = new Map<string, (event: Event) => void>();
  close = vi.fn();

  constructor() { MockEventSource.instances.push(this); }
  addEventListener(type: string, callback: (event: Event) => void) { this.listeners.set(type, callback); }
  emit(type: string, data: unknown) { this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) })); }
  emitMessage(data: unknown) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) })); }
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  mocks.readFriendOverview.mockResolvedValue(ok({ friends: [], incoming: [], outgoing: [] }));
  mocks.readChatConversations.mockResolvedValue(ok([]));
  mocks.readCatalog.mockResolvedValue({ assets: [] });
  mocks.readSocialNotifications.mockResolvedValue(ok([]));
  mocks.readNotifications.mockResolvedValue(ok({ items: [comment('post-comment-1')], unreadCount: 1 }));
  mocks.markNotificationRead.mockResolvedValue(ok({ readAt: '2026-10-15T12:05:00.000Z' }));
});

afterEach(() => vi.unstubAllGlobals());

describe('NotificationCenter persistent notifications', () => {
  it('adds persistent post events while retaining friend, message, catalog and review notifications', async () => {
    mocks.readFriendOverview.mockResolvedValue(ok({
      friends: [],
      incoming: [{ id: 'legacy-request-1', profile: { displayName: 'Legacy Friend' } }],
      outgoing: [],
    }));
    mocks.readChatConversations.mockResolvedValue(ok([{
      peerId: 'peer-1', unreadCount: 1,
      lastMessage: { id: 'message-1', senderId: 'peer-1', body: 'Legacy message remains', createdAt: '2026-10-15T12:00:00.000Z' },
      profile: { displayName: 'Message Producer' },
    }]));
    mocks.readSocialNotifications.mockResolvedValue(ok([{
      id: 'catalog-comment-1', type: 'comment', contentId: 'beat-1', contentTitle: 'Catalog beat', actorId: 'actor-2', actorName: 'Catalog Producer', body: 'Catalog comment', createdAt: '2026-10-15T12:00:00.000Z',
    }]));
    mocks.readNotifications.mockResolvedValue(ok({ items: [comment('post-comment-1'), friendshipRequest], unreadCount: 2 }));
    localStorage.setItem('beatvault:review-notifications:account-1', JSON.stringify([{ id: 'review:beat-1', name: 'Review beat', status: 'published', createdAt: '2026-10-15T12:00:00.000Z' }]));

    render(<NotificationCenter userId="account-1" />);
    await waitFor(() => expect(mocks.readNotifications).toHaveBeenCalledWith({ limit: 25 }));
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));

    expect(await screen.findByText('Post Producer')).toBeInTheDocument();
    expect(await screen.findByText('Legacy Friend')).toBeInTheDocument();
    expect(screen.getAllByText('Legacy Friend')).toHaveLength(1);
    expect(screen.getByText('Legacy message remains')).toBeInTheDocument();
    expect(screen.getByText(/Catalog Producer/)).toBeInTheDocument();
    expect(screen.getByText('Review beat')).toBeInTheDocument();
    await waitFor(() => expect(mocks.markNotificationRead).toHaveBeenCalledWith('post-comment-1'));
    expect(mocks.readNotifications).toHaveBeenCalledWith({ limit: 25 });
  });

  it('loads opaque cursor pages and refreshes from the notification SSE signal', async () => {
    mocks.readNotifications
      .mockResolvedValueOnce(ok({ items: [comment('page-1')], unreadCount: 2, nextCursor: 'cursor/opaque' }))
      .mockResolvedValueOnce(ok({ items: [comment('page-2')], unreadCount: 2 }))
      .mockResolvedValueOnce(ok({ items: [comment('page-3')], unreadCount: 2 }));

    render(<NotificationCenter userId="account-1" />);
    await waitFor(() => expect(mocks.readNotifications).toHaveBeenCalledWith({ limit: 25 }));
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    expect(await screen.findByText('Post Producer')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByText('Post Producer')).toHaveLength(2));
    expect(mocks.readNotifications).toHaveBeenNthCalledWith(2, { limit: 25, cursor: 'cursor/opaque' });

    MockEventSource.instances[0].emit('notification', { notificationId: 'page-3' });
    await waitFor(() => expect(mocks.readNotifications).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getAllByText('Post Producer')).toHaveLength(3));
  });

  it('hides the floating toast while the notification panel is open', async () => {
    mocks.readChatConversations
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{
        peerId: 'peer-1', unreadCount: 1,
        lastMessage: { id: 'message-new', senderId: 'peer-1', body: 'A new message', createdAt: '2026-10-15T12:00:00.000Z' },
        profile: { displayName: 'Message Producer' },
      }]));
    render(<NotificationCenter userId="account-1" />);
    await waitFor(() => expect(mocks.readChatConversations).toHaveBeenCalledTimes(1));
    act(() => MockEventSource.instances[0].emitMessage({ type: 'message', peerId: 'peer-1' }));
    expect(await screen.findByText('Nuevo mensaje de Message Producer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    expect(document.querySelector('.notification-toast')).toBeNull();
    expect(await screen.findByText('A new message')).toBeInTheDocument();
  });
});
