import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('new creator can register, persist identity and recover it in a fresh browser', async ({ page, browser }, testInfo) => {
  test.setTimeout(90000)
  const email = `journey-${randomUUID()}@beatvault.test`
  const password = `Journey-only-${randomUUID()}`
  const name = `Audit creator ${randomUUID().slice(0, 8)}`
  const ready = await page.request.get('/api/ready').then(response => response.json())
  expect(ready.data.storageBackend).toBe(process.env.BEATVAULT_E2E_DATABASE_URL ? 'postgres' : 'json')
  await page.goto('/#/login')
  await page.getByRole('button', { name: 'Create a local account' }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.locator('#primary-navigation')).toBeVisible()
  await expect(page.locator('#market-search')).toBeVisible()
  await expect(page.locator('#primary-navigation a[href="#/marketplace"]')).toHaveCount(1)
  await expect(page.locator('#primary-navigation a[href="#/admin"]')).toHaveCount(0)
  await page.goto('/#/settings')
  await page.getByLabel('Nombre artistico').fill(name)
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect.poll(async () => (await page.request.get('/api/profile').then(response => response.json())).data.displayName).toBe(name)
  await page.getByRole('button', { name: 'Privacidad', exact: true }).click()
  await expect(page.getByText('Tus publicaciones e historias se guardan en el servidor local de BeatVault.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Perfil público')).not.toBeChecked()
  const plan = await page.request.get('/api/account/plan').then(response => response.json())
  expect(plan.data).toMatchObject({ planId: 'free', billing: 'disabled' })
  const clean = await browser.newContext({ baseURL: 'http://127.0.0.1:5187' })
  try {
    const fresh = await clean.newPage()
    await fresh.goto('/#/login')
    await fresh.getByLabel('Email', { exact: true }).fill(email)
    await fresh.getByLabel('Password', { exact: true }).fill(password)
    await fresh.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(fresh.locator('#primary-navigation')).toBeVisible()
    await fresh.goto('/#/settings')
    await expect(fresh.getByLabel('Nombre artistico')).toHaveValue(name)
    const unsaved = `${name} unsaved`
    await fresh.getByLabel('Nombre artistico').fill(unsaved)
    await fresh.locator('#primary-navigation a[href="#/studio"]').click()
    await expect(fresh.getByRole('heading', { name: 'Mis subidas', exact: true })).toBeVisible()
    await fresh.goto('/#/settings')
    const draftAfterNavigation = await fresh.getByLabel('Nombre artistico').inputValue()
    expect(draftAfterNavigation).toBe(unsaved)
    await testInfo.attach('first-run-product-observations', { contentType: 'application/json', body: JSON.stringify({ storageBackend: ready.data.storageBackend, registrationWorks: true, identitySurvivesFreshBrowser: true, privateProfileDefault: true, billingDisabled: true, unsavedProfileDraftSurvivesNavigation: draftAfterNavigation === unsaved }, null, 2) })
    await fresh.screenshot({ path: 'artifacts/product-audit/first-run-profile.png', fullPage: true })
  } finally { await clean.close() }
})
