import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { config } from '../server/config';
import { e2eAdmin } from '../scripts/e2e-admin';

const baseURL = 'http://127.0.0.1:5187';
const password = 'One-shot-review-only-2026!';
const hasFfmpeg = spawnSync(config.ffmpegPath, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0;
function oneShotWav() {
  const samples = 8000;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) bytes.writeInt16LE(Math.round(Math.sin(index * Math.PI / 10) * Math.exp(-index / 1800) * 6000), 44 + index * 2);
  return bytes;
}
async function signIn(api: APIRequestContext, email: string, value = password) {
  expect((await api.post('/api/auth/login', { data: { email, password: value } })).status()).toBe(200);
  return (await api.storageState()).cookies.find(cookie => cookie.name === 'beatvault_csrf')!.value;
}
async function register(api: APIRequestContext, label: string) {
  const email = `oneshot-${label}-${randomUUID()}@beatvault.test`;
  expect((await api.post('/api/auth/register', { data: { email, password } })).status()).toBe(201);
  const csrf = await signIn(api, email);
  const { data } = await api.get('/api/auth/me').then(response => response.json());
  return { email, csrf, id: data.id as string };
}

test('One-shot follows private CM preview, rejection, correction, admin approval and public preview without exposing its original', async ({ browser, playwright, page }) => {
  test.skip(!hasFfmpeg, 'FFmpeg is required for real One-shot preview moderation.');
  test.setTimeout(120000);
  const creatorApi = await playwright.request.newContext({ baseURL });
  const managerApi = await playwright.request.newContext({ baseURL });
  const adminApi = await playwright.request.newContext({ baseURL });
  let managerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const creator = await register(creatorApi, 'creator');
    const manager = await register(managerApi, 'manager');
    const adminCsrf = await signIn(adminApi, e2eAdmin.email, e2eAdmin.password);
    expect((await adminApi.patch(`/api/admin/accounts/${manager.id}/role`, { headers: { 'x-csrf-token': adminCsrf }, data: { role: 'community_manager' } })).status()).toBe(200);
    await signIn(managerApi, manager.email);
    const original = oneShotWav();
    const uploaded = await creatorApi.post('/api/assets/upload', { headers: { 'x-csrf-token': creator.csrf }, multipart: { file: { name: 'percussion-one-shot.wav', mimeType: 'audio/wav', buffer: original } } });
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const asset = (await uploaded.json()).data as { id: string; previewStorageKey?: string };
    expect(asset.previewStorageKey).toBeTruthy();
    const title = `Percussion sample ${randomUUID().slice(0, 8)}`;
    const input = { type: 'sample', title, assetId: asset.id, tagIds: ['qa', 'percussion'], publicationStatus: 'pending-review' };
    const created = await creatorApi.post('/api/catalog', { headers: { 'x-csrf-token': creator.csrf }, data: input });
    expect(created.status()).toBe(201);
    const contentId = (await created.json()).data.contentId as string;
    const reviewPreview = `/api/staff/catalog-review/${contentId}/preview`;
    expect((await page.request.get(`/api/catalog/${contentId}/preview`)).status()).toBe(404);
    expect((await creatorApi.get(reviewPreview)).status()).toBe(403);
    const privatePreview = await managerApi.get(reviewPreview);
    expect(privatePreview.status()).toBe(200);
    expect(privatePreview.headers()['content-type']).toContain('audio/mp4');
    expect((await privatePreview.body()).length).toBeGreaterThan(0);
    expect((await managerApi.get(`/api/assets/${asset.id}/download`)).status()).toBe(404);
    managerContext = await browser.newContext({ baseURL, storageState: await managerApi.storageState() });
    const managerPage = await managerContext.newPage();
    await managerPage.goto('/#/community-review');
    const pending = managerPage.locator('.upload-review-row').filter({ hasText: title });
    await expect(pending).toBeVisible();
    await expect(pending.locator('audio')).toHaveAttribute('src', reviewPreview);
    const rejection = 'Please identify the percussion instrument in the title.';
    await pending.getByLabel('Review note').fill(rejection);
    await pending.getByRole('button', { name: 'Reject audio', exact: true }).click();
    await expect(pending).toHaveCount(0);
    const rejected = (await creatorApi.get('/api/catalog').then(response => response.json())).data.entries.find((entry: { contentId: string }) => entry.contentId === contentId);
    expect(rejected).toMatchObject({ type: 'sample', publicationStatus: 'rejected', reviewNote: rejection });
    const correctedTitle = `Closed hat ${title}`;
    const corrected = await creatorApi.put(`/api/catalog/${contentId}`, { headers: { 'x-csrf-token': creator.csrf }, data: { ...input, title: correctedTitle } });
    expect(corrected.status(), await corrected.text()).toBe(200);
    adminContext = await browser.newContext({ baseURL, storageState: await adminApi.storageState() });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/#/admin');
    const reviewed = adminPage.locator('.admin-review-row').filter({ hasText: correctedTitle });
    await expect(reviewed).toBeVisible();
    await expect(reviewed.locator('audio')).toHaveAttribute('src', reviewPreview);
    await reviewed.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await expect(reviewed).toHaveCount(0);
    const detail = await page.request.get(`/api/catalog/${contentId}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data).toMatchObject({ type: 'sample', publicationStatus: 'published' });
    const publicPreview = await page.request.get(`/api/catalog/${contentId}/preview`);
    expect(publicPreview.status()).toBe(200);
    expect(publicPreview.headers()['content-type']).toContain('audio/mp4');
    expect((await publicPreview.body()).length).toBeGreaterThan(0);
    expect((await page.request.get(`/api/assets/${asset.id}/download`)).ok()).toBe(false);
    expect((await managerApi.get(`/api/assets/${asset.id}/download`)).status()).toBe(404);
    const ownerDownload = await creatorApi.get(`/api/assets/${asset.id}/download`);
    expect(ownerDownload.status()).toBe(200);
    expect(await ownerDownload.body()).toEqual(original);
    expect((await page.request.get(`/api/catalog/${contentId}`)).headers()['cache-control']).toBe('no-store');
  } finally {
    await managerContext?.close(); await adminContext?.close();
    await creatorApi.dispose(); await managerApi.dispose(); await adminApi.dispose();
  }
});
