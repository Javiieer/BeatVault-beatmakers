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
