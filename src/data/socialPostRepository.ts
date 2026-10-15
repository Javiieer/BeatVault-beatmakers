import { authClient } from '../api/client';

export type SocialPostKind = 'status' | 'photo' | 'video';
export type SocialAudience = 'public' | 'friends' | 'private';
export type SocialPostVisibility = 'pending-review' | 'published' | 'rejected' | 'removed';
export type SocialPostView = {
  id: string;
  author: { id: string; displayName: string; avatarId?: string; avatarUrl?: string };
  kind: SocialPostKind;
  body: string;
  audience: SocialAudience;
  visibility: SocialPostVisibility;
  media?: { url: string; mimeType: string; sizeBytes: number };
  createdAt: string;
};
export type SocialPostPage = { posts: SocialPostView[]; nextCursor?: string };
export type SocialPostComment = { id: string; authorId: string; authorName: string; body: string; createdAt: string };
export type SocialPostInteraction = { comments: SocialPostComment[]; reactionCount: number; reactedByMe: boolean };
export type SocialPostReportReason = 'spam' | 'harassment' | 'copyright' | 'nudity' | 'violence' | 'other';
export type SocialPostReportView = { id: string; postId: string; reporterId: string; reason: SocialPostReportReason; details: string; status: 'open' | 'reviewed' | 'dismissed'; createdAt: string; post?: SocialPostView };

const isPost = (value: unknown): value is SocialPostView => {
  if (!value || typeof value !== 'object') return false;
  const post = value as Record<string, unknown>;
  const author = post.author as Record<string, unknown> | undefined;
  const media = post.media as Record<string, unknown> | undefined;
  return typeof post.id === 'string' && !!author && typeof author.id === 'string' && typeof author.displayName === 'string' &&
    ['status', 'photo', 'video'].includes(post.kind as string) && typeof post.body === 'string' &&
    ['public', 'friends', 'private'].includes(post.audience as string) &&
    ['pending-review', 'published', 'rejected', 'removed'].includes(post.visibility as string) &&
    typeof post.createdAt === 'string' && (!media || typeof media.url === 'string' && typeof media.mimeType === 'string' && typeof media.sizeBytes === 'number');
};
const isPage = (value: unknown): value is SocialPostPage => !!value && typeof value === 'object' &&
  Array.isArray((value as Record<string, unknown>).posts) && ((value as { posts: unknown[] }).posts).every(isPost) &&
  ((value as Record<string, unknown>).nextCursor === undefined || typeof (value as Record<string, unknown>).nextCursor === 'string');
const isDeleted = (value: unknown): value is { id: string } => !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string';
const isInteraction = (value: unknown): value is SocialPostInteraction => {
  if (!value || typeof value !== 'object') return false;
  const interaction = value as Record<string, unknown>;
  return Array.isArray(interaction.comments) && interaction.comments.every(comment => {
    if (!comment || typeof comment !== 'object') return false;
    const entry = comment as Record<string, unknown>;
    return typeof entry.id === 'string' && typeof entry.authorId === 'string' && typeof entry.authorName === 'string' && typeof entry.body === 'string' && typeof entry.createdAt === 'string';
  }) && Number.isSafeInteger(interaction.reactionCount) && Number(interaction.reactionCount) >= 0 && typeof interaction.reactedByMe === 'boolean';
};
const isReaction = (value: unknown): value is { reacted: boolean; reactionCount: number } => !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).reacted === 'boolean' && Number.isSafeInteger((value as Record<string, unknown>).reactionCount) && Number((value as Record<string, unknown>).reactionCount) >= 0;
const isReported = (value: unknown): value is { id: string; status: 'open' } => !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string' && (value as Record<string, unknown>).status === 'open';
const isSocialPostList = (value: unknown): value is { posts: SocialPostView[] } => !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).posts) && ((value as { posts: unknown[] }).posts).every(isPost);
const isSocialPostReport = (value: unknown): value is SocialPostReportView => {
  if (!value || typeof value !== 'object') return false;
  const report = value as Record<string, unknown>;
  return typeof report.id === 'string' && typeof report.postId === 'string' && typeof report.reporterId === 'string' &&
    ['spam', 'harassment', 'copyright', 'nudity', 'violence', 'other'].includes(report.reason as string) &&
    typeof report.details === 'string' && ['open', 'reviewed', 'dismissed'].includes(report.status as string) &&
    typeof report.createdAt === 'string' && (report.post === undefined || isPost(report.post));
};
const isSocialPostReportList = (value: unknown): value is { reports: SocialPostReportView[] } => !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).reports) && ((value as { reports: unknown[] }).reports).every(isSocialPostReport);

const query = (limit: number, cursor?: string) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return params.toString();
};

export const readSocialFeed = (limit = 30, cursor?: string) =>
  authClient.request(`/api/feed?${query(limit, cursor)}`, { method: 'GET' }, isPage);

export const readProfileSocialPosts = (profileId: string, limit = 30, cursor?: string) =>
  authClient.request(`/api/profiles/${encodeURIComponent(profileId)}/posts?${query(limit, cursor)}`, { method: 'GET' }, isPage);

export const createSocialPost = (input: { kind: SocialPostKind; body: string; audience: SocialAudience; file?: File }) => {
  if (!input.file) return authClient.request('/api/posts', { method: 'POST', body: JSON.stringify({ kind: 'status', body: input.body, audience: input.audience }) }, isPost);
  const form = new FormData();
  form.append('file', input.file, input.file.name);
  form.append('body', input.body);
  form.append('audience', input.audience);
  return authClient.request('/api/posts', { method: 'POST', body: form, headers: { 'X-Social-Post-Kind': input.kind } }, isPost);
};

export const deleteSocialPost = (postId: string) => authClient.request(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE', body: JSON.stringify({}) }, isDeleted);

export const reportSocialPost = (postId: string, reason: SocialPostReportReason, details: string) =>
  authClient.request(`/api/posts/${encodeURIComponent(postId)}/reports`, { method: 'POST', body: JSON.stringify({ reason, details }) }, isReported);

export const readSocialPostInteractions = (postId: string) =>
  authClient.request(`/api/posts/${encodeURIComponent(postId)}/social`, { method: 'GET' }, isInteraction);
export const createSocialPostComment = (postId: string, body: string) =>
  authClient.request(`/api/posts/${encodeURIComponent(postId)}/comments`, { method: 'POST', body: JSON.stringify({ body }) }, isInteraction);
export const toggleSocialPostReaction = (postId: string) =>
  authClient.request(`/api/posts/${encodeURIComponent(postId)}/reaction`, { method: 'POST', body: JSON.stringify({}) }, isReaction);

export const readSocialModerationPosts = () => authClient.request('/api/social-moderation/posts', { method: 'GET' }, isSocialPostList);
export const reviewSocialPost = (postId: string, status: 'published' | 'rejected' | 'removed', note = '') =>
  authClient.request(`/api/social-moderation/posts/${encodeURIComponent(postId)}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }, isPost);
export const readSocialModerationReports = () => authClient.request('/api/social-moderation/reports', { method: 'GET' }, isSocialPostReportList);
export const reviewSocialPostReport = (reportId: string, status: 'reviewed' | 'dismissed') =>
  authClient.request(`/api/social-moderation/reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }, isSocialPostReport);
