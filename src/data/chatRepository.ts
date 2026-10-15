import { authClient } from '../api/client';
import { isDirectMessage, isDirectMessageList, type ChatConversation } from '../domains/chat';

export type ChatConversationView = ChatConversation & { profile: { accountId: string; displayName: string; bio: string; genres: string[]; avatarId: string; coverId: string; avatarUrl?: string; coverUrl?: string } };
const isConversationList = (value: unknown): value is ChatConversationView[] => Array.isArray(value) && value.every(item => {
  if (!item || typeof item !== 'object') return false;
  const conversation = item as Record<string, unknown>;
  const profile = conversation.profile as Record<string, unknown> | null;
  return typeof conversation.peerId === 'string' && isDirectMessage(conversation.lastMessage) && Number.isInteger(conversation.unreadCount) && !!profile && typeof profile.accountId === 'string' && typeof profile.displayName === 'string' && typeof profile.bio === 'string' && Array.isArray(profile.genres) && profile.genres.every(genre => typeof genre === 'string') && typeof profile.avatarId === 'string' && typeof profile.coverId === 'string' && (profile.avatarUrl === undefined || typeof profile.avatarUrl === 'string') && (profile.coverUrl === undefined || typeof profile.coverUrl === 'string');
});

export const readChatConversations = () => authClient.request('/api/chat/conversations', { method: 'GET' }, isConversationList);
export const readChatPresence = () => authClient.request('/api/chat/presence', { method: 'GET' }, (value): value is { onlineIds: string[] } => !!value && typeof value === 'object' && Array.isArray((value as { onlineIds?: unknown }).onlineIds) && (value as { onlineIds: unknown[] }).onlineIds.every(id => typeof id === 'string'));
export const readChatMessages = (peerId: string) => authClient.request(`/api/chat/conversations/${encodeURIComponent(peerId)}/messages`, { method: 'GET' }, isDirectMessageList);
export const sendChatMessage = (peerId: string, body: string) => authClient.request(`/api/chat/conversations/${encodeURIComponent(peerId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }, isDirectMessage);
export const markChatRead = (peerId: string) => authClient.request(`/api/chat/conversations/${encodeURIComponent(peerId)}/read`, { method: 'POST', body: JSON.stringify({}) }, (value): value is { updated: number; readAt: string } => !!value && typeof value === 'object' && Number.isInteger((value as { updated?: unknown }).updated) && typeof (value as { readAt?: unknown }).readAt === 'string');
