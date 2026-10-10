import { authClient } from '../api/client';
import { isFriendDirectory, isFriendOverview } from '../domains/friends';

const isRequest = (value: unknown): value is { id: string; requesterId: string; recipientId: string; status: 'pending' | 'accepted'; createdAt: string; updatedAt: string } => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.requesterId === 'string' && typeof item.recipientId === 'string' && (item.status === 'pending' || item.status === 'accepted') && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string';
};
const isDeleted = (value: unknown): value is { id: string } => !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';

export const searchCreators = (query: string) => authClient.request(`/api/creators?q=${encodeURIComponent(query)}`, { method: 'GET' }, isFriendDirectory);
export const readFriendOverview = () => authClient.request('/api/friends', { method: 'GET' }, isFriendOverview);
export const sendFriendRequest = (targetId: string) => authClient.request('/api/friend-requests', { method: 'POST', body: JSON.stringify({ targetId }) }, isRequest);
export const acceptFriendRequest = (requestId: string) => authClient.request(`/api/friend-requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST' }, isRequest);
export const removeFriendRequest = (requestId: string) => authClient.request(`/api/friend-requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' }, isDeleted);
export const removeFriend = (friendshipId: string) => authClient.request(`/api/friends/${encodeURIComponent(friendshipId)}`, { method: 'DELETE' }, isDeleted);
