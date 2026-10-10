import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

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
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'beatvault_csrf')!.value;
    for (const [title, type, coverId] of [['Night drive', 'Beat', 'lo-fi'], ['Drum one', 'One-shot', '808']]) {
      const response = await page.request.post('/api/catalog', { headers: { 'x-csrf-token': csrf }, data: { title, type, coverId, publicationStatus: 'draft', tagIds: ['trap', 'midnight'] } });
      expect(response.status()).toBe(201);
    }
    await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
    await page.getByLabel('Nombre artistico').fill('Northside Audio');
    await page.getByLabel('Biografia').fill('Beats nocturnos. Texturas analogicas y percusion original.');
    await page.getByLabel('Ubicacion').fill('Ciudad de Mexico');
    await page.getByLabel('Generos', { exact: true }).fill('Trap, R&B, Lo-fi');
    await page.getByLabel('Sitio web', { exact: true }).fill('https://example.com');
    await page.getByLabel('Instagram', { exact: true }).fill('@northside.audio');
    await page.getByRole('button', { name: 'Avatar 808', exact: true }).click();
    await page.getByRole('button', { name: 'Portada Orchestra', exact: true }).click();
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
    await expect(page).toHaveURL(/#\/profile$/);
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
    const visitor = await browser.newContext({ viewport });
    const guest = await visitor.newPage();
    await guest.goto(`http://127.0.0.1:5187/#/profile?id=${me.id}`);
    await expect(guest.getByRole('heading', { name: 'Northside Audio', exact: true })).toBeVisible();
    await expect(guest.getByText(email, { exact: true })).toHaveCount(0);
    await expect(guest.getByRole('link', { name: 'Editar perfil', exact: true })).toHaveCount(0);
    await expect(guest.locator('.producer-project')).toHaveCount(0);
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: 'Perfil publico' }).uncheck();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(/#\/profile$/);
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Perfil no disponible' })).toBeVisible();
    await visitor.close();
  });
}
