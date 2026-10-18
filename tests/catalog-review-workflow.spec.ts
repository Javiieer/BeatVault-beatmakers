import { expect, test, type APIRequestContext, type Browser } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { config } from '../server/config'
import { e2eAdmin } from '../scripts/e2e-admin'

const baseURL = 'http://127.0.0.1:5187'
const hasFfmpeg = spawnSync(config.ffmpegPath, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0
const password = 'Isolated-review-test-password-2026'

function wav(frequency: number) {
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
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin(index * Math.PI * frequency / 4000) * 3500), 44 + index * 2)
  }
  return buffer
}

async function signIn(api: APIRequestContext, email: string, userPassword: string) {
  const response = await api.post('/api/auth/login', { data: { email, password: userPassword } })
  expect(response.status()).toBe(200)
  const state = await api.storageState()
  const csrf = state.cookies.find(cookie => cookie.name === 'beatvault_csrf')?.value
  expect(csrf).toBeTruthy()
  return csrf!
}

async function createUser(api: APIRequestContext, prefix: string) {
  const email = `${prefix}-${randomUUID()}@beatvault.test`
  const registration = await api.post('/api/auth/register', { data: { email, password } })
  expect(registration.status()).toBe(201)
  await signIn(api, email, password)
  const me = await api.get('/api/auth/me').then(response => response.json()) as { data: { id: string } }
  return { email, id: me.data.id }
}

async function uploadBeat(api: APIRequestContext, csrf: string, title: string, frequency: number) {
  const upload = await api.post('/api/assets/upload', {
    headers: { 'x-csrf-token': csrf },
    multipart: { file: { name: `${title}.wav`, mimeType: 'audio/wav', buffer: wav(frequency) } },
  })
  expect(upload.status()).toBe(201)
  const asset = (await upload.json() as { data: { id: string; previewStorageKey?: string; previewSizeBytes?: number } }).data
  expect(asset.previewStorageKey).toBeTruthy()
  expect(asset.previewSizeBytes).toBeGreaterThan(0)

  const submission = await api.post('/api/catalog', {
    headers: { 'x-csrf-token': csrf },
    data: { type: 'beat', title, tagIds: ['qa'], assetId: asset.id, publicationStatus: 'pending-review' },
  })
  expect(submission.status()).toBe(201)
  const entry = (await submission.json() as { data: { contentId: string } }).data
  return { ...entry, title }
}

async function loginBrowser(browser: Browser, api: APIRequestContext) {
  const context = await browser.newContext({ baseURL, storageState: await api.storageState() })
  return { context, page: await context.newPage() }
}

