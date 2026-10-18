import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { config } from '../server/config'
import { e2eAdmin } from '../scripts/e2e-admin'

const hasFfmpeg = spawnSync(config.ffmpegPath, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0

function wav() {
  const samples = 16000
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index += 1) buffer.writeInt16LE(Math.round(Math.sin(index * Math.PI / 20) * 1000), 44 + index * 2)
  return buffer
}

test('Home demo artwork and feed images load instead of rendering empty media frames', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => route.abort('connectionrefused'))
  await page.goto('/#/home')
  const images = page.locator('.home-stories img, .home-post-media img, .home-rail img')
  await expect(images).toHaveCount(10)
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate(element => {
      const img = element as HTMLImageElement
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
    })).toBe(true)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'artifacts/site-audit/home-mobile-media-loaded.png', fullPage: true })
})

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: isolated admin and creator accounts complete catalog review`, async ({ page, playwright }) => {
    await page.setViewportSize(viewport)
    const creatorApi = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5187' })
    const creatorEmail = `audit-creator-${randomUUID()}@beatvault.test`
    const creatorPassword = 'Isolated-creator-test-password-2026'
    try {
      const registration = await creatorApi.post('/api/auth/register', { data: { email: creatorEmail, password: creatorPassword } })
      expect(registration.status()).toBe(201)
      const creatorLogin = await creatorApi.post('/api/auth/login', { data: { email: creatorEmail, password: creatorPassword } })
      expect(creatorLogin.status()).toBe(200)
      const creatorState = await creatorApi.storageState()
      const csrf = creatorState.cookies.find(cookie => cookie.name === 'beatvault_csrf')?.value
      expect(csrf).toBeTruthy()
      const title = `Audit bot beat ${randomUUID().slice(0, 8)}`
      let assetId: string | undefined
      if (hasFfmpeg) {
        const upload = await creatorApi.post('/api/assets/upload', {
          headers: { 'x-csrf-token': csrf! },
          multipart: { file: { name: `${title}.wav`, mimeType: 'audio/wav', buffer: wav() } },
        })
        expect(upload.status()).toBe(201)
        const audio = (await upload.json() as { data: { id: string; previewStorageKey?: string } }).data
        expect(audio.previewStorageKey).toBeTruthy()
        assetId = audio.id
      }
      const submission = await creatorApi.post('/api/catalog', {
        headers: { 'x-csrf-token': csrf! },
        data: { type: 'beat', title, tagIds: ['qa'], ...(assetId ? { assetId } : {}), publicationStatus: 'pending-review' },
      })
      expect(submission.status()).toBe(201)

      await page.goto('/#/admin')
      await page.getByLabel('Email', { exact: true }).fill(e2eAdmin.email)
      await page.getByLabel('Password', { exact: true }).fill(e2eAdmin.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
      await expect(page.getByText('API LOCAL')).toBeVisible()
      await expect(page.getByText('Datos de demostración.')).toHaveCount(0)
      const storageRow = page.locator('.admin-storage-row').filter({ hasText: creatorEmail })
      await expect(storageRow).toBeVisible()
      await storageRow.getByRole('spinbutton', { name: `Límite de prueba en MB para ${creatorEmail}` }).fill('12')
      await storageRow.getByRole('button', { name: 'Asignar' }).click()
      await expect(storageRow).toContainText('límite 12 MB')
      const storage = await creatorApi.get('/api/account/storage').then(response => response.json()) as { data: { limitBytes: number; quotaSource: string } }
      expect(storage.data).toMatchObject({ limitBytes: 12 * 1024 * 1024, quotaSource: 'account' })
      const accountRow = page.locator('.admin-row').filter({ hasText: creatorEmail })
      await accountRow.getByLabel(`Paquete para ${creatorEmail}`).selectOption('creator')
      await accountRow.getByRole('button', { name: 'Asignar' }).click()
      await expect.poll(async () => {
        const response = await creatorApi.get('/api/account/plan')
        const payload = await response.json() as { data: { planId: string } }
        return payload.data.planId
      }).toBe('creator')
      const row = page.locator('.admin-review-row').filter({ hasText: title })
      await expect(row).toBeVisible()
      await expect(row.locator('audio')).toHaveAttribute('src', /\/api\/staff\/catalog-review\/[^/]+\/preview$/)
      await page.screenshot({ path: `artifacts/site-audit/${viewport.name}-admin-storage-quota.png`, fullPage: true })
      await storageRow.getByRole('button', { name: 'Quitar' }).click()
      await expect(storageRow).toContainText('sin límite individual')
      await expect.poll(async () => {
        const response = await creatorApi.get('/api/account/storage')
        const payload = await response.json() as { data: { limitBytes: number | null; quotaSource: string } }
        return payload.data
      }).toMatchObject({ limitBytes: 50 * 1024 ** 3, quotaSource: 'plan' })
      const approve = row.getByRole('button', { name: 'Aprobar' })
      if (hasFfmpeg) {
        await expect(row.locator('audio')).toHaveAttribute('src', /\/api\/staff\/catalog-review\/[^/]+\/preview$/)
        await row.screenshot({ path: `artifacts/site-audit/${viewport.name}-admin-beat-review.png` })
        await approve.click()
        await expect(row).toHaveCount(0)
      } else {
        await expect(row.locator('audio')).toHaveCount(0)
        await expect(approve).toBeDisabled()
      }
      const catalogResponse = await page.request.get('/api/catalog')
      const catalog = (await catalogResponse.json()).data.entries as Array<{ title: string; publicationStatus: string }>
      expect(catalog.find(item => item.title === title)?.publicationStatus).toBe(hasFfmpeg ? 'published' : 'pending-review')
      await page.goto('/#/plans')
      await expect(page.getByRole('heading', { name: 'Plans', exact: true })).toBeVisible()
      await expect(page.getByText('LOCAL TEST ASSIGNMENT')).toBeVisible()
      await expect(page.getByText('Creator', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('50 GiB provisional storage', { exact: true })).toBeVisible()
      await expect(page.getByText('≈1,127 3-min WAV beats (est.)')).toBeVisible()
      await expect(page.getByText('≈12,800 one-shots (est.)')).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Storage usage' })).toBeVisible()
      await expect(page.getByText('50 GiB provisional storage', { exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/site-audit/${viewport.name}-plans.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await creatorApi.dispose()
    }
  })
}
