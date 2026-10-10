import { expect, test } from '@playwright/test';

function wav() {
  const buffer = Buffer.alloc(2044);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(2000, 40);
  return buffer;
}
for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: create, filter, edit and archive creator audio`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route(url => url.pathname.startsWith('/api/'), route => route.abort('connectionrefused'));
    await page.goto('/#/studio');
    await expect(page.getByRole('heading', { name: 'Mis subidas', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem('beatvault:local-projects', '[]'));
    for (const [type, name] of [['Beat', 'Midnight beat'], ['One-shot', 'Tight kick']]) {
      await page.goto('/#/upload');
      await expect(page.locator('#upload-type option')).toHaveText(['Seleccionar tipo', 'Beat', 'One-shot']);
      await page.locator('#upload-file').setInputFiles({ name: `${name}.wav`, mimeType: 'audio/wav', buffer: wav() });
      await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption(type);
      await page.getByLabel('Tags', { exact: true }).fill('trap, dark');
      await page.getByRole('button', { name: 'Portada Lo-fi' }).click();
      await page.getByRole('button', { name: 'Enviar a revision' }).click();
      await expect(page).toHaveURL(/#\/studio$/);
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(page.locator('.creator-upload-card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Escuchar Tight kick' })).toBeEnabled();
    await expect.poll(() => page.locator('.creator-upload-cover').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-my-uploads-populated.png`, fullPage: true });
    await page.getByRole('button', { name: 'One-shots', exact: true }).click();
    await expect(page.locator('.creator-upload-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Editar Tight kick' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre').fill('Renamed kick');
    await dialog.getByLabel('Tags').fill('drums, punchy');
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Archivar Renamed kick' }).click();
    await expect(page.getByRole('button', { name: 'Restaurar Renamed kick' })).toBeVisible();
    await page.getByRole('button', { name: 'Restaurar Renamed kick' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Renamed kick' })).toBeVisible();
    const card = page.locator('.creator-upload-card').filter({ hasText: 'Renamed kick' });
    await expect(card).toContainText('#drums #punchy');
    await expect(card.locator('img')).toHaveAttribute('src', '/assets/demo/chill-lo-fi.png');
    await expect(card.getByRole('button', { name: 'Escuchar Renamed kick' })).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('beatvault:local-projects'))).toBe('[]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
