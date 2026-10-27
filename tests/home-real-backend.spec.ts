import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const baseURL = 'http://127.0.0.1:5187';
const password = 'Home-integration-test-password-2026';

type Account = {
  id: string;
  csrf: string;
  cookies: Awaited<ReturnType<APIRequestContext['storageState']>>['cookies'];
};

async function createAccount(api: APIRequestContext, label: string): Promise<Account> {
  const email = `home-${label}-${randomUUID()}@beatvault.test`;
  const registration = await api.post('/api/auth/register', { data: { email, password } });
  expect(registration.status(), 'account registration should reach the local API').toBe(201);

  const login = await api.post('/api/auth/login', { data: { email, password } });
  expect(login.status(), 'account login should reach the local API').toBe(200);
  const { data: user } = await login.json() as { data: { id: string } };
  const state = await api.storageState();
  const csrf = state.cookies.find(cookie => cookie.name === 'beatvault_csrf')?.value;
  expect(csrf, 'login should issue a CSRF cookie').toBeTruthy();

  const profile = await api.put('/api/profile', {
    headers: { 'x-csrf-token': csrf! },
    data: {
      displayName: `Home QA ${label}`,
      bio: '',
      location: '',
      website: '',
      instagram: '',
      genres: ['Trap'],
      coverId: '808',
      avatarId: 'initials',
      publicProfile: true,
    },
  });
  expect(profile.status(), 'profile opt-in should be persisted by the local API').toBe(200);
  return { id: user.id, csrf: csrf!, cookies: state.cookies };
}

async function applyCookies(context: BrowserContext, cookies: Account['cookies']) {
  await context.addCookies(cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    url: baseURL,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  })));
}

