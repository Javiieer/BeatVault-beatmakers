import { expect, test } from '@playwright/test'

const account = { id: 'manager-1', email: 'manager@beatvault.local', role: 'community_manager', verificationState: 'verified', planId: 'free' }
const contentId = 'cc5f2834-94b6-48f9-b2a9-c2de9a844b4f'
const listing = {
  contentId, ownerId: 'creator-1', currency: 'USD', status: 'draft-only', schemaVersion: 1,
  rightsDeclarationVersion: 'rights-intake-v1', rightsDeclarationAcceptedAt: '2026-10-12T20:00:00.000Z',
  createdAt: '2026-10-12T20:00:00.000Z', updatedAt: '2026-10-12T20:00:00.000Z',
  description: 'Warm R&B production with room for lead vocals and expressive keys.', genre: 'R&B', bpm: 92,
  explicitContent: false,
  rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'original', sampleProofAvailable: false, declarationAccepted: true, collaborators: [] },
  offers: [{ id: 'non-exclusive', label: 'Non-exclusive', amountMinor: 3000, currency: 'USD', deliverables: ['mp3', 'wav'], usageSummary: 'Preliminary non-exclusive usage summary for review.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
}

test('community managers can independently approve a commercial listing from the moderation dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let lastDecision: Record<string, unknown> | undefined
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path === `/api/staff/marketplace-review/${contentId}` && method === 'POST') {
      lastDecision = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill({ json: { ok: true, data: { contentId, ...lastDecision, reviewerId: account.id, createdAt: '2026-10-12T20:10:00.000Z' }, requestId: 'community-review-test' } })
    }
    const data = path === '/api/auth/me' ? account
      : path === '/api/staff/catalog-review' ? []
      : path === '/api/staff/marketplace-review' ? [{ listing, title: 'After Hours', creatorId: 'creator-1', readyForReview: true, commercialReviewApproved: false, evidence: [], communityReviewCurrent: Boolean(lastDecision), ...(lastDecision ? { latestCommunityReview: { ...lastDecision, reviewerId: account.id, createdAt: '2026-10-12T20:10:00.000Z', current: true } } : {}) }]
        : path === '/api/catalog' ? { entries: [], total: 0 }
          : path === '/api/account/storage' ? { usedBytes: 0, limitBytes: null, availableBytes: null, quotaSource: 'none', planId: 'free' }
            : path === '/api/profile' ? { accountId: account.id, displayName: 'Manager', bio: '', genres: [], avatarId: 'initials', coverId: 'lo-fi', publicProfile: false }
              : path === '/api/friends' ? { friends: [], incoming: [], outgoing: [] }
                : path === '/api/chat/conversations' || path === '/api/notifications/social' ? []
                  : null
    if (path === '/api/chat/events') return route.abort()
    return route.fulfill({ json: { ok: true, data, requestId: 'community-review-test' } })
  })

  await page.goto('/#/community-review')
  await expect(page.getByRole('heading', { name: 'Moderation center' })).toBeVisible()
  await expect(page.getByText(/Community Managers can approve a commercial review independently/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'After Hours' })).toBeVisible()
  await expect(page.getByText('No Beat uploads are waiting for your review.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve commercial review' })).toBeDisabled()
  await expect(page.getByRole('navigation', { name: 'Moderation dashboard sections' }).getByRole('button', { name: 'Payments' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/visual-qa/community-manager-dashboard-mobile.png' })
  await page.locator('.review-card').screenshot({ path: 'artifacts/visual-qa/community-manager-commercial-review-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'artifacts/visual-qa/community-manager-dashboard-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('Review note').fill('Shares are complete; evidence was checked for this review.')
  await page.getByRole('button', { name: 'Approve commercial review' }).click()
  await expect(page.getByText(/Community Manager: Approved commercial review/i)).toBeVisible()
  expect(lastDecision).toEqual({ decision: 'approve', note: 'Shares are complete; evidence was checked for this review.' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
