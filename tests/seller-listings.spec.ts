import { expect, test } from '@playwright/test'

const account = { id: 'a36df73e-fbe5-42f7-bebe-cb9ac09cf07f', email: 'artist@beatvault.local', role: 'creator', verificationState: 'verified', planId: 'free' }
const beatId = 'cc5f2834-94b6-48f9-b2a9-c2de9a844b4f'
const beat = { contentId: beatId, type: 'beat', title: 'After Hours', creatorId: account.id, creatorName: 'Nova', tagIds: ['R&B'], previewIds: [], publicationStatus: 'published', assetId: 'asset-audio-1', coverId: 'lo-fi', audio: { originalName: 'after-hours.wav', mimeType: 'audio/wav', sizeBytes: 1024, state: 'available', previewReady: true } }

test('creators can save private, non-purchasable beat offer drafts on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let savedListing: Record<string, unknown> | undefined
  let submitted: Record<string, unknown> | undefined
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const data = path === '/api/auth/me' ? account
      : path === '/api/catalog' ? { entries: [beat], total: 1 }
        : path === '/api/account/storage' ? { usedBytes: 1024, limitBytes: null, availableBytes: null, quotaSource: 'none', planId: 'free' }
          : path === '/api/seller/beat-listings' ? (method === 'PUT' ? null : savedListing ? [savedListing] : [])
            : path === '/api/profile' ? { accountId: account.id, displayName: 'Nova', bio: '', genres: [], avatarId: 'initials', coverId: 'lo-fi', publicProfile: true }
              : path === '/api/friends' ? { friends: [], incoming: [], outgoing: [] }
                : path === '/api/chat/conversations' || path === '/api/notifications/social' ? []
                  : null
    if (path === '/api/chat/events') return route.abort()
    if (path === `/api/seller/beat-listings/${beatId}` && method === 'PUT') {
      submitted = route.request().postDataJSON() as Record<string, unknown>
      savedListing = { ...submitted, contentId: beatId, ownerId: account.id, currency: 'USD', status: 'draft-only', schemaVersion: 1, rightsDeclarationVersion: 'rights-intake-v1', rightsDeclarationAcceptedAt: '2026-10-12T20:00:00.000Z', createdAt: '2026-10-12T20:00:00.000Z', updatedAt: '2026-10-12T20:00:00.000Z', communityReview: { decision: 'recommend', note: 'Rights and offer details are complete.', reviewerId: 'cm-1', createdAt: '2026-10-12T20:01:00.000Z', current: true } }
      return route.fulfill({ status: 201, json: { ok: true, data: savedListing, requestId: 'seller-listing-test' } })
    }
    return route.fulfill({ json: { ok: true, data, requestId: 'seller-listing-test' } })
  })

  await page.goto('/#/studio')
  await expect(page.getByRole('heading', { name: 'Mis subidas' })).toBeVisible()
  await page.getByRole('button', { name: 'Prepare offer After Hours' }).click()
  const dialog = page.getByRole('dialog', { name: 'Prepare a beat offer' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Not for sale.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/visual-qa/beat-sale-form-mobile.png' })
  await dialog.getByLabel('Description for artists').fill('A warm R&B beat with expressive keys, deep drums, and room for a lead vocal.')
  await dialog.getByLabel(/I confirm the ownership/).check()
  await dialog.getByRole('button', { name: 'Save private draft' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Private offer · USD draft')).toBeVisible()
  await expect(page.getByText(/Community Manager recommended this listing for final review/)).toBeVisible()
  await page.screenshot({ path: 'artifacts/visual-qa/seller-review-status-mobile.png' })
  expect(submitted).toMatchObject({ genre: 'R&B', rights: { declarationAccepted: true, sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000 }, offers: [{ amountMinor: 3000, currency: 'USD', status: 'draft-only' }] })
  expect(savedListing).toMatchObject({ ownerId: account.id, status: 'draft-only', rightsDeclarationVersion: 'rights-intake-v1' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
