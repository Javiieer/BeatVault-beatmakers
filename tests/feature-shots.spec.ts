import { expect, test } from '@playwright/test'

const account = { id: 'preview-creator', email: 'creator@beatvault.local', role: 'creator', verificationState: 'unverified' }
const profile = { accountId: account.id, displayName: 'Milo North', bio: 'Beats, 808s y sesiones abiertas.', location: '', website: '', instagram: '', genres: ['Trap', 'Drill'], coverId: 'lo-fi', avatarId: 'initials', publicProfile: true }
const contentId = '11111111-1111-4111-8111-111111111111'
const catalogEntry = { contentId, type: 'beat', title: 'Night Drive 808', creatorId: 'producer-nightdrive', creatorName: 'Juno.wav', tagIds: ['Melodic', '808'], previewIds: [], publicationStatus: 'published', coverId: '808' }
const socialActivity = [
  { id: 'event-comment', type: 'comment', contentId, contentTitle: 'Night Drive 808', actorId: 'ari-sol', actorName: 'Ari Sol', body: 'Ese bajo quedó increíble.', createdAt: '2026-10-11T14:25:00.000Z' },
  { id: 'event-reaction', type: 'reaction', contentId, contentTitle: 'Night Drive 808', actorId: 'kade-seven', actorName: 'Kade Seven', createdAt: '2026-10-11T14:18:00.000Z' },
]

async function mockApp(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path === '/api/chat/events') return route.abort()
    let data: unknown = null
    if (path === '/api/auth/me') data = account
    else if (path === '/api/profile') data = profile
    else if (path === '/api/catalog') data = { entries: [catalogEntry], total: 1 }
    else if (path === `/api/catalog/${contentId}/social`) data = { comments: [{ id: 'comment-preview', contentId, authorId: 'ari-sol', authorName: 'Ari Sol', body: 'Ese bajo quedó increíble.', createdAt: '2026-10-11T14:25:00.000Z' }], reactionCount: 28, reactedByMe: true }
    else if (path === '/api/notifications/social') data = socialActivity
    else if (path === '/api/friends') data = { friends: [], incoming: [{ id: 'request-preview', requesterId: 'kade-seven', recipientId: account.id, status: 'pending', createdAt: '2026-10-11T14:20:00.000Z', updatedAt: '2026-10-11T14:20:00.000Z', profile: { accountId: 'kade-seven', displayName: 'Kade Seven', bio: '', genres: [], avatarId: 'initials', coverId: 'lo-fi' } }], outgoing: [] }
    else if (path === '/api/chat/conversations') data = [{ peerId: 'ari-sol', lastMessage: { id: 'message-preview', senderId: 'ari-sol', recipientId: account.id, body: '¿Colaboramos en este beat?', createdAt: '2026-10-11T14:28:00.000Z' }, unreadCount: 1, profile: { accountId: 'ari-sol', displayName: 'Ari Sol', bio: '', genres: [], avatarId: 'initials', coverId: 'lo-fi' } }]
    else if (path === '/api/projects') data = []
    if (path === `/api/catalog/${contentId}/social/reaction` && method === 'POST') data = { reacted: false, reactionCount: 27 }
    return route.fulfill({ json: { ok: true, data, requestId: 'feature-preview' } })
  })
}

test('capture mobile social notification panel', async ({ page }) => {
  await mockApp(page)
  await page.goto('/#/home')
  await expect(page.locator('.home-stories')).toBeVisible()
  await page.locator('.notification-trigger').click()
  await expect(page.locator('.notification-panel')).toBeVisible()
  await expect(page.getByText('Ese bajo quedó increíble.', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'artifacts/user-preview/beatvault-01-notificaciones-movil.png' })
})

test('capture mobile feed with published beat and social activity', async ({ page }) => {
  await mockApp(page)
  await page.goto('/#/home')
  const post = page.locator(`#feed-post-own-${contentId}`)
  await expect(post).toBeVisible()
  await expect(post.getByText('Ese bajo quedó increíble.')).toBeVisible()
  await post.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'artifacts/user-preview/beatvault-02-feed-social-movil.png' })
})

test('capture mobile theme preferences inside profile settings', async ({ page }) => {
  await mockApp(page)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await expect(page.getByLabel('Tema visual')).toBeVisible()
  await page.getByLabel('Tema visual').selectOption('custom')
  await expect(page.getByLabel('Color fondo')).toBeVisible()
  await expect(page.getByLabel('Color tarjetas')).toBeVisible()
  await expect(page.getByLabel('Color botones')).toBeVisible()
  await expect(page.getByLabel('Color enlaces')).toBeVisible()
  await page.screenshot({ path: 'artifacts/user-preview/beatvault-03-preferencias-movil.png' })
})
