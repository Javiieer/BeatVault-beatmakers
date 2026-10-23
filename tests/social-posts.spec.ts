import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: authenticated Home posts sync to CreatorProfile through the API contract`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'Create a local account' }).click();
    await page.getByLabel('Email', { exact: true }).fill(`social-${randomUUID()}@test.local`);
    await page.getByLabel('Password', { exact: true }).fill('Temporary-social-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Productor', exact: true })).toBeVisible({ timeout: 15000 });
    const user = (await (await page.request.get('/api/auth/me')).json()).data;
    const posts: Array<Record<string, unknown>> = [];
    await page.route('**/api/feed?*', async route => route.fulfill({ json: { ok: true, data: { posts, nextCursor: undefined } } }));
    await page.route(`**/api/profiles/${user.id}/posts?*`, async route => route.fulfill({ json: { ok: true, data: { posts } } }));
    const interactions = new Map<string, { comments: Array<{ id: string; authorId: string; authorName: string; body: string; createdAt: string }>; reactionCount: number; reactedByMe: boolean }>();
    await page.route(/\/api\/posts\/[a-f0-9-]+\/social$/, async route => {
      const postId = new URL(route.request().url()).pathname.split('/').at(-2)!;
      await route.fulfill({ json: { ok: true, data: interactions.get(postId) || { comments: [], reactionCount: 0, reactedByMe: false } } });
    });
    await page.route('**/api/posts/interactions?*', async route => {
      const postIds = new URL(route.request().url()).searchParams.getAll('id');
      const items = Object.fromEntries(postIds.map(postId => [postId, interactions.get(postId) || { comments: [], reactionCount: 0, reactedByMe: false }]));
      await route.fulfill({ json: { ok: true, data: { items } } });
    });
    await page.route(/\/api\/posts\/[a-f0-9-]+\/comments$/, async route => {
      const postId = new URL(route.request().url()).pathname.split('/').at(-2)!;
      const current = interactions.get(postId) || { comments: [], reactionCount: 0, reactedByMe: false };
      const input = route.request().postDataJSON();
      const comment = { id: randomUUID(), authorId: user.id, authorName: 'Test Creator', body: input.body, createdAt: new Date().toISOString() };
      const next = { ...current, comments: [...current.comments, comment] };
      interactions.set(postId, next);
      await route.fulfill({ json: { ok: true, data: next } });
    });
    await page.route(/\/api\/posts\/[a-f0-9-]+\/reaction$/, async route => {
      const postId = new URL(route.request().url()).pathname.split('/').at(-2)!;
      const current = interactions.get(postId) || { comments: [], reactionCount: 0, reactedByMe: false };
      const reactedByMe = !current.reactedByMe;
      const next = { ...current, reactedByMe, reactionCount: Math.max(0, current.reactionCount + (reactedByMe ? 1 : -1)) };
      interactions.set(postId, next);
      await route.fulfill({ json: { ok: true, data: { reacted: next.reactedByMe, reactionCount: next.reactionCount } } });
    });
    await page.route('**/api/posts', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const input = route.request().postDataJSON();
      const post = { id: randomUUID(), author: { id: user.id, displayName: 'Test Creator' }, kind: 'status', body: input.body, audience: input.audience, visibility: 'published', createdAt: new Date().toISOString() };
      posts.unshift(post);
      await route.fulfill({ status: 201, json: { ok: true, data: post } });
    });
    await page.route(/\/api\/posts\/[a-f0-9-]{36}$/, async route => {
      if (route.request().method() !== 'DELETE') return route.continue();
      const id = route.request().url().split('/').pop();
      const index = posts.findIndex(post => post.id === id);
      if (index >= 0) posts.splice(index, 1);
      await route.fulfill({ json: { ok: true, data: { id } } });
    });

    await page.goto('/#/home');
    await page.getByLabel('¿Qué estás creando hoy?').fill('Post sincronizado entre secciones');
    const publishResponse = page.waitForResponse(response => response.url().endsWith('/api/posts') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await publishResponse;
    await expect(page.getByText('Post sincronizado entre secciones')).toBeVisible();
    await expect(page.locator('.home-post').filter({ hasText: 'Post sincronizado entre secciones' })).toContainText('Solo yo');
    const postCard = page.locator('.home-post').filter({ hasText: 'Post sincronizado entre secciones' });
    await postCard.getByRole('button', { name: 'Me gusta' }).click();
    await expect(postCard.getByRole('button', { name: 'Quitar me gusta' })).toHaveAttribute('aria-pressed', 'true');
    await postCard.getByPlaceholder('Escribe un comentario...').fill('Comentario con sincronía real');
    await postCard.getByRole('button', { name: 'Publicar comentario' }).click();
    await expect(postCard).toContainText('Comentario con sincronía real');
    await page.reload();
    await expect(page.locator('.home-post').filter({ hasText: 'Post sincronizado entre secciones' })).toContainText('Solo yo');
    const refreshedCard = page.locator('.home-post').filter({ hasText: 'Post sincronizado entre secciones' });
    await expect(refreshedCard).toContainText('Comentario con sincronía real');
    await expect(refreshedCard.getByRole('button', { name: 'Quitar me gusta' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/#/profile');
    await page.getByRole('tab', { name: 'Publicaciones' }).click();
    const profilePost = page.locator('.producer-post').filter({ hasText: 'Post sincronizado entre secciones' });
    await expect(profilePost).toContainText('Post sincronizado entre secciones');
    await expect(profilePost).toContainText('Comentario con sincronía real');
    await expect(profilePost.getByRole('button', { name: /Me gusta · 1/ })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-social-profile-posts.png`, fullPage: true });

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Aun no tienes publicaciones')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
