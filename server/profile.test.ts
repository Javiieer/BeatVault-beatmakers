// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, server } from './index';
import { emptyProfile } from '../src/domains/profile';
import { validateProfile } from './profile';
import { LocalRepository } from './store';

describe('creator profile privacy and persistence', () => {
  let base = '';
  let owner: Record<string, string>, other: Record<string, string>, ownerId = '';
  const { accountId: _id, ...input } = emptyProfile('');
  const data = { ...input, displayName: 'Studio Seven', bio: 'Original beats', website: 'https://example.com', instagram: '@studio.seven', genres: ['Trap', 'Trap'] };
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
  afterAll(async () => { auth.clearSessions(); await new Promise<void>(resolve => server.close(() => resolve())); });
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
    expect(await new LocalRepository().findProfile(ownerId)).toEqual(profile);
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
  it('validates lengths, genres and boolean visibility', () => {
    expect(_id).toBe('');
    for (const patch of [{ displayName: '' }, { bio: 'x'.repeat(321) }, { genres: Array(9).fill('Trap') }, { publicProfile: 'yes' }]) expect(() => validateProfile({ ...data, ...patch })).toThrow();
  });
});
