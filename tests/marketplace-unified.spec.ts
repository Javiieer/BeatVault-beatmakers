import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { e2eAdmin } from '../scripts/e2e-admin';

function wav() {
  const samples = 8000;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) bytes.writeInt16LE(Math.round(Math.sin(index / 10) * 1200), 44 + index * 2);
  return bytes;
}
async function csrf(api: APIRequestContext) {
  return (await api.storageState()).cookies.find(cookie => cookie.name === 'beatvault_csrf')!.value;
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: unified marketplace preserves discovery, saved audio, details and private management`, async ({ page, playwright, browser }) => {
    test.setTimeout(90000);
    const seller = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5187' });
    const admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5187' });
    const email = `market-unified-${randomUUID()}@beatvault.test`;
    const password = `Local-market-${randomUUID()}`;
    const title = `Unified Beat ${randomUUID().slice(0, 8)}`;
    try {
      expect((await seller.post('/api/auth/register', { data: { email, password } })).status()).toBe(201);
      expect((await seller.post('/api/auth/login', { data: { email, password } })).status()).toBe(200);
      const sellerCsrf = await csrf(seller);
      const uploaded = await seller.post('/api/assets/upload', { headers: { 'x-csrf-token': sellerCsrf }, multipart: { file: { name: 'unified.wav', mimeType: 'audio/wav', buffer: wav() } } });
      expect(uploaded.status(), await uploaded.text()).toBe(201);
      const audio = (await uploaded.json()).data;
      expect(audio.previewStorageKey).toBeTruthy();
      const created = await seller.post('/api/catalog', { headers: { 'x-csrf-token': sellerCsrf }, data: { title, type: 'beat', tagIds: ['unified'], assetId: audio.id, coverId: 'lo-fi', publicationStatus: 'pending-review' } });
      expect(created.status()).toBe(201);
      const contentId = (await created.json()).data.contentId;
      const privateBefore = await page.request.get(`/api/catalog/${contentId}`);
      expect(privateBefore.status()).toBe(404);
      expect((await admin.post('/api/auth/login', { data: e2eAdmin })).status()).toBe(200);
      const reviewed = await admin.post(`/api/admin/catalog-review/${contentId}`, { headers: { 'x-csrf-token': await csrf(admin) }, data: { decision: 'approve' } });
      expect(reviewed.status(), await reviewed.text()).toBe(200);
      await page.context().addCookies((await seller.storageState()).cookies);
      await page.setViewportSize(viewport);
      await page.goto('/#/marketplace');
      const primary = page.getByRole('navigation', { name: 'Primary navigation' });
      await expect(primary.getByRole('link', { name: 'Marketplace', exact: true })).toHaveCount(1);
      await expect(primary.getByRole('link', { name: 'Library', exact: true })).toHaveCount(0);
      await expect(primary.getByRole('link', { name: 'Beats', exact: true })).toHaveCount(0);
      const tabPositions = await page.locator('.market-tabs button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
      expect(Math.max(...tabPositions) - Math.min(...tabPositions)).toBeLessThan(2);
      await page.locator('#market-search').fill(title);
      const card = page.locator('.market-card').filter({ hasText: title });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: `Save ${title} to my library` }).click();
      await expect(card.getByRole('button', { name: `Remove ${title} from my library` })).toHaveAttribute('aria-pressed', 'true');
      await card.getByRole('link', { name: title, exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: `Play preview of ${title}` }).click();
      await expect(page.locator('.player audio')).toHaveAttribute('src', new RegExp(`/api/catalog/${contentId}/preview$`));
      await page.goto('/#/library');
      await expect(page).toHaveURL(/#\/marketplace\?tab=library/);
      await expect(page.getByRole('navigation', { name: 'Marketplace sections' }).getByRole('button', { name: 'My library', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('region', { name: 'Saved public audio' }).getByRole('link', { name: title, exact: true })).toBeVisible({ timeout: 20000 });
      await page.reload();
      await expect(page.getByRole('region', { name: 'Saved public audio' }).getByRole('link', { name: title, exact: true })).toBeVisible({ timeout: 20000 });
      const clean = await browser.newContext({ baseURL: 'http://127.0.0.1:5187' });
      try {
        const fresh = await clean.newPage();
        await fresh.goto(`/#/beat-detail?id=${contentId}`);
        await fresh.getByRole('link', { name: 'Sign in', exact: true }).first().click();
        await fresh.getByLabel('Email', { exact: true }).fill(email);
        await fresh.getByLabel('Password', { exact: true }).fill(password);
        await fresh.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(fresh).toHaveURL(new RegExp(`#/beat-detail\\?id=${contentId}$`));
        await expect(fresh.getByRole('heading', { name: title, exact: true })).toBeVisible();
        await fresh.goto('/#/marketplace?tab=library');
        await expect(fresh.getByRole('region', { name: 'Saved public audio' }).getByRole('link', { name: title, exact: true })).toBeVisible();
      } finally { await clean.close(); }
      await page.getByRole('navigation', { name: 'Marketplace sections' }).getByRole('button', { name: 'My purchases', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'No purchases yet' })).toBeVisible();
      await page.goto('/#/beats');
      await expect(page).toHaveURL(/#\/marketplace\?tab=explore&type=beat/);
      await expect(page.getByRole('group', { name: 'Audio type' }).getByRole('button', { name: /^beats$/i })).toHaveAttribute('aria-pressed', 'true');
      const filteredPage = page.waitForResponse(response => new URL(response.url()).pathname === '/api/marketplace' && new URL(response.url()).searchParams.get('q') === title);
      await page.locator('#market-search').fill(title);
      await filteredPage;
      await expect(page.getByText('Loading marketplace...', { exact: true })).toHaveCount(0);
      await expect(card).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/marketplace-unified/${viewport.name}.png`, fullPage: true });
      await page.goto(`/#/studio?search=${encodeURIComponent(title)}`);
      await expect(page.locator('.creator-upload-card').filter({ hasText: title })).toBeVisible({ timeout: 20000 });
      await page.locator('.creator-upload-card').filter({ hasText: title }).getByRole('button', { name: `Editar ${title}` }).click();
      await expect(page.getByRole('button', { name: 'Eliminar publicación', exact: true })).toBeVisible();
    } finally { await seller.dispose(); await admin.dispose(); }
  });
}
