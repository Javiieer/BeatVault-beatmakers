import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: edit persistent profile, inspect projects and share without private data`, async ({ page, browser }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const email = `profile-${randomUUID()}@test.local`;
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'Create a local account' }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Temporary-profile-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Productor', exact: true })).toBeVisible({ timeout: 15000 });
    const me = (await (await page.request.get('/api/auth/me')).json()).data;
    const approvedBeat = { contentId: randomUUID(), type: 'beat', title: 'Approved sale beat', creatorId: me.id, tagIds: ['trap'], previewIds: [], publicationStatus: 'published', purchaseOffers: [{ id: 'basic', label: 'Basic license', amountMinor: 2500, currency: 'USD', deliverables: ['wav'] }] };
    await page.route('**/api/marketplace?*', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('creatorId') !== me.id) return route.continue();
      await route.fulfill({ json: { ok: true, data: { entries: [approvedBeat], total: 1 } } });
    });
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'beatvault_csrf')!.value;
    for (const [title, type, coverId] of [['Night drive', 'Beat', 'lo-fi'], ['Drum one', 'One-shot', '808']]) {
      const response = await page.request.post('/api/catalog', { headers: { 'x-csrf-token': csrf }, data: { title, type, coverId, publicationStatus: 'draft', tagIds: ['trap', 'midnight'] } });
      expect(response.status()).toBe(201);
    }
    await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
    const profileJpeg = await readFile(resolve(process.cwd(), 'server/fixtures/beat-upload-cover-qa.jpg'));
    await page.getByLabel('Subir foto de perfil').setInputFiles({ name: 'avatar.jpg', mimeType: 'image/jpeg', buffer: profileJpeg });
    await expect(page.getByLabel('Encuadre horizontal del avatar')).toBeVisible();
    await page.getByLabel('Encuadre horizontal del avatar').evaluate(element => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, '24');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Guardar foto', exact: true }).click();
    await expect(page.locator('.producer-settings-preview .producer-avatar img')).toHaveAttribute('src', new RegExp(`/api/profiles/${me.id}/images/avatar/thumbnail`));
    await expect.poll(async () => (await (await page.request.get('/api/profile')).json()).data.avatarFocalPoint).toEqual({ x: 24, y: 50 });
    await page.getByLabel('Subir portada personalizada').setInputFiles({ name: 'profile-cover.jpg', mimeType: 'image/jpeg', buffer: profileJpeg });
    await expect(page.getByLabel('Encuadre vertical de la portada')).toBeVisible();
    await page.getByLabel('Encuadre vertical de la portada').evaluate(element => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, '36');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.profile-crop-desktop img')).toBeVisible();
    await expect(page.locator('.profile-crop-mobile img')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar portada', exact: true }).click();
    await expect(page.locator('.producer-preview-cover')).toHaveAttribute('src', new RegExp(`/api/profiles/${me.id}/images/cover/thumbnail`));
    await expect.poll(async () => (await (await page.request.get('/api/profile')).json()).data.coverFocalPoint).toEqual({ x: 50, y: 36 });
    await page.getByLabel('Nombre artistico').fill('Northside Audio');
    await page.getByLabel('Biografia').fill('Beats nocturnos. Texturas analogicas y percusion original.');
    await page.getByLabel('Ubicacion').fill('Ciudad de Mexico');
    await page.getByLabel('Generos', { exact: true }).fill('Trap, R&B, Lo-fi');
    await page.getByLabel('Sitio web', { exact: true }).fill('https://example.com');
    await page.getByLabel('Instagram', { exact: true }).fill('@northside.audio');
    await page.getByRole('checkbox', { name: 'Perfil publico' }).check();
    await page.route('**/api/profile', async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'FAILED', message: 'No se guardaron los cambios.' } }) });
    });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert')).toContainText('No se guardaron');
    await expect(page.getByLabel('Nombre artistico')).toHaveValue('Northside Audio');
    await page.unroute('**/api/profile');
    await expect.poll(() => page.locator('.producer-settings img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.locator('.producer-settings img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode())));
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-profile-editor.png`, fullPage: true });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await page.goto('/#/profile');
    await expect(page).toHaveURL(/#\/profile$/);
    await expect(page.locator('.producer-avatar img')).toHaveAttribute('src', new RegExp(`/api/profiles/${me.id}/images/avatar/thumbnail`));
    await expect(page.locator('.producer-banner img')).toHaveAttribute('src', new RegExp(`/api/profiles/${me.id}/images/cover/thumbnail`));
    await expect(page.locator('.producer-avatar img')).toHaveCSS('object-position', '24% 50%');
    await expect(page.locator('.producer-banner img')).toHaveCSS('object-position', '50% 36%');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Northside Audio', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Proyectos' }).click();
    await expect(page.locator('.producer-project')).toHaveCount(2);
    await expect.poll(() => page.locator('.producer-profile img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.locator('.producer-profile img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode())));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-creator-profile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Vista lista' }).click();
    await expect(page.locator('.producer-projects')).toHaveClass(/list/);
    await page.getByRole('button', { name: 'Ver proyecto Night drive' }).click();
    await expect(page.getByRole('dialog')).toContainText('Night drive');
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await page.getByRole('tab', { name: 'Acerca de' }).click();
    await expect(page.getByRole('link', { name: '@northside.audio' })).toHaveAttribute('href', 'https://www.instagram.com/northside.audio/');
    await page.getByRole('tab', { name: 'Proyectos', exact: true }).click();
    await page.getByRole('button', { name: 'Vista publica' }).click();
    await expect(page.locator('.producer-project')).toHaveCount(0);
    await page.getByRole('tab', { name: 'En venta' }).click();
    await expect(page.getByRole('heading', { name: 'Approved sale beat' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Basic license ·/ })).toContainText('25.00');
    await expect(page.getByRole('button', { name: /Vista publica/ })).toHaveCount(0);
    const visitor = await browser.newContext({ viewport });
    const guest = await visitor.newPage();
    await guest.route('**/api/marketplace?*', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('creatorId') !== me.id) return route.continue();
      await route.fulfill({ json: { ok: true, data: { entries: [approvedBeat], total: 1 } } });
    });
    await guest.route(`**/api/profiles/${me.id}`, async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.packageBadges = ['creator', 'studio'];
      await route.fulfill({ response, body: JSON.stringify(body) });
    });
    await guest.goto(`http://127.0.0.1:5187/#/profile?id=${me.id}`);
    await expect(guest.getByRole('heading', { name: 'Northside Audio', exact: true })).toBeVisible();
    await expect(guest.locator('.producer-avatar img')).toHaveAttribute('src', new RegExp(`/api/profiles/${me.id}/images/avatar/thumbnail`));
    await expect(guest.locator('.producer-banner img')).toHaveAttribute('src', new RegExp(`/api/profiles/${me.id}/images/cover/thumbnail`));
    await expect(guest.getByLabel('Paquetes adquiridos')).toContainText('Creator');
    await expect(guest.getByLabel('Paquetes adquiridos')).toContainText('Studio');
    await guest.getByRole('tab', { name: 'En venta' }).click();
    await expect(guest.getByRole('heading', { name: 'Approved sale beat' })).toBeVisible();
    await expect(guest.getByRole('button', { name: /Basic license ·/ })).toBeVisible();
    await guest.screenshot({ path: `artifacts/visual-qa/${viewport.name}-package-badges.png`, fullPage: true });
    await guest.unroute(`**/api/profiles/${me.id}`);
    await expect(guest.getByText(email, { exact: true })).toHaveCount(0);
    await expect(guest.getByRole('link', { name: 'Editar perfil', exact: true })).toHaveCount(0);
    await expect(guest.locator('.producer-project')).toHaveCount(0);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Avatar 808', exact: true }).click();
    await page.getByRole('button', { name: 'Portada Orchestra', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Avatar 808', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Portada Orchestra', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const presetSave = page.waitForResponse(response => response.url().includes('/api/profile') && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await presetSave).status()).toBe(200);
    await expect(page).toHaveURL(/#\/settings$/);
    const presetProfile = (await (await page.request.get('/api/profile')).json()).data;
    expect(presetProfile).not.toHaveProperty('avatarUrl');
    expect(presetProfile).not.toHaveProperty('coverUrl');
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: 'Perfil publico' }).uncheck();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await page.goto('/#/profile');
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Perfil no disponible' })).toBeVisible();
    await visitor.close();
  });
}

