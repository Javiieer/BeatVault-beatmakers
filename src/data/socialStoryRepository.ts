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
export type SocialStoryReportReason = 'spam' | 'harassment' | 'copyright' | 'nudity' | 'violence' | 'other'
export type SocialStoryReportView = { id: string; storyId: string; authorId: string; reporterId: string; kind: SocialStoryKind; body: string; audience: SocialAudience; storyCreatedAt: string; storyExpiresAt: string; mediaSha256?: string; evidenceUrl?: string; evidenceAvailable?: boolean; evidenceExpiredAt?: string; reason: SocialStoryReportReason; details: string; status: 'open' | 'reviewed' | 'dismissed'; createdAt: string; reviewedAt?: string; reviewedBy?: string }
export type SocialStoryReportList = { reports: SocialStoryReportView[]; nextCursor: string | null }

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
const isReported = (value: unknown): value is { id: string; status: 'open' } => !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string' && (value as Record<string, unknown>).status === 'open'
const isReport = (value: unknown): value is SocialStoryReportView => {
  if (!value || typeof value !== 'object') return false
  const report = value as Record<string, unknown>
  return typeof report.id === 'string' && typeof report.storyId === 'string' && typeof report.authorId === 'string' && typeof report.reporterId === 'string' && report.authorId !== report.reporterId &&
    ['status', 'photo', 'video'].includes(report.kind as string) && typeof report.body === 'string' && ['public', 'friends', 'private'].includes(report.audience as string) &&
    typeof report.storyCreatedAt === 'string' && typeof report.storyExpiresAt === 'string' && ['spam', 'harassment', 'copyright', 'nudity', 'violence', 'other'].includes(report.reason as string) &&
    typeof report.details === 'string' && ['open', 'reviewed', 'dismissed'].includes(report.status as string) && typeof report.createdAt === 'string' &&
    (report.evidenceUrl === undefined || typeof report.evidenceUrl === 'string') && (report.evidenceAvailable === undefined || typeof report.evidenceAvailable === 'boolean') && (report.evidenceExpiredAt === undefined || typeof report.evidenceExpiredAt === 'string')
}
const isReportList = (value: unknown): value is SocialStoryReportList => !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).reports) && ((value as { reports: unknown[] }).reports).every(isReport) && ((value as Record<string, unknown>).nextCursor === null || typeof (value as Record<string, unknown>).nextCursor === 'string')

export const readSocialStories = () => authClient.request('/api/stories', { method: 'GET' }, isStoryList)
export const createSocialStory = (input: { kind: SocialStoryKind; body: string; audience: SocialAudience; file?: File }) => {
  if (!input.file) return authClient.request('/api/stories', { method: 'POST', body: JSON.stringify({ body: input.body, audience: input.audience }) }, isStory)
  const form = new FormData()
  form.append('file', input.file, input.file.name)
  form.append('body', input.body)
  form.append('audience', input.audience)
  return authClient.request('/api/stories', { method: 'POST', body: form, headers: { 'X-Social-Post-Kind': input.kind } }, isStory, 120000)
}
export const deleteSocialStory = (storyId: string) => authClient.request(`/api/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE', body: JSON.stringify({}) }, isDeleted)
export const reportSocialStory = (storyId: string, reason: SocialStoryReportReason, details: string) => authClient.request(`/api/stories/${encodeURIComponent(storyId)}/reports`, { method: 'POST', body: JSON.stringify({ reason, details }) }, isReported)
export const readSocialStoryReports = (cursor?: string) => authClient.request(`/api/social-moderation/story-reports${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { method: 'GET' }, isReportList)
export const reviewSocialStoryReport = (reportId: string, status: 'reviewed' | 'dismissed') => authClient.request(`/api/social-moderation/story-reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }, isReport)
export const readBlockedAccountIds = () => authClient.request('/api/blocks', { method: 'GET' }, (value): value is { blockedAccountIds: string[] } => !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).blockedAccountIds) && (value as { blockedAccountIds: unknown[] }).blockedAccountIds.every(item => typeof item === 'string'))
export const setAccountBlocked = (accountId: string, blocked: boolean) => authClient.request(blocked ? '/api/blocks' : `/api/blocks/${encodeURIComponent(accountId)}`, { method: blocked ? 'POST' : 'DELETE', body: JSON.stringify(blocked ? { targetId: accountId } : {}) }, (value): value is { blocked: boolean; accountId: string } => !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).blocked === 'boolean' && typeof (value as Record<string, unknown>).accountId === 'string')
