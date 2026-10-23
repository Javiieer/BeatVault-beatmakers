import { authClient } from '../api/client'
import { isProfileImageFocalPoint, type ProfileImageFocalPoint } from '../domains/profile'
import type { SocialAudience } from './socialPostRepository'

export type SocialStoryKind = 'status' | 'photo' | 'video'
export type SocialStoryView = {
  id: string
  author: { id: string; displayName: string; avatarId?: string; avatarUrl?: string; avatarFocalPoint?: ProfileImageFocalPoint }
  kind: SocialStoryKind
  body: string
  audience: SocialAudience
  media?: { url: string; mimeType: string; sizeBytes: number }
  createdAt: string
  expiresAt: string
}

const isStory = (value: unknown): value is SocialStoryView => {
  if (!value || typeof value !== 'object') return false
  const story = value as Record<string, unknown>
  const author = story.author as Record<string, unknown> | undefined
  const media = story.media as Record<string, unknown> | undefined
  return typeof story.id === 'string' && !!author && typeof author.id === 'string' && typeof author.displayName === 'string' &&
    (author.avatarFocalPoint === undefined || isProfileImageFocalPoint(author.avatarFocalPoint)) &&
    ['status', 'photo', 'video'].includes(story.kind as string) && typeof story.body === 'string' &&
    ['public', 'friends', 'private'].includes(story.audience as string) &&
    (!media || typeof media.url === 'string' && typeof media.mimeType === 'string' && Number.isSafeInteger(media.sizeBytes)) &&
    typeof story.createdAt === 'string' && typeof story.expiresAt === 'string' && Date.parse(story.expiresAt) > Date.parse(story.createdAt)
}
const isStoryList = (value: unknown): value is { stories: SocialStoryView[] } => !!value && typeof value === 'object' &&
  Array.isArray((value as Record<string, unknown>).stories) && ((value as { stories: unknown[] }).stories).every(isStory)
const isDeleted = (value: unknown): value is { id: string } => !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'

export const readSocialStories = () => authClient.request('/api/stories', { method: 'GET' }, isStoryList)
export const createSocialStory = (input: { kind: SocialStoryKind; body: string; audience: SocialAudience; file?: File }) => {
  if (!input.file) return authClient.request('/api/stories', { method: 'POST', body: JSON.stringify({ body: input.body, audience: input.audience }) }, isStory)
  const form = new FormData()
  form.append('file', input.file, input.file.name)
  form.append('body', input.body)
  form.append('audience', input.audience)
  return authClient.request('/api/stories', { method: 'POST', body: form, headers: { 'X-Social-Post-Kind': input.kind } }, isStory)
}
export const deleteSocialStory = (storyId: string) => authClient.request(`/api/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE', body: JSON.stringify({}) }, isDeleted)