test('Home public posts, private visibility and social interactions persist on the real local backend', async ({ browser, playwright }) => {
  test.setTimeout(120_000);
  const firstApi = await playwright.request.newContext({ baseURL });
  const secondApi = await playwright.request.newContext({ baseURL });
  let firstContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  let first: Account | undefined;
  let publicBody = '';
  let privateBody = '';
  let liveBody = '';
  let storyBody: string;
  let storyId = '';

  try {
    first = await createAccount(firstApi, 'author');
    const second = await createAccount(secondApi, 'viewer');
    publicBody = 'Public beat idea';
    privateBody = 'Private studio note';

    firstContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await applyCookies(firstContext, first.cookies);
    await applyCookies(secondContext, second.cookies);
    const authorPage = await firstContext.newPage();
    const viewerPage = await secondContext.newPage();

    await authorPage.goto('/#/home');
    await expect(authorPage.getByLabel('¿Qué estás creando hoy?')).toBeVisible();
    const privacyTrigger = authorPage.getByRole('button', { name: 'Privacidad de la publicación: Solo yo' });
    await authorPage.evaluate(() => {
      const row = document.querySelector('.home-composer-submit-row');
      if (row) window.scrollTo(0, window.scrollY + row.getBoundingClientRect().top - 16);
    });
    await privacyTrigger.click();
    const privacyMenu = await authorPage.locator('.home-audience-menu').boundingBox();
    expect(privacyMenu).toBeTruthy();
    expect(privacyMenu!.y).toBeGreaterThanOrEqual(0);
    expect(privacyMenu!.y + privacyMenu!.height).toBeLessThanOrEqual(1000);
    await authorPage.getByRole('button', { name: 'Público' }).click();
    await authorPage.getByLabel('¿Qué estás creando hoy?').fill(publicBody);
    const publicCreate = authorPage.waitForResponse(response =>
      response.url().endsWith('/api/posts') && response.request().method() === 'POST');
    await authorPage.getByRole('button', { name: 'Publicar', exact: true }).click();
    const publicResponse = await publicCreate;
    expect(publicResponse.status()).toBe(201);
    const publicPostId = ((await publicResponse.json()).data as { id: string }).id;
    const authorPublicPost = authorPage.locator('.home-post').filter({ hasText: publicBody });
    await expect(authorPublicPost).toBeVisible();
    await expect(authorPublicPost).toContainText('Público');

    await authorPage.getByLabel('¿Qué estás creando hoy?').fill(privateBody);
    const privateCreate = authorPage.waitForResponse(response =>
      response.url().endsWith('/api/posts') && response.request().method() === 'POST');
    await authorPage.getByRole('button', { name: 'Publicar', exact: true }).click();
    const privateResponse = await privateCreate;
    expect(privateResponse.status()).toBe(201);
    const privatePostId = ((await privateResponse.json()).data as { id: string }).id;
    await expect(authorPage.locator('.home-post').filter({ hasText: privateBody })).toContainText('Solo yo');

    const feedEventResponse = viewerPage.waitForResponse(response => response.url().endsWith('/api/feed/events') && response.status() === 200);
    await viewerPage.goto('/#/home');
    await feedEventResponse;
    const composerTools = await viewerPage.locator('.home-composer-tools').boundingBox();
    const composerActions = await viewerPage.locator('.home-composer-submit-row').boundingBox();
    const audienceControl = await viewerPage.locator('.home-composer .home-audience-control').boundingBox();
    const publishButton = await viewerPage.getByRole('button', { name: 'Publicar', exact: true }).boundingBox();
    expect(composerTools && composerActions && audienceControl && publishButton).toBeTruthy();
    expect(composerTools!.y + composerTools!.height).toBeLessThanOrEqual(composerActions!.y);
    expect(audienceControl!.x + audienceControl!.width).toBeLessThanOrEqual(publishButton!.x);
    const viewerPublicPost = viewerPage.locator('.home-post').filter({ hasText: publicBody });
    await expect(viewerPublicPost).toBeVisible({ timeout: 15_000 });
    await expect(viewerPage.getByText(privateBody, { exact: false })).toHaveCount(0);

    liveBody = 'A new public post arrives live';
    await authorPage.getByRole('button', { name: 'Privacidad de la publicación: Solo yo' }).click();
    await authorPage.getByRole('button', { name: 'Público' }).click();
    await authorPage.getByLabel('¿Qué estás creando hoy?').fill(liveBody);
    const livePostResponse = authorPage.waitForResponse(response => response.url().endsWith('/api/posts') && response.request().method() === 'POST');
    await authorPage.getByRole('button', { name: 'Publicar', exact: true }).click();
    expect((await livePostResponse).status()).toBe(201);
    const newPostsPrompt = viewerPage.getByRole('button', { name: 'Hay publicaciones nuevas · Ver ahora' });
    await expect(newPostsPrompt).toBeVisible({ timeout: 10_000 });
    await newPostsPrompt.click();
    await expect(viewerPage.locator('.home-post').filter({ hasText: liveBody })).toBeVisible();

    storyBody = 'A vertical story from the studio';
    await authorPage.getByRole('button', { name: 'Crear historia' }).click();
    const storyDialog = authorPage.getByRole('dialog', { name: 'Crear historia' });
    const storyFileChooser = authorPage.waitForEvent('filechooser');
    await storyDialog.getByRole('button', { name: 'Foto' }).click();
    await (await storyFileChooser).setFiles('server/fixtures/beat-upload-cover.jpg');
    await storyDialog.getByLabel('Texto de la historia').fill(storyBody);
    await storyDialog.getByRole('button', { name: 'Privacidad de la historia: Solo yo' }).click();
    await storyDialog.getByRole('button', { name: 'Público' }).click();
    const storyResponse = authorPage.waitForResponse(response => response.url().endsWith('/api/stories') && response.request().method() === 'POST');
    await storyDialog.getByRole('button', { name: 'Compartir historia' }).click();
    const createdStoryResponse = await storyResponse;
    expect(createdStoryResponse.status()).toBe(201);
    storyId = ((await createdStoryResponse.json()).data as { id: string }).id;
    await expect(authorPage.getByRole('button', { name: 'Ver historia de Home QA author' })).toBeVisible();
    const viewerStory = viewerPage.getByRole('button', { name: 'Ver historia de Home QA author' });
    await expect(viewerStory).toBeVisible({ timeout: 10_000 });
    await viewerStory.click();
    await expect(viewerPage.getByRole('dialog', { name: 'Historias' })).toContainText(storyBody);
    await expect(viewerPage.locator('.home-post').filter({ hasText: storyBody })).toHaveCount(0);
    await viewerPage.screenshot({ path: 'artifacts/user-preview/home-mobile-story-viewer.png', fullPage: true });
    await viewerPage.getByRole('button', { name: 'Cerrar historias' }).click();

    const outsiderFeed = await secondApi.get('/api/feed');
    expect(outsiderFeed.status()).toBe(200);
    const feedPosts = ((await outsiderFeed.json()).data as { posts: Array<{ id: string; body: string }> }).posts;
    expect(feedPosts.some(post => post.id === publicPostId)).toBe(true);
    expect(feedPosts.some(post => post.id === privatePostId || post.body === privateBody)).toBe(false);

    const outsiderProfile = await secondApi.get(`/api/profiles/${first.id}/posts`);
    expect(outsiderProfile.status()).toBe(200);
    const profilePosts = ((await outsiderProfile.json()).data as { posts: Array<{ id: string; body: string }> }).posts;
    expect(profilePosts.some(post => post.id === publicPostId)).toBe(true);
    expect(profilePosts.some(post => post.id === privatePostId || post.body === privateBody)).toBe(false);
    expect((await secondApi.get(`/api/posts/${privatePostId}/social`)).status()).toBe(404);

    const commentBody = 'Sounds great, let us collab';
    await viewerPublicPost.getByPlaceholder('Escribe un comentario...').fill(commentBody);
    const commentResponsePromise = viewerPage.waitForResponse(response =>
      response.url().endsWith(`/api/posts/${publicPostId}/comments`) && response.request().method() === 'POST');
    await viewerPublicPost.getByRole('button', { name: 'Publicar comentario' }).click();
    expect((await commentResponsePromise).status()).toBe(201);
    await expect(viewerPublicPost).toContainText(commentBody);

    const reactionResponsePromise = viewerPage.waitForResponse(response =>
      response.url().endsWith(`/api/posts/${publicPostId}/reaction`) && response.request().method() === 'POST');
    await viewerPublicPost.getByRole('button', { name: 'Me gusta' }).click();
    expect((await reactionResponsePromise).status()).toBe(200);
    await expect(viewerPublicPost.getByRole('button', { name: 'Quitar me gusta' })).toHaveAttribute('aria-pressed', 'true');

    await viewerPage.reload();
    const persistedPost = viewerPage.locator('.home-post').filter({ hasText: publicBody });
    await expect(persistedPost).toBeVisible({ timeout: 15_000 });
    await expect(persistedPost).toContainText(commentBody);
    await expect(persistedPost.getByRole('button', { name: 'Quitar me gusta' })).toHaveAttribute('aria-pressed', 'true');
    await expect(viewerPage.getByText(privateBody, { exact: false })).toHaveCount(0);
    await viewerPage.screenshot({ path: 'artifacts/user-preview/home-mobile-two-account-feed.png', fullPage: true });

    const persistedInteractions = await secondApi.get(`/api/posts/${publicPostId}/social`);
    expect(persistedInteractions.status()).toBe(200);
    const interactions = (await persistedInteractions.json()).data as {
      comments: Array<{ body: string; authorId: string }>;
      reactionCount: number;
      reactedByMe: boolean;
    };
    expect(interactions.comments.some(comment => comment.body === commentBody && comment.authorId === second.id)).toBe(true);
    expect(interactions).toMatchObject({ reactionCount: 1, reactedByMe: true });

    await authorPage.reload();
    const authorPostAfterReload = authorPage.locator('.home-post').filter({ hasText: publicBody });
    await expect(authorPostAfterReload).toBeVisible({ timeout: 15_000 });
    await expect(authorPostAfterReload).toContainText(commentBody);
    await expect(authorPostAfterReload.getByRole('button', { name: 'Me gusta', exact: true })).toHaveAttribute('aria-pressed', 'false');
    const authorInteractions = await firstApi.get(`/api/posts/${publicPostId}/social`);
    expect(authorInteractions.status()).toBe(200);
    const authorInteractionData = (await authorInteractions.json()).data as {
      comments: Array<{ body: string; authorId: string }>;
      reactionCount: number;
      reactedByMe: boolean;
    };
    expect(authorInteractionData.comments.some(comment => comment.body === commentBody && comment.authorId === second.id)).toBe(true);
    expect(authorInteractionData).toMatchObject({ reactionCount: 1, reactedByMe: false });
    await authorPage.screenshot({ path: 'artifacts/user-preview/home-desktop-published-posts.png', fullPage: true });

    await authorPage.goto('/#/profile');
    await expect(authorPage.getByRole('tab', { name: 'Publicaciones' })).toBeVisible();
    await expect(authorPage.getByRole('heading', { name: 'Tus publicaciones' })).toBeVisible();
    const authorProfilePost = authorPage.locator('.producer-post').filter({ hasText: publicBody });
    await expect(authorProfilePost).toBeVisible();
    await expect(authorProfilePost).toContainText(commentBody);
    await expect(authorPage.locator('.producer-post').filter({ hasText: privateBody })).toBeVisible();
  } finally {
    if (first) {
      if (storyId) await firstApi.delete(`/api/stories/${storyId}`, { headers: { 'x-csrf-token': first.csrf } }).catch(() => undefined);
      const ownPosts = await firstApi.get(`/api/profiles/${first.id}/posts`).catch(() => undefined);
      if (ownPosts?.ok()) {
        const posts = ((await ownPosts.json()).data as { posts: Array<{ id: string; body: string }> }).posts;
        for (const post of posts.filter(item => item.body === publicBody || item.body === privateBody || item.body === liveBody)) {
          await firstApi.delete(`/api/posts/${post.id}`, { headers: { 'x-csrf-token': first.csrf } }).catch(() => undefined);
        }
      }
    }
    await secondContext?.close();
    await firstContext?.close();
    await secondApi.dispose();
    await firstApi.dispose();
  }
});
