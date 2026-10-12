import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { e2eAdmin } from '../scripts/e2e-admin'

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
      const submission = await creatorApi.post('/api/catalog', {
        headers: { 'x-csrf-token': csrf! },
        data: { type: 'beat', title, tagIds: ['qa'], publicationStatus: 'pending-review' },
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
      const assignedPlan = await creatorApi.get('/api/account/plan').then(response => response.json()) as { data: { planId: string } }
      expect(assignedPlan.data.planId).toBe('creator')
      const row = page.locator('.admin-review-row').filter({ hasText: title })
      await expect(row).toBeVisible()
      await page.screenshot({ path: `artifacts/site-audit/${viewport.name}-admin-storage-quota.png`, fullPage: true })
      await storageRow.getByRole('button', { name: 'Quitar' }).click()
      const clearedStorage = await creatorApi.get('/api/account/storage').then(response => response.json()) as { data: { limitBytes: number | null; quotaSource: string } }
      expect(clearedStorage.data).toMatchObject({ limitBytes: 50 * 1024 ** 3, quotaSource: 'plan' })
      await row.getByRole('button', { name: 'Aprobar' }).click()
      await expect(row).toHaveCount(0)
      const catalogResponse = await page.request.get('/api/catalog')
      const catalog = (await catalogResponse.json()).data.entries as Array<{ title: string; publicationStatus: string }>
      expect(catalog.find(item => item.title === title)?.publicationStatus).toBe('published')
      await page.goto('/#/plans')
      await expect(page.getByRole('heading', { name: 'Paquetes', exact: true })).toBeVisible()
      await expect(page.getByText('ASIGNADO LOCALMENTE')).toBeVisible()
      await expect(page.getByText('Creator', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('50 GiB', { exact: true })).toBeVisible()
      await expect(page.getByText('≈1,127 beats WAV de 3 min')).toBeVisible()
      await expect(page.getByText('≈12,800 one-shots de 4 MiB')).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Uso de almacenamiento' })).toBeVisible()
      await expect(page.getByText('50 GiB', { exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/site-audit/${viewport.name}-plans.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await creatorApi.dispose()
    }
  })
}