test('private friend profile renders only the basic card and authorized posts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const profileId = randomUUID();
  const postId = randomUUID();
  await page.route(`**/api/profiles/${profileId}`, route => route.fulfill({ json: { ok: true, data: {
    accountId: profileId,
    displayName: 'Private Producer',
    bio: 'Basic creator bio',
    location: '',
    website: '',
    instagram: '',
    genres: ['Trap'],
    coverId: 'lo-fi',
    avatarId: 'initials',
    publicProfile: false,
  } } }));
  await page.route(`**/api/profiles/${profileId}/posts?*`, route => route.fulfill({ json: { ok: true, data: { posts: [{
    id: postId,
    author: { id: profileId, displayName: 'Private Producer' },
    kind: 'status',
    body: 'Friends-only update',
    audience: 'friends',
    visibility: 'published',
    createdAt: new Date().toISOString(),
  }] } } }));

  await page.goto(`/#/profile?id=${profileId}`);
  await expect(page.getByRole('heading', { name: 'Private Producer', exact: true })).toBeVisible();
  await expect(page.getByText('Basic creator bio')).toBeVisible();
  await expect(page.getByText('Trap', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Publicaciones' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Proyectos' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'En venta' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Acerca de' })).toHaveCount(0);
  await expect(page.locator('.producer-count')).toHaveCount(0);
  await expect(page.getByText('Friends-only update')).toBeVisible();
  await expect(page.getByText('Private location')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/visual-qa/mobile-private-friend-profile.png', fullPage: true });
});
