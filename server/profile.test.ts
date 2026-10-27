// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auth, server } from './index';
import { emptyProfile } from '../src/domains/profile';
import { validateProfile } from './profile';
import { LocalRepository } from './store';
import sharp from 'sharp';

describe('creator profile privacy and persistence', () => {
  let base = '';
  let owner: Record<string, string>, other: Record<string, string>, ownerId = '';
  const { accountId: _id, ...input } = emptyProfile('');
  const data = { ...input, displayName: 'Studio Seven', bio: 'Original beats', location: 'Ciudad de Mexico', website: 'https://example.com', instagram: '@studio.seven', genres: ['Trap', 'Trap'] };
  const call = (path: string, init?: RequestInit) => fetch(base + path, init);
  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
    base = `http://127.0.0.1:${address.port}`;
    async function account(email: string) {
      const account = await auth.register(email, 'temporary-test-password');
      const result = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'temporary-test-password' }) });
      const cookies = result.headers.getSetCookie();
      return { account, headers: { 'content-type': 'application/json', cookie: cookies.map(c => c.split(';')[0]).join('; '), 'x-csrf-token': cookies[1].split(';')[0].split('=')[1] } };
    }
    const a = await account('profile-owner@test.local'); ownerId = a.account.id; owner = a.headers;
    other = (await account('profile-other@test.local')).headers;
  });
  afterAll(async () => { await auth.clearSessions(); await new Promise<void>(resolve => server.close(() => resolve())); });
  it('requires auth and CSRF for profile writes', async () => {
    expect((await call('/api/profile')).status).toBe(401);
    expect((await call('/api/profile', { method: 'PUT', headers: { ...owner, 'x-csrf-token': '' }, body: JSON.stringify(data) })).status).toBe(403);
  });
  it('persists only self-owned metadata without altering account authorization', async () => {
    const before = await (await call('/api/auth/me', { headers: owner })).json();
    const response = await call('/api/profile', { method: 'PUT', headers: owner, body: JSON.stringify(data) });
    expect(response.status).toBe(200);
    const profile = (await response.json()).data;
    expect(profile).toMatchObject({ accountId: ownerId, displayName: 'Studio Seven', instagram: 'studio.seven', genres: ['Trap'] });
    expect(profile.packageBadges).toEqual([]);
    const editableProfile = { ...profile };
    delete editableProfile.packageBadges;
    expect(await new LocalRepository().findProfile(ownerId)).toEqual(editableProfile);
    expect((await (await call('/api/auth/me', { headers: owner })).json()).data).toEqual(before.data);
    expect((await call(`/api/profiles/${ownerId}`)).status).toBe(404);
    expect((await call(`/api/profiles/${ownerId}`, { headers: other })).status).toBe(404);
    expect((await (await call('/api/profile', { headers: other })).json()).data.displayName).toBe('Productor');
  });
  it('rejects spoofed owner, role, verification and unsafe links', async () => {
    for (const patch of [{ accountId: ownerId }, { role: 'admin' }, { email: 'other@example.com' }, { verificationState: 'verified' }, { website: 'javascript:alert(1)' }, { website: 'https://user:password@example.com' }, { coverId: 'https://example.com' }]) {
      const response = await call('/api/profile', { method: 'PUT', headers: other, body: JSON.stringify({ ...data, ...patch }) });
      expect(response.status).toBe(400);
    }
    expect((await call(`/api/profiles/${ownerId}`, { method: 'PUT', headers: other, body: JSON.stringify(data) })).status).toBe(404);
  });
  it('exposes only opt-in public metadata and revokes access when made private', async () => {
    await call('/api/profile', { method: 'PUT', headers: owner, body: JSON.stringify({ ...data, publicProfile: true }) });
    const response = await call(`/api/profiles/${ownerId}`);
    expect(response.status).toBe(200);
    const profile = (await response.json()).data;
    for (const key of ['email', 'role', 'passwordHash', 'verificationState']) expect(profile).not.toHaveProperty(key);
    await call('/api/profile', { method: 'PUT', headers: owner, body: JSON.stringify(data) });
    expect((await call(`/api/profiles/${ownerId}`)).status).toBe(404);
  });
  it('uploads optimized profile images and serves them only to profile visitors after opt-in', async () => {
    const bytes = await sharp(await readFile(resolve(process.cwd(), 'server/fixtures/beat-upload-cover-qa.jpg'))).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const privateImage = `/api/profile/images/avatar`;
    expect((await call(privateImage, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array(bytes) })).status).toBe(401);
    expect((await call(privateImage, { method: 'POST', headers: { ...owner, 'x-csrf-token': '', 'content-type': 'image/jpeg' }, body: new Uint8Array(bytes) })).status).toBe(403);
    expect((await call(`/api/profiles/${ownerId}/images/avatar`, { method: 'POST', headers: { ...other, 'content-type': 'image/jpeg' }, body: new Uint8Array(bytes) })).status).toBe(404);
    const invalid = await call(privateImage, { method: 'POST', headers: { ...owner, 'content-type': 'image/png' }, body: new Uint8Array(bytes) });
    expect(invalid.status).toBe(400);

    const preflight = await call(privateImage, { method: 'OPTIONS', headers: { origin: 'http://localhost', 'access-control-request-headers': 'x-profile-focal-point' } });
    expect(preflight.headers.get('access-control-allow-headers')).toContain('X-Profile-Focal-Point');
    const uploaded = await call(privateImage, { method: 'POST', headers: { ...owner, 'content-type': 'image/jpeg', 'x-profile-focal-point': '24,68' }, body: new Uint8Array(bytes) });
    expect(uploaded.status, await uploaded.clone().text()).toBe(200);
    const uploadedProfile = (await uploaded.json()).data;
    expect(uploadedProfile).toMatchObject({ avatarId: 'custom', avatarUrl: `/api/profiles/${ownerId}/images/avatar/thumbnail`, avatarFocalPoint: { x: 24, y: 68 } });
    expect(uploadedProfile).not.toHaveProperty('avatarImage');
    const privateThumb = await call(uploadedProfile.avatarUrl, { headers: owner });
    expect(privateThumb.status).toBe(200);
    expect(privateThumb.headers.get('content-type')).toBe('image/webp');
    expect((await call(uploadedProfile.avatarUrl, { headers: { cookie: other.cookie } })).status).toBe(404);
    expect((await call(uploadedProfile.avatarUrl)).status).toBe(404);

    const invalidFocalPoint = await call('/api/profile/images/cover', { method: 'POST', headers: { ...owner, 'content-type': 'image/jpeg', 'x-profile-focal-point': '150,50' }, body: new Uint8Array(bytes) });
    expect(invalidFocalPoint.status).toBe(400);
    const uploadedCover = await call('/api/profile/images/cover', { method: 'POST', headers: { ...owner, 'content-type': 'image/jpeg', 'x-profile-focal-point': '74,36' }, body: new Uint8Array(bytes) });
    expect(uploadedCover.status, await uploadedCover.clone().text()).toBe(200);
    expect((await uploadedCover.json()).data).toMatchObject({ coverId: 'custom', coverUrl: `/api/profiles/${ownerId}/images/cover/thumbnail`, coverFocalPoint: { x: 74, y: 36 } });

    await call('/api/profile', { method: 'PUT', headers: owner, body: JSON.stringify({ ...data, avatarId: 'custom', coverId: 'custom', publicProfile: true }) });
    const publicProfileResponse = await call(`/api/profiles/${ownerId}`);
    expect(publicProfileResponse.status).toBe(200);
    const publicProfile = (await publicProfileResponse.json()).data;
    expect(publicProfile.avatarUrl).toBe(uploadedProfile.avatarUrl);
    expect(publicProfile.coverUrl).toBe(`/api/profiles/${ownerId}/images/cover/thumbnail`);
    expect(publicProfile).toMatchObject({ avatarFocalPoint: { x: 24, y: 68 }, coverFocalPoint: { x: 74, y: 36 } });
    expect(publicProfile).not.toHaveProperty('avatarImage');
    expect((await call(publicProfile.avatarUrl)).status).toBe(200);
    const publicOriginal = await call(publicProfile.avatarUrl.replace('/thumbnail', ''));
    expect(publicOriginal.headers.get('content-type')).toBe('image/jpeg');
    const normalizedMetadata = await sharp(Buffer.from(await publicOriginal.arrayBuffer())).metadata();
    expect(normalizedMetadata.exif).toBeUndefined();
    expect(normalizedMetadata.orientation).toBeUndefined();

    const friendEmail = `profile-friend-${randomUUID()}@test.local`;
    const friendAccount = await auth.register(friendEmail, 'temporary-test-password');
    const friendSession = await auth.login(friendEmail, 'temporary-test-password');
    expect(friendSession).toBeTruthy();
    const friendHeaders = { cookie: `beatvault_session=${friendSession!.token}` };
    const friendships = new LocalRepository();
    const relation = await friendships.createFriendship({ id: randomUUID(), requesterId: ownerId, recipientId: friendAccount.id, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await friendships.updateFriendship(relation.id, friendAccount.id, 'accepted');
    await call('/api/profile', { method: 'PUT', headers: owner, body: JSON.stringify({ ...data, avatarId: 'custom', coverId: 'custom', publicProfile: false }) });
    const privateOwnerProfile = (await (await call('/api/profile', { headers: owner })).json()).data;
    expect(privateOwnerProfile).toMatchObject({ location: 'Ciudad de Mexico', website: 'https://example.com', instagram: 'studio.seven', publicProfile: false });
    const friendProfileResponse = await call(`/api/profiles/${ownerId}`, { headers: friendHeaders });
    expect(friendProfileResponse.status).toBe(200);
    const friendProfile = (await friendProfileResponse.json()).data;
    expect(friendProfile).toMatchObject({ accountId: ownerId, displayName: 'Studio Seven', bio: 'Original beats', genres: ['Trap'], avatarUrl: `/api/profiles/${ownerId}/images/avatar/thumbnail`, coverUrl: `/api/profiles/${ownerId}/images/cover/thumbnail`, location: '', website: '', instagram: '', publicProfile: false });
    expect(friendProfile).not.toHaveProperty('packageBadges');
    for (const key of ['email', 'role', 'passwordHash', 'verificationState', 'avatarImage', 'coverImage']) expect(friendProfile).not.toHaveProperty(key);
    expect((await call(`/api/profiles/${ownerId}`, { headers: other })).status).toBe(404);
    expect((await call(friendProfile.avatarUrl, { headers: friendHeaders })).status).toBe(200);
    expect((await call(friendProfile.coverUrl, { headers: friendHeaders })).status).toBe(200);
    expect((await call(friendProfile.avatarUrl.replace('/thumbnail', ''), { headers: friendHeaders })).status).toBe(404);
    expect((await call(friendProfile.coverUrl.replace('/thumbnail', ''), { headers: friendHeaders })).status).toBe(404);
    expect((await call(friendProfile.avatarUrl, { headers: other })).status).toBe(404);
    expect((await call(publicProfile.avatarUrl.replace('/thumbnail', ''), { headers: owner })).status).toBe(200);
    await friendships.deleteFriendship(relation.id, friendAccount.id, 'accepted');
    expect((await call(`/api/profiles/${ownerId}`, { headers: friendHeaders })).status).toBe(404);
    expect((await call(friendProfile.avatarUrl, { headers: friendHeaders })).status).toBe(404);
    expect((await call(friendProfile.coverUrl, { headers: friendHeaders })).status).toBe(404);

    await call('/api/profile', { method: 'PUT', headers: owner, body: JSON.stringify(data) });
    expect((await call(publicProfile.avatarUrl)).status).toBe(404);
    expect((await new LocalRepository().findProfile(ownerId))?.avatarImage).toBeUndefined();
  });
  it('normalizes actual WebP and AVIF profile uploads while keeping their proportions', async () => {
    const email = `profile-formats-${randomUUID()}@test.local`;
    await auth.register(email, 'temporary-test-password');
    const session = await auth.login(email, 'temporary-test-password');
    expect(session).toBeTruthy();
    const formatOwner = { cookie: `beatvault_session=${session!.token}`, 'x-csrf-token': session!.csrfToken };
    for (const format of ['webp', 'avif'] as const) {
      const bytes = await sharp({ create: { width: 960, height: 640, channels: 3, background: '#336699' } })[format]().toBuffer();
      const result = await call('/api/profile/images/cover', { method: 'POST', headers: { ...formatOwner, 'content-type': `image/${format}` }, body: new Uint8Array(bytes) });
      expect(result.status, await result.clone().text()).toBe(200);
      const profile = (await result.json()).data;
      const original = await call(profile.coverUrl.replace('/thumbnail', ''), { headers: formatOwner });
      expect(original.status).toBe(200);
      const metadata = await sharp(Buffer.from(await original.arrayBuffer())).metadata();
      expect(metadata).toMatchObject({ format: 'jpeg', width: 960, height: 640 });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
    }
  });
  it('validates lengths, genres and boolean visibility', () => {
    expect(_id).toBe('');
    for (const patch of [{ displayName: '' }, { bio: 'x'.repeat(321) }, { genres: Array(9).fill('Trap') }, { publicProfile: 'yes' }, { avatarFocalPoint: { x: 101, y: 50 } }, { coverFocalPoint: { x: 50.5, y: 50 } }, { coverFocalPoint: { x: 50, y: 50, scale: 2 } }]) expect(() => validateProfile({ ...data, ...patch })).toThrow();
    expect(validateProfile({ ...data, avatarFocalPoint: { x: 0, y: 100 } })).toMatchObject({ avatarFocalPoint: { x: 0, y: 100 } });
  });
});
