import { expect, test } from '@playwright/test'

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: Mercado Pago seller setup stays disabled when the provider is not configured`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const email = `mercadopago-connect-${viewport.name}@beatvault.tes`
    const password = 'Mercado-Pago-local-test-password-2026'
    const registration = await page.request.post('http://127.0.0.1:5187/api/auth/register', { data: { email, password } })
    expect(registration.status()).toBe(201)
    const login = await page.request.post('http://127.0.0.1:5187/api/auth/login', { data: { email, password } })
    expect(login.status()).toBe(200)
    await page.goto('/#/marketplace')
    await expect(page.locator('.mercadopago-connect-panel')).toHaveCount(0)
    await page.goto('/#/studio')
    const setup = page.locator('.mercadopago-connect-panel')
    await expect(setup.getByRole('heading', { name: 'Connect Mercado Pago' })).toBeVisible()
    await expect(setup.getByRole('button', { name: 'Connect Mercado Pago' })).toBeDisabled()
    await expect(setup).toContainText('Mercado Pago is not configured on this local server.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/mercadopago-connect/${viewport.name}-setup-disabled.png`, fullPage: true })
  })
}
