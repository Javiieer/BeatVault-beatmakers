import { expect, test } from '@playwright/test'

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: seller payout setup stays disabled without Stripe test credentials`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const email = `connect-test-${viewport.name}@beatvault.test`
    const password = 'Stripe-connect-local-test-password-2026'
    const registration = await page.request.post('http://127.0.0.1:5187/api/auth/register', { data: { email, password } })
    expect(registration.status()).toBe(201)
    const login = await page.request.post('http://127.0.0.1:5187/api/auth/login', { data: { email, password } })
    expect(login.status()).toBe(200)
    await page.goto('/#/marketplace')
    await expect(page.getByText('Loading marketplace…')).toHaveCount(0)
    const setup = page.locator('.stripe-connect-panel')
    await expect(setup.getByRole('heading', { name: 'Set up your seller account' })).toBeVisible()
    await expect(setup.getByRole('button', { name: 'Set up with Stripe' })).toBeDisabled()
    await expect(setup).toContainText('Stripe test credentials are not configured on this local server.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/stripe-connect/${viewport.name}-setup-disabled.png`, fullPage: true })
  })
}