test('processed Beats move through CM approval, CM rejection and independent admin approval', async ({ page, playwright, browser }) => {
  test.skip(!hasFfmpeg, 'FFmpeg is required to exercise processed-preview approval.')
  test.setTimeout(120000)

  const creatorApi = await playwright.request.newContext({ baseURL })
  const managerRegistrationApi = await playwright.request.newContext({ baseURL })
  const adminApi = await playwright.request.newContext({ baseURL })
  let managerApi: APIRequestContext | undefined
  let outsiderApi: APIRequestContext | undefined
  let managerBrowser: Awaited<ReturnType<typeof loginBrowser>> | undefined
  try {
    await createUser(creatorApi, 'review-creator')
    const registrationManager = await createUser(managerRegistrationApi, 'review-manager')
    const adminCsrf = await signIn(adminApi, e2eAdmin.email, e2eAdmin.password)
    const role = await adminApi.patch(`/api/admin/accounts/${registrationManager.id}/role`, {
      headers: { 'x-csrf-token': adminCsrf },
      data: { role: 'community_manager' },
    })
    expect(role.status()).toBe(200)

    managerApi = await playwright.request.newContext({ baseURL })
    const managerCsrf = await signIn(managerApi, registrationManager.email, password)
    managerBrowser = await loginBrowser(browser, managerApi)

    const creatorCsrf = (await creatorApi.storageState()).cookies.find(cookie => cookie.name === 'beatvault_csrf')!.value
    const approvedByManager = await uploadBeat(creatorApi, creatorCsrf, `CM approved ${randomUUID().slice(0, 8)}`, 440)
    const rejectedByManager = await uploadBeat(creatorApi, creatorCsrf, `CM rejected ${randomUUID().slice(0, 8)}`, 550)
    const approvedByAdmin = await uploadBeat(creatorApi, creatorCsrf, `Admin approved ${randomUUID().slice(0, 8)}`, 660)

    outsiderApi = await playwright.request.newContext({ baseURL })
    await createUser(outsiderApi, 'review-outsider')
    const privatePreview = `/api/staff/catalog-review/${approvedByManager.contentId}/preview`
    expect((await outsiderApi.get('/api/staff/catalog-review')).status()).toBe(403)
    expect((await outsiderApi.get(privatePreview)).status()).toBe(403)
    expect((await adminApi.get('/api/staff/catalog-review')).status()).toBe(403)
    expect((await creatorApi.get(privatePreview)).status()).toBe(403)
    expect((await managerApi.get(privatePreview)).status()).toBe(200)

    const managerPage = managerBrowser.page
    await managerPage.setViewportSize({ width: 1440, height: 900 })
    await managerPage.goto('/#/community-review')
    await expect(managerPage.getByRole('heading', { name: 'Marketplace review' })).toBeVisible()
    await expect(managerPage.getByRole('heading', { name: 'Beat upload approvals' })).toBeVisible()

    const managerRow = managerPage.locator('.upload-review-row').filter({ hasText: approvedByManager.title })
    await expect(managerRow).toBeVisible()
    await expect(managerRow.locator('audio')).toHaveAttribute('src', privatePreview)
    await managerRow.screenshot({ path: 'artifacts/site-audit/community-manager-beat-review.png' })
    const managerNote = managerRow.getByLabel('Review note')
    await managerNote.fill('Preview and metadata checked by the CM.')
    await managerRow.getByRole('button', { name: 'Approve and publish' }).click()
    await expect(managerRow).toHaveCount(0)

    const rejectRow = managerPage.locator('.upload-review-row').filter({ hasText: rejectedByManager.title })
    await expect(rejectRow).toBeVisible()
    await rejectRow.getByLabel('Review note').fill('Please remove clipping from the master.')
    await rejectRow.getByRole('button', { name: 'Reject Beat' }).click()
    await expect(rejectRow).toHaveCount(0)

    const managerDecision = await managerApi.post(`/api/staff/catalog-review/${approvedByManager.contentId}`, {
      headers: { 'x-csrf-token': managerCsrf, 'content-type': 'application/json' },
      data: { decision: 'approve', note: 'Duplicate decision should fail.' },
    })
    expect(managerDecision.status()).toBe(409)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/#/admin')
    await page.getByLabel('Email', { exact: true }).fill(e2eAdmin.email)
    await page.getByLabel('Password', { exact: true }).fill(e2eAdmin.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
    const adminRow = page.locator('.admin-review-row').filter({ hasText: approvedByAdmin.title })
    await expect(adminRow).toBeVisible()
    await expect(adminRow.locator('audio')).toHaveAttribute('src', `/api/staff/catalog-review/${approvedByAdmin.contentId}/preview`)
    await adminRow.getByRole('button', { name: 'Aprobar' }).click()
    await expect(adminRow).toHaveCount(0)

    const ownerEntries = (await creatorApi.get('/api/catalog').then(response => response.json()) as { data: { entries: Array<{ contentId: string; publicationStatus: string; reviewNote?: string }> } }).data.entries
    expect(ownerEntries.find(entry => entry.contentId === approvedByManager.contentId)?.publicationStatus).toBe('published')
    expect(ownerEntries.find(entry => entry.contentId === rejectedByManager.contentId)).toMatchObject({ publicationStatus: 'rejected', reviewNote: 'Please remove clipping from the master.' })
    expect(ownerEntries.find(entry => entry.contentId === approvedByAdmin.contentId)?.publicationStatus).toBe('published')

    const publicCatalog = await outsiderApi.get('/api/marketplace?type=beat&limit=24').then(response => response.json()) as { data: { entries: Array<{ contentId: string }> } }
    expect(publicCatalog.data.entries.some(entry => entry.contentId === approvedByManager.contentId)).toBe(true)
    expect(publicCatalog.data.entries.some(entry => entry.contentId === approvedByAdmin.contentId)).toBe(true)
    expect(publicCatalog.data.entries.some(entry => entry.contentId === rejectedByManager.contentId)).toBe(false)
    expect((await outsiderApi.get(`/api/catalog/${approvedByManager.contentId}/preview`)).status()).toBe(200)
    expect((await outsiderApi.get(`/api/catalog/${rejectedByManager.contentId}/preview`)).status()).toBe(404)

    const audit = await adminApi.get('/api/admin/audit').then(response => response.json()) as { data: Array<{ targetId: string; action: string }> }
    expect(audit.data.some(event => event.targetId === approvedByManager.contentId && event.action === 'catalog_community_decision')).toBe(true)
    expect(audit.data.some(event => event.targetId === approvedByAdmin.contentId && event.action === 'catalog_admin_decision')).toBe(true)
    const outsiderCatalog = await outsiderApi.get('/api/catalog').then(response => response.json()) as { data: { entries: Array<{ contentId: string }> } }
    expect(outsiderCatalog.data.entries).not.toEqual(expect.arrayContaining([expect.objectContaining({ contentId: rejectedByManager.contentId })]))

  } finally {
    await managerBrowser?.context.close()
    await managerApi?.dispose()
    await outsiderApi?.dispose()
    await creatorApi.dispose()
    await managerRegistrationApi.dispose()
    await adminApi.dispose()
  }
})
