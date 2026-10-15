import { expect, test } from '@playwright/test';

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: public creator store shows only public offers`, async ({ page }) => {
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
              purchaseOffers: [{ id: 'basic', label: 'Basic license', amountMinor: 2500, currency: 'USD', deliverables: ['wav'] }],
            }],
            total: 1,
          },
        },
      });
    });

    await page.goto('/#/store?id=private-seller');
    await expect(page.getByRole('heading', { name: 'BeatVault creator', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approved public beat' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Basic license ·/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /BeatVault creator/ })).toHaveAttribute('href', '#/store?id=private-seller');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(profileRequests).toBe(0);
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-creator-store.png`, fullPage: true });
  });
}
