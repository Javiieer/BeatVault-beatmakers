import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

function wav(frequency: number) {
  const bytes = Buffer.alloc(44 + 8000 * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(16000, 40)
  for (let index = 0; index < 8000; index++) bytes.writeInt16LE(Math.round(Math.sin(index * frequency) * 1500), 44 + index * 2)
  return bytes
}

for (const variant of [{ name: 'desktop-webp', width: 1440, height: 900, format: 'webp' as const }, { name: 'mobile-avif', width: 390, height: 844, format: 'avif' as const }]) {
  test(`${variant.name}: batch append and landscape cover normalize while original audio stays intact`, async ({ page }) => {
    test.setTimeout(90000)
    await page.setViewportSize(variant)
    const email = `media-upload-${randomUUID()}@beatvault.test`
    const password = `Media-only-${randomUUID()}`
    expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(201)
    expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
    await page.goto('/#/upload')
    const first = wav(0.1)
    const second = wav(0.2)
    await page.locator('#upload-file').setInputFiles({ name: 'first.wav', mimeType: 'application/octet-stream', buffer: first })
    const transfer = await page.evaluateHandle(bytes => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'second.wav', { type: 'audio/wav' }))
      return data
    }, [...second])
    await page.locator('.dropzone').dispatchEvent('drop', { dataTransfer: transfer })
    await transfer.dispose()
    await expect(page.getByText('2 archivos seleccionados · añadir más')).toBeVisible()
    await page.getByLabel('Nombre para first.wav').fill('Media first')
    await page.getByLabel('Nombre para second.wav').fill('Media second')
    await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Beat')
    await page.getByLabel('Tags', { exact: true }).fill('media-audit')
    const artwork = await sharp({ create: { width: 960, height: 640, channels: 3, background: '#336699' } })[variant.format]().toBuffer()
    await page.locator('#upload-artwork').setInputFiles({ name: `landscape.${variant.format}`, mimeType: `image/${variant.format}`, buffer: artwork })
    await expect(page.getByText(/La portada se recorta al centro/)).toBeVisible()
    await page.getByRole('button', { name: 'Enviar a revision', exact: true }).click()
    await expect(page).toHaveURL(/#\/studio$/)
    const entries = (await (await page.request.get('/api/catalog')).json()).data.entries as Array<{ contentId: string; assetId: string; title: string; audio?: { previewReady: boolean }; publicationStatus: string }>
    const ours = entries.filter(item => ['Media first', 'Media second'].includes(item.title))
    expect(ours).toHaveLength(2)
    for (const entry of ours) {
      expect(entry.publicationStatus).toBe('pending-review')
      expect(entry.audio?.previewReady).toBe(true)
      const download = await page.request.get(`/api/assets/${entry.assetId}/download`)
      expect(download.status()).toBe(200)
      expect(await download.body()).toEqual(entry.title === 'Media first' ? first : second)
      const cover = await page.request.get(`/api/catalog/${entry.contentId}/artwork`)
      expect(cover.status()).toBe(200)
      const metadata = await sharp(await cover.body()).metadata()
      expect(metadata).toMatchObject({ format: 'jpeg', width: 640, height: 640 })
      expect(metadata.exif).toBeUndefined()
      expect(metadata.xmp).toBeUndefined()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/media-upload-${variant.name}.png`, fullPage: true })
  })
}
