import type { CreatorProfile } from '../src/domains/profile'
import type { SocialAudience, SocialPostMedia } from './social-posts'

export const socialStoryLifetimeMs = 24 * 60 * 60 * 1000
export const socialStoryMaxActivePerAccount = 20
export type SocialStoryKind = 'status' | 'photo' | 'video'
export type SocialStory = {
  id: string
  authorId: string
  kind: SocialStoryKind
  body: string
  audience: SocialAudience
  media?: SocialPostMedia
  createdAt: string
  expiresAt: string
}
export type SocialStoryReport = {
  id: string
  storyId: string
  authorId: string
  reporterId: string
  kind: SocialStoryKind
  body: string
  audience: SocialAudience
  storyCreatedAt: string
  storyExpiresAt: string
  mediaSha256?: string
  evidenceStorageKey?: string
  evidenceMimeType?: 'image/jpeg' | 'image/png' | 'video/mp4'
  evidenceSizeBytes?: number
  evidenceDeleteAt?: string
  evidenceExpiredAt?: string
  reason: 'spam' | 'harassment' | 'copyright' | 'nudity' | 'violence' | 'other'
  details: string
  status: 'open' | 'reviewed' | 'dismissed'
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
}
export const isSocialStoryReport = (value: unknown): value is SocialStoryReport => {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<SocialStoryReport>
  return typeof report.id === 'string' && /^[a-f0-9-]{36}$/i.test(report.id) &&
    typeof report.storyId === 'string' && /^[a-f0-9-]{36}$/i.test(report.storyId) &&
    typeof report.authorId === 'string' && report.authorId.length > 0 && report.authorId.length <= 80 &&
    typeof report.reporterId === 'string' && report.reporterId.length > 0 && report.reporterId.length <= 80 && report.reporterId !== report.authorId &&
    ['status', 'photo', 'video'].includes(report.kind || '') && typeof report.body === 'string' && report.body.length <= 600 &&
    ['public', 'friends', 'private'].includes(report.audience || '') &&
    typeof report.storyCreatedAt === 'string' && Number.isFinite(Date.parse(report.storyCreatedAt)) &&
    typeof report.storyExpiresAt === 'string' && Number.isFinite(Date.parse(report.storyExpiresAt)) && Date.parse(report.storyExpiresAt) - Date.parse(report.storyCreatedAt) === socialStoryLifetimeMs &&
    (report.mediaSha256 === undefined || /^[a-f0-9]{64}$/.test(report.mediaSha256)) &&
    (report.evidenceStorageKey === undefined || new RegExp(`^moderation-evidence/stories/${report.id}$`).test(report.evidenceStorageKey)) &&
    (report.evidenceMimeType === undefined || ['image/jpeg', 'image/png', 'video/mp4'].includes(report.evidenceMimeType)) &&
    (report.evidenceSizeBytes === undefined || Number.isSafeInteger(report.evidenceSizeBytes) && report.evidenceSizeBytes > 0 && report.evidenceSizeBytes <= 100 * 1024 * 1024) &&
    (report.evidenceDeleteAt === undefined || Number.isFinite(Date.parse(report.evidenceDeleteAt))) &&
    (report.evidenceExpiredAt === undefined || Number.isFinite(Date.parse(report.evidenceExpiredAt))) &&
    (!report.mediaSha256 || !!report.evidenceStorageKey || !!report.evidenceExpiredAt) && (!report.evidenceStorageKey || !!report.mediaSha256) &&
    ['spam', 'harassment', 'copyright', 'nudity', 'violence', 'other'].includes(report.reason || '') &&
    typeof report.details === 'string' && report.details.length <= 500 &&
    ['open', 'reviewed', 'dismissed'].includes(report.status || '') && typeof report.createdAt === 'string' && Number.isFinite(Date.parse(report.createdAt)) &&
    (report.reviewedAt === undefined || typeof report.reviewedAt === 'string' && Number.isFinite(Date.parse(report.reviewedAt))) &&
    (report.reviewedBy === undefined || typeof report.reviewedBy === 'string' && report.reviewedBy.length > 0)
}
export type SocialStoryCursor = { createdAt: string; id: string }

const safeOwner = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)

export const isSocialStory = (value: unknown): value is SocialStory => {
  if (!value || typeof value !== 'object') return false
  const story = value as Partial<SocialStory>
  const createdAt = Date.parse(story.createdAt || '')
  const expiresAt = Date.parse(story.expiresAt || '')
  const media = story.media
  const validMedia = media === undefined || (!!media && typeof media.storageKey === 'string' &&
    new RegExp(`^social-stories/${safeOwner(story.authorId || '')}/[a-f0-9-]{36}$`, 'i').test(media.storageKey) &&
    ['image/jpeg', 'image/png', 'video/mp4'].includes(media.mimeType || '') && Number.isSafeInteger(media.sizeBytes) &&
    (media.sizeBytes || 0) > 0 && /^[a-f0-9]{64}$/.test(media.sha256 || '') &&
    (story.kind === 'photo' ? media.mimeType === 'image/jpeg' || media.mimeType === 'image/png' : story.kind === 'video' && media.mimeType === 'video/mp4'))
  return typeof story.id === 'string' && /^[a-f0-9-]{36}$/i.test(story.id) &&
    typeof story.authorId === 'string' && story.authorId.length > 0 && story.authorId.length <= 80 &&
    ['status', 'photo', 'video'].includes(story.kind || '') && typeof story.body === 'string' && story.body.length <= 600 &&
    ['public', 'friends', 'private'].includes(story.audience || '') && validMedia &&
    (story.kind === 'status' ? !media && story.body.trim().length > 0 : Boolean(media)) &&
    Number.isFinite(createdAt) && Number.isFinite(expiresAt) && expiresAt - createdAt === socialStoryLifetimeMs
}

export const socialStoryView = (story: SocialStory, author: CreatorProfile | undefined) => ({
  id: story.id,
  author: { id: story.authorId, displayName: author?.displayName || 'BeatVault creator', avatarId: author?.avatarId, avatarUrl: author?.avatarUrl, avatarFocalPoint: author?.avatarFocalPoint },
  kind: story.kind,
  body: story.body,
  audience: story.audience === 'public' && !author?.publicProfile ? 'friends' as const : story.audience,
  media: story.media ? { url: `/api/stories/${encodeURIComponent(story.id)}/media`, mimeType: story.media.mimeType, sizeBytes: story.media.sizeBytes } : undefined,
  createdAt: story.createdAt,
  expiresAt: story.expiresAt,
})
