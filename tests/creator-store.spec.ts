import { expect, test } from '@playwright/test';

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: public creator store shows only public offers`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    let profileRequests = 0;
    page.on('request', request => {
      if (request.url().includes('/api/profiles/')) profileRequests += 1;
    });
    await page.route('**/api/auth/me', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } }),
    }));
    await page.route('**/api/marketplace?*', async route => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('creatorId')).toBe('private-seller');
      await route.fulfill({
        json: {
          ok: true,
          data: {
            entries: [{
              contentId: 'approved-beat',
              type: 'beat',
              title: 'Approved public beat',
              creatorId: 'private-seller',
              creatorName: 'BeatVault creator',
              tagIds: ['trap'],
              previewIds: [],
              publicationStatus: 'published',
              previewUrl: '/api/catalog/approved-beat/preview',
              purchaseOffers: [{ id: 'basic', label: 'Basic license', amountMinor: 2500, currency: 'USD', deliverables: ['wav'] }],
            }],
            total: 1,
          },
        },
      });
    });

    await page.goto('/#/store?id=private-seller', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'BeatVault creator', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approved public beat' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Basic license ·/ })).toBeVisible();
    await expect(page.locator('.market-creator')).toContainText('BeatVault creator');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(profileRequests).toBe(0);
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-creator-store.png`, fullPage: true });
    await page.locator('.market-play').click();
    await expect(page.locator('.player audio')).toHaveAttribute('src', '/api/catalog/approved-beat/preview');
    await page.getByRole('button', { name: /Basic license ·/ }).click();
    await expect(page.getByRole('alert')).toHaveText('Sign in to purchase this beat.');
    await page.route('**/api/catalog/approved-beat', route => route.fulfill({ json: { ok: true, data: { contentId: 'approved-beat', type: 'beat', title: 'Approved public beat', creatorId: 'private-seller', creatorName: 'BeatVault creator', tagIds: ['trap'], previewIds: [], publicationStatus: 'published', previewUrl: '/api/catalog/approved-beat/preview' } } }));
    await page.getByRole('link', { name: 'Approved public beat', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Approved public beat', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play preview of Approved public beat' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toHaveAttribute('href', /^#\/login\?returnTo=/);
    await page.getByRole('link', { name: 'Sign in', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });
}
