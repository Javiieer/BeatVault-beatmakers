import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5187';

async function createAccount(request: APIRequestContext, label: string) {
  const email = `chat-${label}-${crypto.randomUUID()}@test.local`;
  const password = 'Chat-test-password-2026';
  const registered = await request.post('/api/auth/register', { data: { email, password } });
  expect(registered.status()).toBe(201);
  const login = await request.post('/api/auth/login', { data: { email, password } });
  expect(login.status()).toBe(200);
  const user = (await login.json()).data as { id: string };
  const cookies = await request.storageState();
  const csrf = cookies.cookies.find(cookie => cookie.name === 'beatvault_csrf')?.value;
  expect(csrf).toBeTruthy();
  const profile = await request.put('/api/profile', {
    headers: { 'x-csrf-token': csrf! },
    data: { displayName: `Producer ${label}`, bio: '', location: '', website: '', instagram: '', genres: ['Trap'], coverId: '808', avatarId: 'initials', publicProfile: true },
  });
  expect(profile.status()).toBe(200);
  return { id: user.id, csrf: csrf!, cookies: cookies.cookies };
}

async function applyCookies(context: BrowserContext, cookies: Awaited<ReturnType<APIRequestContext['storageState']>>['cookies']) {
  await context.addCookies(cookies.map(cookie => ({
    name: cookie.name, value: cookie.value, url: baseURL, expires: cookie.expires,
    httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite,
  })));
}

test('direct chat receives messages live and switches between inbox and thread on mobile', async ({ browser, playwright }) => {
  const firstApi = await playwright.request.newContext({ baseURL });
  const secondApi = await playwright.request.newContext({ baseURL });
  const first = await createAccount(firstApi, 'north');
  const second = await createAccount(secondApi, 'south');
  const send = await firstApi.post('/api/friend-requests', { headers: { 'x-csrf-token': first.csrf }, data: { targetId: second.id } });
  expect(send.status()).toBe(201);
  const requestId = ((await send.json()).data as { id: string }).id;
  const accepted = await secondApi.post(`/api/friend-requests/${requestId}/accept`, { headers: { 'x-csrf-token': second.csrf } });
  expect(accepted.status()).toBe(200);

  const firstContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await applyCookies(firstContext, first.cookies);
  await applyCookies(secondContext, second.cookies);
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  await firstPage.goto('/#/chat');
  await firstPage.getByRole('button', { name: /Producer south/ }).click();
  await expect(firstPage.locator('.chat-thread-header strong')).toHaveText('Producer south');

  await secondPage.goto('/#/chat');
  await expect(secondPage.getByRole('button', { name: /Producer north/ })).toBeVisible();
  await expect(secondPage.locator('.chat-connection')).toHaveText(/En línea/, { timeout: 10000 });
  await expect(secondPage.getByRole('button', { name: /Producer north/ }).locator('.chat-avatar i')).toHaveClass(/is-online/);
  await expect(firstPage.getByRole('button', { name: /Producer south/ }).locator('.chat-avatar i')).toHaveClass(/is-online/, { timeout: 10000 });
  await secondPage.locator('.notification-trigger').click();
  await expect(secondPage.getByText('Estás al día')).toBeVisible();
  await secondPage.getByRole('button', { name: 'Cerrar notificaciones' }).click();
  await firstPage.getByLabel('Escribe un mensaje').fill('¿Listo para revisar el beat?');
  await firstPage.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(secondPage.getByText('¿Listo para revisar el beat?')).toBeVisible({ timeout: 10000 });
  await expect(secondPage.locator('.chat-contact-meta i')).toHaveText('1');
  await expect(secondPage.getByRole('status').filter({ hasText: 'Nuevo mensaje de Producer north' })).toBeVisible({ timeout: 10000 });
  await secondPage.locator('.notification-trigger').click();
  await secondPage.getByRole('link', { name: /Producer north.*¿Listo para revisar el beat/ }).click();
  await expect(secondPage.locator('.chat-thread-header strong')).toHaveText('Producer north');
  await expect(secondPage.getByRole('button', { name: 'Volver a conversaciones' })).toBeVisible();
  await expect(secondPage.locator('.chat-message-row:not(.mine)')).toContainText('¿Listo para revisar el beat?');
  await secondPage.getByRole('button', { name: 'Volver a conversaciones' }).click();
  await expect(secondPage.getByRole('button', { name: /Producer north/ })).toBeVisible();
  expect(await secondPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await secondContext.close();
  await expect(firstPage.getByRole('button', { name: /Producer south/ }).locator('.chat-avatar i')).toHaveClass(/is-offline/, { timeout: 10000 });
  await firstContext.close();
  await firstApi.dispose();
  await secondApi.dispose();
});
