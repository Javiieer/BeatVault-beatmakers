import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isSocialStory, socialStoryLifetimeMs, socialStoryMaxActivePerAccount, type SocialStory } from './social-stories'

const makeStory = (overrides: Partial<SocialStory> = {}): SocialStory => {
  const createdAt = '2026-10-18T12:00:00.000Z'
  return {
    id: randomUUID(), authorId: 'creator-1', kind: 'status', body: 'Studio update', audience: 'private', createdAt,
    expiresAt: new Date(Date.parse(createdAt) + socialStoryLifetimeMs).toISOString(),
    ...overrides,
  }
}

describe('social stories', () => {
  it('accepts bounded text, media, audience and exact server expiry records', () => {
    expect(isSocialStory(makeStory())).toBe(true)
    const photo = makeStory({
      id: randomUUID(), kind: 'photo', body: 'New texture',
      media: { storageKey: `social-stories/creator-1/${randomUUID()}`, mimeType: 'image/jpeg', sizeBytes: 100, sha256: 'a'.repeat(64) },
    })
    expect(isSocialStory(photo)).toBe(true)
    expect(socialStoryMaxActivePerAccount).toBe(20)
  })

  it('rejects media path traversal, kind mismatches and modified expiration', () => {
    const photo = makeStory({
      kind: 'photo', body: '',
      media: { storageKey: `social-stories/other-owner/${randomUUID()}`, mimeType: 'image/jpeg', sizeBytes: 100, sha256: 'b'.repeat(64) },
    })
    expect(isSocialStory(photo)).toBe(false)
    expect(isSocialStory(makeStory({ kind: 'video' }))).toBe(false)
    expect(isSocialStory(makeStory({ expiresAt: '2026-10-20T12:00:00.000Z' }))).toBe(false)
    expect(isSocialStory(makeStory({ body: '   ' }))).toBe(false)
  })
})
