import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function wav() {
  const buffer = Buffer.alloc(32044);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(32000, 40);
  for (let i = 0; i < 16000; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI / 20) * 1000), 44 + i * 2);
  return buffer;
}
async function register(page: Page, email: string) {
  await page.getByRole('button', { name: 'Create a local account' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Temporary-test-password-44');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: authenticated upload survives reload and isolates accounts`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const email = `owner-${randomUUID()}@test.local`;
    await page.goto('/#/upload');
    await register(page, email);
    const file = { name: 'Persistent beat.wav', mimeType: 'audio/wav', buffer: wav() };
    const artwork = await readFile(resolve(process.cwd(), 'server/fixtures/beat-upload-cover.jpg'));
    await page.locator('#upload-file').setInputFiles(file);
    await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Beat');
    await page.getByLabel('Tags', { exact: true }).fill('trap, private');
    await page.locator('#upload-artwork').setInputFiles({ name: 'cover.jpg', mimeType: 'image/jpeg', buffer: artwork });
    // Lose the response after the server commits: retry must not duplicate the file or record.
    await page.route('**/api/catalog', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('connectionreset');
    });
    await page.getByRole('button', { name: 'Enviar a revision' }).click();
    await expect(page.getByRole('alert')).toContainText('no se guardo');
    await page.unroute('**/api/catalog');
    await page.reload();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Persistent beat');
    await page.locator('#upload-file').setInputFiles(file);
    await page.getByRole('button', { name: 'Enviar a revision' }).click();
    await expect(page).toHaveURL(/#\/studio$/);
    const result = await (await page.request.get('/api/catalog')).json();
    const currentUser = await (await page.request.get('/api/auth/me')).json();
    const ownedEntries = result.data.entries.filter((item: { creatorId: string; title: string }) =>
      item.creatorId === currentUser.data.id && item.title === 'Persistent beat');
    expect(ownedEntries).toHaveLength(1);
    const entry = ownedEntries[0];
    expect(entry.artworkUrl).toBe(`/api/catalog/${entry.contentId}/artwork/thumbnail`);
    expect(entry.audio.sizeBytes).toBe(file.buffer.length);
    expect(entry.audio).not.toHaveProperty('storageKey');
    const thumbnail = await page.request.get(entry.artworkUrl);
    expect(thumbnail.status()).toBe(200);
    expect(thumbnail.headers()['content-type']).toContain('image/webp');
    expect((await thumbnail.body()).length).toBeLessThan(artwork.length);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('region', { name: 'Uso de almacenamiento' })).toContainText('MB usados');
    await expect(page.getByRole('region', { name: 'Uso de almacenamiento' })).toContainText('cuota del paquete se definirá más adelante');
    const card = page.locator('.creator-upload-card').filter({ hasText: 'Persistent beat' });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', entry.artworkUrl);
    if (entry.audio.previewReady) {
      await expect(card).not.toContainText('Preview público pendiente');
      await expect(card.getByRole('button', { name: 'Generar preview' })).toHaveCount(0);
    } else {
      await expect(card).toContainText('Preview público pendiente');
      await card.getByRole('button', { name: 'Generar preview' }).click();
      await expect(page.getByRole('alert')).toContainText('Verifica FFmpeg');
      await expect(card.getByRole('button', { name: 'Generar preview' })).toBeEnabled();
    }
    await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const preview = page.waitForResponse(response => response.url().includes(`/api/assets/${entry.assetId}/preview`) && response.ok());
    await card.getByRole('button', { name: 'Escuchar Persistent beat' }).click();
    await preview;
    await expect.poll(() => page.locator('audio').evaluateAll(audios => audios.some(audio => audio instanceof HTMLAudioElement && audio.readyState >= 2 && audio.duration === 2))).toBe(true);
    const download = await page.request.get(`/api/assets/${entry.assetId}/download`);
    expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(file.buffer);
    const clearPlayer = page.getByRole('button', { name: 'Clear player' });
    if (await clearPlayer.count()) await clearPlayer.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-persistent-audio.png`, fullPage: true });
    await page.goto('/#/upload');
    await page.getByLabel('Nombre', { exact: true }).fill('Private unfinished draft');
    await expect(page.getByRole('status')).toContainText('Borrador guardado');
    await page.getByRole('button', { name: 'Menu de perfil', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesion', exact: true }).click();
    await register(page, `other-${randomUUID()}@test.local`);
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('');
    expect((await page.request.get(`/api/assets/${entry.assetId}/preview`)).status()).toBe(404);
    expect((await page.request.get(`/api/assets/${entry.assetId}/download`)).status()).toBe(404);
    await page.goto('/#/studio');
    await expect(page.locator('.creator-upload-card')).toHaveCount(0);
    await page.route('**/api/catalog', route => route.abort());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mis subidas', exact: true })).toBeVisible();
    await expect(page.locator('.creator-upload-card')).toHaveCount(0);
    await expect(page.getByText('Private unfinished draft')).toHaveCount(0);
  });
}
