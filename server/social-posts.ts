import type { CreatorProfile } from '../src/domains/profile'

export type SocialPostKind = 'status' | 'photo' | 'video'
export type SocialAudience = 'public' | 'friends' | 'private'
export type SocialPostVisibility = 'pending-review' | 'published' | 'rejected' | 'removed'
export type SocialPostMedia = { storageKey: string; mimeType: 'image/jpeg' | 'image/png' | 'video/mp4'; sizeBytes: number; sha256: string }
export type SocialPost = {
  id: string
  authorId: string
  kind: SocialPostKind
  body: string
  audience: SocialAudience
  visibility: SocialPostVisibility
  media?: SocialPostMedia
  createdAt: string
  updatedAt: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
}
export type SocialPostReport = { id: string; postId: string; reporterId: string; reason: 'spam' | 'harassment' | 'copyright' | 'nudity' | 'violence' | 'other'; details: string; status: 'open' | 'reviewed' | 'dismissed'; createdAt: string; reviewedAt?: string; reviewedBy?: string }
export type SocialPostComment = { id: string; postId: string; authorId: string; body: string; createdAt: string }
export type SocialPostCommentView = Pick<SocialPostComment, 'id' | 'authorId' | 'body' | 'createdAt'> & { authorName: string }
export type SocialPostInteractionSnapshot = { comments: SocialPostCommentView[]; reactionCount: number; reactedByMe: boolean }
export type SocialPostReactionResult = { reacted: boolean; reactionCount: number }
export type SocialPostCursor = { createdAt: string; id: string }
export type SocialPostCreate = Pick<SocialPost, 'id' | 'authorId' | 'kind' | 'body' | 'audience' | 'visibility' | 'createdAt' | 'updatedAt'> & { media?: SocialPostMedia }

export const isSocialPostComment = (value: unknown): value is SocialPostComment => {
  if (!value || typeof value !== 'object') return false
  const comment = value as Partial<SocialPostComment>
  return typeof comment.id === 'string' && /^[a-f0-9-]{36}$/i.test(comment.id) && typeof comment.postId === 'string' && /^[a-f0-9-]{36}$/i.test(comment.postId) && typeof comment.authorId === 'string' && comment.authorId.length > 0 && typeof comment.body === 'string' && comment.body.trim().length >= 1 && comment.body.length <= 500 && typeof comment.createdAt === 'string'
}

export const isSocialPost = (value: unknown): value is SocialPost => {
  if (!value || typeof value !== 'object') return false
  const post = value as Partial<SocialPost>
  const safeOwner = typeof post.authorId === 'string' ? post.authorId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) : ''
  const validMedia = post.media === undefined || (!!post.media && typeof post.media.storageKey === 'string' && new RegExp(`^social-posts/${safeOwner}/[a-f0-9-]{36}$`, 'i').test(post.media.storageKey) && ['image/jpeg', 'image/png', 'video/mp4'].includes(post.media.mimeType || '') && Number.isSafeInteger(post.media.sizeBytes) && (post.media.sizeBytes || 0) > 0 && /^[a-f0-9]{64}$/.test(post.media.sha256 || '') && (post.kind === 'photo' ? post.media.mimeType === 'image/jpeg' || post.media.mimeType === 'image/png' : post.kind === 'video' && post.media.mimeType === 'video/mp4'))
  return typeof post.id === 'string' && /^[a-f0-9-]{36}$/i.test(post.id) && typeof post.authorId === 'string' && post.authorId.length > 0 && ['status', 'photo', 'video'].includes(post.kind || '') && typeof post.body === 'string' && post.body.trim().length > 0 && post.body.length <= 600 && ['public', 'friends', 'private'].includes(post.audience || '') && ['pending-review', 'published', 'rejected', 'removed'].includes(post.visibility || '') && validMedia && (post.kind === 'status' ? post.media === undefined : post.media !== undefined) && typeof post.createdAt === 'string' && typeof post.updatedAt === 'string'
}
export const isSocialPostReport = (value: unknown): value is SocialPostReport => {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<SocialPostReport>
  return typeof report.id === 'string' && typeof report.postId === 'string' && typeof report.reporterId === 'string' && ['spam', 'harassment', 'copyright', 'nudity', 'violence', 'other'].includes(report.reason || '') && typeof report.details === 'string' && report.details.length <= 500 && ['open', 'reviewed', 'dismissed'].includes(report.status || '') && typeof report.createdAt === 'string'
}
export const socialPostView = (post: SocialPost, author: CreatorProfile | undefined) => ({
  id: post.id,
  author: { id: post.authorId, displayName: author?.displayName || 'BeatVault creator', avatarId: author?.avatarId, avatarUrl: author?.avatarUrl, avatarFocalPoint: author?.avatarFocalPoint },
  kind: post.kind,
  body: post.body,
  audience: post.audience === 'public' && !author?.publicProfile ? 'friends' : post.audience,
  visibility: post.visibility,
  media: post.media ? { url: `/api/posts/${encodeURIComponent(post.id)}/media`, mimeType: post.media.mimeType, sizeBytes: post.media.sizeBytes } : undefined,
  createdAt: post.createdAt,
})
