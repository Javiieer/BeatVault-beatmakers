import { authClient } from '../api/client';
import { isCatalogSocial, isSocialActivityList, type CatalogSocial } from '../domains/social';

export const readCatalogSocial = (contentId: string) => authClient.request(`/api/catalog/${encodeURIComponent(contentId)}/social`, { method: 'GET' }, isCatalogSocial);
export const createCatalogComment = (contentId: string, body: string) => authClient.request(`/api/catalog/${encodeURIComponent(contentId)}/social/comments`, { method: 'POST', body: JSON.stringify({ body }) }, (value): value is CatalogSocial => isCatalogSocial(value));
export const toggleCatalogReaction = (contentId: string) => authClient.request(`/api/catalog/${encodeURIComponent(contentId)}/social/reaction`, { method: 'POST', body: JSON.stringify({}) }, (value): value is { reacted: boolean; reactionCount: number } => !!value && typeof value === 'object' && typeof (value as { reacted?: unknown }).reacted === 'boolean' && Number.isInteger((value as { reactionCount?: unknown }).reactionCount));
export const readSocialNotifications = () => authClient.request('/api/notifications/social', { method: 'GET' }, isSocialActivityList);
