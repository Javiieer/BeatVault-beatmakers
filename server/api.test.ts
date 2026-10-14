import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { auth, server } from './index'
import { createRepository } from './repository'
import { bootstrapAdmin } from './bootstrap'
import { config } from './config'
describe('local API routes', () => {
 let origin = ''; let cookie = ''
 beforeAll(async () => { await auth.initialize(); await new Promise<void>(resolve => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('no address'); origin = `http://localhost:${address.port}` })
 afterAll(() => server.close())
  it('serves public health, catalog, and validates marketplace filters', async () => {
    expect((await fetch(`${origin}/api/health`)).status).toBe(200)
    expect((await fetch(`${origin}/api/catalog`)).status).toBe(200)
    expect((await fetch(`${origin}/api/marketplace?type=beat&limit=24`)).status).toBe(200)
    expect((await fetch(`${origin}/api/marketplace?type=admin`)).status).toBe(400)
  })
  it('reports storage usage only to the signed-in account', async () => {
    expect((await fetch(`${origin}/api/account/storage`)).status).toBe(401)
    const session = await auth.login('demo@beatvault.local', 'local-demo-password')
    expect(session).toBeTruthy()
    const accountCookie = `beatvault_session=${session!.token}`
    const usage = await fetch(`${origin}/api/account/storage`, { headers: { cookie: accountCookie } })
    expect(usage.status).toBe(200)
    expect(await usage.json()).toMatchObject({ ok: true, data: { limitBytes: 5 * 1024 ** 3, quotaSource: 'plan', planId: 'free' } })
  })
  it('keeps Stripe Connect unavailable until test credentials and webhooks are configured', async () => {
    expect((await fetch(`${origin}/api/connect/account`)).status).toBe(401)
    const session = await auth.login('demo@beatvault.local', 'local-demo-password')
    expect(session).toBeTruthy()
    const status = await fetch(`${origin}/api/connect/account`, { headers: { cookie: `beatvault_session=${session!.token}` } })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ data: { enabled: false, connected: false, payoutsEnabled: false } })
    expect((await fetch(`${origin}/api/webhooks/stripe`, { method: 'POST', body: '{}' })).status).toBe(503)
    expect((await fetch(`${origin}/api/orders`)).status).toBe(401)
    expect((await fetch(`${origin}/api/checkout/beats/${randomUUID()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerId: 'license' }) })).status).toBe(401)
  })
  it('exposes account storage usage to administrators only', async () => {
    expect((await fetch(`${origin}/api/admin/storage`)).status).toBe(401)
    const creator = await auth.login('demo@beatvault.local', 'local-demo-password')
    expect(creator).toBeTruthy()
    expect((await fetch(`${origin}/api/admin/storage`, { headers: { cookie: `beatvault_session=${creator!.token}` } })).status).toBe(403)
    const runtime = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `storage-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminData = await bootstrapAdmin(env, runtime.repository)
    await runtime.close()
    const adminSession = await auth.login(adminData.email, 'A-strong-admin-password')
    expect(adminSession).toBeTruthy()
    const response = await fetch(`${origin}/api/admin/storage`, { headers: { cookie: `beatvault_session=${adminSession!.token}` } })
    expect(response.status).toBe(200)
    const data = (await response.json() as { data: Array<{ id: string; email: string; role: string; usedBytes: number; storedBytes: number; previewBytes: number; originalCount: number; previewCount: number }> }).data
    expect(data.length).toBeGreaterThan(0)
    expect(data.every(item => typeof item.id === 'string' && typeof item.email === 'string' && Number.isSafeInteger(item.usedBytes) && Number.isSafeInteger(item.storedBytes) && item.storedBytes >= item.usedBytes && item.previewBytes >= 0 && item.originalCount >= 0 && item.previewCount >= 0)).toBe(true)
    expect(data.map(item => item.usedBytes)).toEqual([...data].map(item => item.usedBytes).sort((a, b) => b - a))
  })
  it('lets admins assign and remove an account storage limit with CSRF protection', async () => {
    const email = `quota-user-${randomUUID()}@test.local`
    const password = 'Account-quota-password'
    await auth.register(email, password)
    const creator = await auth.login(email, password)
    expect(creator).toBeTruthy()
    const runtime = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `quota-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminData = await bootstrapAdmin(env, runtime.repository)
    await runtime.close()
    const admin = await auth.login(adminData.email, 'A-strong-admin-password')
    expect(admin).toBeTruthy()
    const endpoint = `${origin}/api/admin/accounts/${creator!.id}/storage-quota`
    const headers = { cookie: `beatvault_session=${admin!.token}`, 'x-csrf-token': admin!.csrfToken, 'content-type': 'application/json' }
    expect((await fetch(endpoint, { method: 'PATCH', headers: { cookie: headers.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ limitBytes: 4096 }) })).status).toBe(403)
    expect((await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ limitBytes: 0 }) })).status).toBe(400)
    const set = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ limitBytes: 4096 }) })
    expect(set.status).toBe(200)
    await expect((await fetch(`${origin}/api/account/storage`, { headers: { cookie: `beatvault_session=${creator!.token}` } })).json()).resolves.toMatchObject({ data: { limitBytes: 4096, availableBytes: 4096, quotaSource: 'account' } })
    const listed = await fetch(`${origin}/api/admin/storage`, { headers: { cookie: headers.cookie } }).then(value => value.json()) as { data: Array<{ id: string; customQuotaBytes: number | null }> }
    expect(listed.data.find(item => item.id === creator!.id)?.customQuotaBytes).toBe(4096)
    expect((await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ limitBytes: null }) })).status).toBe(200)
    const cleared = await fetch(`${origin}/api/account/storage`, { headers: { cookie: `beatvault_session=${creator!.token}` } }).then(value => value.json()) as { data: { limitBytes: number | null; quotaSource: string } }
    expect(cleared.data).toMatchObject({ limitBytes: 5 * 1024 ** 3, quotaSource: 'plan' })
  })
  it('assigns packages through admin and applies configured package storage server-side', async () => {
    const previousLimit = config.planStorageBytes.creator
    config.planStorageBytes.creator = 8192
    try {
      const email = `plan-user-${randomUUID()}@test.local`
      const password = 'Account-plan-password'
      await auth.register(email, password)
      const creator = await auth.login(email, password)
      expect(creator).toBeTruthy()
      const runtime = createRepository()
      const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `plan-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
      const adminData = await bootstrapAdmin(env, runtime.repository)
      await runtime.close()
      const admin = await auth.login(adminData.email, 'A-strong-admin-password')
      expect(admin).toBeTruthy()
      const endpoint = `${origin}/api/admin/accounts/${creator!.id}/plan`
      const headers = { cookie: `beatvault_session=${admin!.token}`, 'x-csrf-token': admin!.csrfToken, 'content-type': 'application/json' }
      expect((await fetch(endpoint, { method: 'PATCH', headers: { cookie: headers.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ planId: 'creator' }) })).status).toBe(403)
      expect((await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ planId: 'unknown' }) })).status).toBe(400)
      expect((await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ planId: 'creator' }) })).status).toBe(200)
      await expect((await fetch(`${origin}/api/account/plan`, { headers: { cookie: `beatvault_session=${creator!.token}` } })).json()).resolves.toMatchObject({ data: { planId: 'creator', plan: { storageLimitBytes: 8192 }, billing: 'disabled' } })
      await expect((await fetch(`${origin}/api/account/storage`, { headers: { cookie: `beatvault_session=${creator!.token}` } })).json()).resolves.toMatchObject({ data: { limitBytes: 8192, quotaSource: 'plan', planId: 'creator' } })
      const profile = { displayName: 'Plan QA', bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'lo-fi', avatarId: 'initials', publicProfile: true }
      const profileResponse = await fetch(`${origin}/api/profile`, { method: 'PUT', headers: { cookie: `beatvault_session=${creator!.token}`, 'x-csrf-token': creator!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify(profile) })
      expect((await profileResponse.json() as { data: { packageBadges: string[] } }).data.packageBadges).toEqual([])
      await auth.recordVerifiedPlanPurchase(creator!.id, 'creator')
      const publicProfile = await fetch(`${origin}/api/profiles/${creator!.id}`)
      expect((await publicProfile.json() as { data: { packageBadges: string[] } }).data.packageBadges).toEqual(['creator'])
      await auth.assignPlan(creator!.id, 'studio')
      expect((await fetch(`${origin}/api/profiles/${creator!.id}`).then(response => response.json()) as { data: { packageBadges: string[] } }).data.packageBadges).toEqual(['creator'])
      await runtime.repository.setStorageQuota(creator!.id, 4096, admin!.id)
      await expect((await fetch(`${origin}/api/account/storage`, { headers: { cookie: `beatvault_session=${creator!.token}` } })).json()).resolves.toMatchObject({ data: { limitBytes: 4096, quotaSource: 'account' } })
    } finally {
      config.planStorageBytes.creator = previousLimit
    }
  })
  it('authenticates, uses the session owner, and logs out', async () => { const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@beatvault.local', password: 'local-demo-password' }) }); expect(login.status).toBe(200); const headers = login.headers.getSetCookie(); expect(headers[0]).toContain('HttpOnly'); cookie = headers[0].split(';')[0]; const csrf = headers[1].split(';')[0].split('=')[1]; expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(200); const created = await fetch(`${origin}/api/projects`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ ownerId: 'attacker', title: `Session project ${Date.now()}` }) }); expect(created.status).toBe(201); const result = await created.json() as { data: { ownerId: string } }; expect(result.data.ownerId).toBe('local-demo'); await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } }); expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(401) })
  it('protects project routes, CSRF, and payloads', async () => { expect((await fetch(`${origin}/api/projects`)).status).toBe(401); const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@beatvault.local', password: 'local-demo-password' }) }); const parts = login.headers.getSetCookie(); cookie = parts[0].split(';')[0]; const csrf = parts[1].split(';')[0].split('=')[1]; expect((await fetch(`${origin}/api/projects`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })).status).toBe(403); const response = await fetch(`${origin}/api/projects`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: '{}' }); expect(response.status).toBe(400) })
  it('requires reauthentication to change account email and password', async () => {
    const originalEmail = `settings-${randomUUID()}@test.local`
    const password = 'Initial-settings-password'
    const nextPassword = 'Updated-settings-password'
    const registered = await fetch(`${origin}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: originalEmail, password }) })
    expect(registered.status).toBe(201)
    const session = await auth.login(originalEmail, password)
    expect(session).toBeTruthy()
    const otherSession = await auth.login(originalEmail, password)
    expect(otherSession).toBeTruthy()
    const accountCookie = `beatvault_session=${session!.token}`; const csrf = session!.csrfToken
    const change = (path: string, body: Record<string, string>) => fetch(`${origin}/api/auth/${path}`, { method: 'POST', headers: { cookie: accountCookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect((await change('email-change', { email: `changed-${originalEmail}`, currentPassword: 'wrong-password' })).status).toBe(401)
    const email = await change('email-change', { email: `changed-${originalEmail}`, currentPassword: password })
    expect(email.status).toBe(200)
    expect((await email.json() as { data: { email: string; verificationState: string } }).data).toMatchObject({ email: `changed-${originalEmail}`, verificationState: 'unverified' })
    expect((await change('password-change', { currentPassword: 'wrong-password', password: nextPassword })).status).toBe(401)
    expect((await change('password-change', { currentPassword: password, password: nextPassword })).status).toBe(200)
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie: accountCookie } })).status).toBe(200)
    expect(await auth.accountFor(session!.token)).toBeTruthy()
    expect(await auth.accountFor(otherSession!.token)).toBeUndefined()
    expect(await auth.login(`changed-${originalEmail}`, nextPassword)).toBeTruthy()
  })
  it('creates catalog metadata for the session owner', async () => {
    expect((await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
    const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@beatvault.local', password: 'local-demo-password' }) })
    const parts = login.headers.getSetCookie(); cookie = parts[0].split(';')[0]; const csrf = parts[1].split(';')[0].split('=')[1]
    const created = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Loop ${Date.now()}`, type: 'Beat', tagIds: ['dark'], ownerId: 'attacker' }) })
    expect(created.status).toBe(400)
    const valid = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Loop ${Date.now()}`, type: 'Beat', tagIds: ['dark'] }) })
    expect(valid.status).toBe(201)
    const payload = await valid.json() as { data: { creatorId: string; contentId: string } }
    expect(payload.data.creatorId).toBe('local-demo')
    expect((await fetch(`${origin}/api/catalog/${payload.data.contentId}`, { method: 'DELETE', headers: { cookie, 'x-csrf-token': csrf } })).status).toBe(200)
  })
  it('saves private owner-scoped beat sale preparation with server-controlled USD and draft state', async () => {
    const register = async (kind: string) => {
      const email = `listing-${kind}-${randomUUID()}@test.local`
      const password = 'Listing-draft-password'
      expect((await auth.register(email, password)).id).toBeTruthy()
      const session = await auth.login(email, password)
      expect(session).toBeTruthy()
      return { id: session!.id, cookie: `beatvault_session=${session!.token}`, csrf: session!.csrfToken }
    }
    const owner = await register('owner')
    expect((await fetch(`${origin}/api/seller/beat-listings`)).status).toBe(401)
    const headers = { cookie: owner.cookie, 'x-csrf-token': owner.csrf, 'content-type': 'application/json' }
    const created = await fetch(`${origin}/api/catalog`, { method: 'POST', headers, body: JSON.stringify({ type: 'beat', title: `Offer beat ${randomUUID()}`, tagIds: ['rnb'] }) })
    expect(created.status).toBe(201)
    const beatId = (await created.json() as { data: { contentId: string } }).data.contentId
    const input = { description: 'Warm keys and drums with space for an artist vocal.', genre: 'R&B', bpm: 88, explicitContent: false, rights: { sellerCompositionShareBps: 7000, sellerMasterShareBps: 8000, sampleDisclosure: 'licensed', sampleSource: 'Cleared sample library', sampleProofAvailable: true, declarationAccepted: true, collaborators: [{ name: 'Co-producer', role: 'Producer', compositionShareBps: 3000, masterShareBps: 2000 }] }, offers: [{ id: 'standard', label: 'Standard WAV', amountMinor: 3900, currency: 'USD', deliverables: ['wav'], usageSummary: 'Non-exclusive use terms need legal review.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }] }
    const endpoint = `${origin}/api/seller/beat-listings/${beatId}`
    expect((await fetch(endpoint, { method: 'PUT', headers: { cookie: owner.cookie, 'content-type': 'application/json' }, body: JSON.stringify(input) })).status).toBe(403)
    expect((await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ ...input, ownerId: 'forged-owner' }) })).status).toBe(400)
    expect((await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ ...input, rights: { ...input.rights, sellerCompositionShareBps: 10100 } }) })).status).toBe(400)
    const savedResponse = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(input) })
    expect(savedResponse.status).toBe(201)
    const saved = (await savedResponse.json() as { data: Record<string, unknown> }).data
    expect(saved).toMatchObject({ contentId: beatId, ownerId: owner.id, currency: 'USD', status: 'draft-only', rightsDeclarationVersion: 'rights-intake-v1', offers: [{ amountMinor: 3900, termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }] })
    expect(typeof saved.rightsDeclarationAcceptedAt).toBe('string')
    expect((await fetch(`${origin}/api/seller/beat-listings`, { headers: { cookie: owner.cookie } }).then(response => response.json()) as { data: Array<{ contentId: string }> }).data).toEqual([expect.objectContaining({ contentId: beatId })])
    const other = await register('other')
    expect((await fetch(`${origin}/api/seller/beat-listings`, { headers: { cookie: other.cookie } }).then(response => response.json()) as { data: unknown[] }).data).toEqual([])
    expect((await fetch(endpoint, { headers: { cookie: other.cookie } })).status).toBe(404)
    const oneShot = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'sample', title: `One shot ${randomUUID()}`, tagIds: ['fx'] }) })
    const oneShotId = (await oneShot.json() as { data: { contentId: string } }).data.contentId
    expect((await fetch(`${origin}/api/seller/beat-listings/${oneShotId}`, { method: 'PUT', headers, body: JSON.stringify(input) })).status).toBe(404)
  })
  it('keeps creator discovery private and enforces the friend-request lifecycle', async () => {
    const signUp = async (label: string) => {
      const email = `friends-${label}-${randomUUID()}@test.local`
      const password = 'Temporary-friends-password'
      const registered = await fetch(`${origin}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
      expect(registered.status).toBe(201)
      const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
      expect(login.status).toBe(200)
      const parts = login.headers.getSetCookie()
      return { id: ((await login.json()) as { data: { id: string } }).data.id, cookie: parts[0].split(';')[0], csrf: parts[1].split(';')[0].split('=')[1], email }
    }
    const first = await signUp('first')
    const second = await signUp('second')
    const profile = (displayName: string) => ({ displayName, bio: 'Beats and samples', location: '', website: '', instagram: '', genres: ['Trap'], coverId: '808', avatarId: 'initials', publicProfile: true })
    for (const [account, name] of [[first, 'Northside'], [second, 'Southside']] as const) {
      const saved = await fetch(`${origin}/api/profile`, { method: 'PUT', headers: { cookie: account.cookie, 'x-csrf-token': account.csrf, 'content-type': 'application/json' }, body: JSON.stringify(profile(name)) })
      expect(saved.status).toBe(200)
    }
    const directoryResponse = await fetch(`${origin}/api/creators?q=South`, { headers: { cookie: first.cookie } })
    expect(directoryResponse.status).toBe(200)
    const directory = (await directoryResponse.json() as { data: Array<Record<string, unknown>> }).data
    expect(directory).toHaveLength(1)
    expect(directory[0]).toMatchObject({ accountId: second.id, displayName: 'Southside' })
    expect(directory[0]).not.toHaveProperty('email')
    const sent = await fetch(`${origin}/api/friend-requests`, { method: 'POST', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ targetId: second.id }) })
    expect(sent.status).toBe(201)
    const request = (await sent.json() as { data: { id: string } }).data
    const reversed = await fetch(`${origin}/api/friend-requests`, { method: 'POST', headers: { cookie: second.cookie, 'x-csrf-token': second.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ targetId: first.id }) })
    expect(reversed.status).toBe(409)
    expect((await (await fetch(`${origin}/api/friends`, { headers: { cookie: second.cookie } })).json() as { data: { incoming: unknown[] } }).data.incoming).toHaveLength(1)
    const forbiddenAccept = await fetch(`${origin}/api/friend-requests/${request.id}/accept`, { method: 'POST', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf } })
    expect(forbiddenAccept.status).toBe(404)
    const accepted = await fetch(`${origin}/api/friend-requests/${request.id}/accept`, { method: 'POST', headers: { cookie: second.cookie, 'x-csrf-token': second.csrf } })
    expect(accepted.status).toBe(200)
    const connections = (await (await fetch(`${origin}/api/friends`, { headers: { cookie: first.cookie } })).json() as { data: { friends: Array<{ id: string; profile: { accountId: string } }> } }).data.friends
    expect(connections).toHaveLength(1)
    expect(connections[0].profile.accountId).toBe(second.id)
    const unauthorizedSend = await fetch(`${origin}/api/chat/conversations/${second.id}/messages`, { method: 'POST', headers: { cookie: first.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Hola' }) })
    expect(unauthorizedSend.status).toBe(403)
    const liveController = new AbortController()
    const liveResponse = await fetch(`${origin}/api/chat/events`, { headers: { cookie: second.cookie }, signal: liveController.signal })
    expect(liveResponse.status).toBe(200)
    const liveReader = liveResponse.body!.getReader()
    const connected = await liveReader.read()
    expect(new TextDecoder().decode(connected.value)).toContain(': connected')
    const sentMessage = await fetch(`${origin}/api/chat/conversations/${second.id}/messages`, { method: 'POST', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Hablemos de ese beat.' }) })
    expect(sentMessage.status).toBe(201)
    const message = (await sentMessage.json() as { data: { id: string; senderId: string; body: string } }).data
    expect(message).toMatchObject({ senderId: first.id, body: 'Hablemos de ese beat.' })
    const liveEvent = new TextDecoder().decode((await liveReader.read()).value)
    expect(liveEvent).toContain('"type":"message"')
    expect(liveEvent).toContain(`"peerId":"${first.id}"`)
    liveController.abort()
    await liveReader.cancel().catch(() => undefined)
    const inbox = (await (await fetch(`${origin}/api/chat/conversations`, { headers: { cookie: second.cookie } })).json() as { data: Array<{ peerId: string; unreadCount: number; lastMessage: { id: string } }> }).data
    expect(inbox).toContainEqual(expect.objectContaining({ peerId: first.id, unreadCount: 1, lastMessage: expect.objectContaining({ id: message.id, senderId: first.id }) }))
    const thread = (await (await fetch(`${origin}/api/chat/conversations/${first.id}/messages`, { headers: { cookie: second.cookie } })).json() as { data: Array<{ id: string; readAt?: string }> }).data
    expect(thread.find(item => item.id === message.id)).not.toHaveProperty('readAt')
    expect((await fetch(`${origin}/api/chat/conversations/${first.id}/read`, { method: 'POST', headers: { cookie: second.cookie } })).status).toBe(403)
    const readResponse = await fetch(`${origin}/api/chat/conversations/${first.id}/read`, { method: 'POST', headers: { cookie: second.cookie, 'x-csrf-token': second.csrf } })
    expect(readResponse.status).toBe(200)
    expect((await readResponse.json() as { data: { updated: number } }).data.updated).toBe(1)
    const readThread = (await (await fetch(`${origin}/api/chat/conversations/${first.id}/messages`, { headers: { cookie: second.cookie } })).json() as { data: Array<{ id: string; readAt?: string }> }).data
    expect(readThread).toContainEqual(expect.objectContaining({ id: message.id, readAt: expect.any(String) }))
    const outsiderSession = await auth.login('demo@beatvault.local', 'local-demo-password')
    expect(outsiderSession).toBeTruthy()
    expect((await fetch(`${origin}/api/chat/conversations/${first.id}/messages`, { headers: { cookie: `beatvault_session=${outsiderSession!.token}` } })).status).toBe(403)
    expect((await fetch(`${origin}/api/friends/${connections[0].id}`, { method: 'DELETE', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf } })).status).toBe(200)
    expect((await fetch(`${origin}/api/chat/conversations/${second.id}/messages`, { headers: { cookie: first.cookie } })).status).toBe(403)
  })
  it('shares comments and reactions on published beats and notifies their owner', async () => {
    const signUp = async (label: string) => {
      const email = `social-${label}-${randomUUID()}@test.local`
      const password = 'Temporary-social-password'
      const registered = await fetch(`${origin}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
      expect(registered.status).toBe(201)
      const session = await auth.login(email, password)
      expect(session).toBeTruthy()
      return { id: session!.id, cookie: `beatvault_session=${session!.token}`, csrf: session!.csrfToken }
    }
    const owner = await signUp('owner')
    const actor = await signUp('actor')
    const saveProfile = (account: typeof owner, displayName: string) => fetch(`${origin}/api/profile`, { method: 'PUT', headers: { cookie: account.cookie, 'x-csrf-token': account.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ displayName, bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'lo-fi', avatarId: 'initials', publicProfile: true }) })
    expect((await saveProfile(owner, 'Social Owner')).status).toBe(200)
    expect((await saveProfile(actor, 'Social Listener')).status).toBe(200)
    const created = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'beat', title: `Social beat ${randomUUID()}`, tagIds: ['qa'], publicationStatus: 'pending-review' }) })
    expect(created.status).toBe(201)
    const content = (await created.json() as { data: { contentId: string; title: string } }).data
    const runtime = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `social-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminData = await bootstrapAdmin(env, runtime.repository)
    await runtime.close()
    const adminSession = await auth.login(adminData.email, 'A-strong-admin-password')
    expect(adminSession).toBeTruthy()
    const approved = await fetch(`${origin}/api/admin/catalog-review/${content.contentId}`, { method: 'POST', headers: { cookie: `beatvault_session=${adminSession!.token}`, 'x-csrf-token': adminSession!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })
    expect(approved.status).toBe(200)
    const marketplace = await fetch(`${origin}/api/marketplace?q=${encodeURIComponent('Social Owner')}&tag=qa&type=beat`).then(value => value.json()) as { data: { entries: Array<{ contentId: string; creatorName: string; assetId?: string; audio?: unknown }>; total: number } }
    expect(marketplace.data).toMatchObject({ total: 1, entries: [expect.objectContaining({ contentId: content.contentId, creatorName: 'Social Owner' })] })
    expect(marketplace.data.entries[0]).not.toHaveProperty('assetId')
    expect(marketplace.data.entries[0]).not.toHaveProperty('audio')
    const route = `${origin}/api/catalog/${content.contentId}/social`
    expect((await fetch(route, { headers: { cookie: actor.cookie } })).status).toBe(200)
    expect((await fetch(`${route}/comments`, { method: 'POST', headers: { cookie: actor.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Falta token CSRF' }) })).status).toBe(403)
    const comment = await fetch(`${route}/comments`, { method: 'POST', headers: { cookie: actor.cookie, 'x-csrf-token': actor.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Ese bajo quedó excelente.' }) })
    expect(comment.status).toBe(201)
    expect((await comment.json() as { data: { comments: Array<{ authorName: string; body: string }> } }).data.comments).toContainEqual(expect.objectContaining({ authorName: 'Social Listener', body: 'Ese bajo quedó excelente.' }))
    const reaction = await fetch(`${route}/reaction`, { method: 'POST', headers: { cookie: actor.cookie, 'x-csrf-token': actor.csrf, 'content-type': 'application/json' }, body: '{}' })
    expect(reaction.status).toBe(200)
    expect(await reaction.json()).toMatchObject({ data: { reacted: true, reactionCount: 1 } })
    const notifications = await fetch(`${origin}/api/notifications/social`, { headers: { cookie: owner.cookie } })
    expect((await notifications.json() as { data: Array<{ type: string; actorName: string; contentId: string }> }).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'comment', actorName: 'Social Listener', contentId: content.contentId }),
      expect.objectContaining({ type: 'reaction', actorName: 'Social Listener', contentId: content.contentId }),
    ]))
  })
  it('allows only admins to approve or reject queued catalog items and audits the decision', async () => {
    const loginAs = async (email: string, password: string) => {
      const session = await auth.login(email, password)
      expect(session).toBeTruthy()
      return { cookie: `beatvault_session=${session!.token}`, csrf: session!.csrfToken }
    }
    const creator = await loginAs('demo@beatvault.local', 'local-demo-password')
    const created = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Review ${randomUUID()}`, type: 'Beat', tagIds: ['trap'] }) })
    expect(created.status).toBe(201)
    const item = (await created.json() as { data: { contentId: string } }).data
    const repository = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminInfo = await bootstrapAdmin(env, repository.repository)
    await repository.close()
    const admin = await loginAs(adminInfo.email, 'A-strong-admin-password')
    const endpoint = `${origin}/api/admin/catalog-review/${item.contentId}`
    expect((await fetch(endpoint, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })).status).toBe(403)
    expect((await fetch(endpoint, { method: 'POST', headers: { cookie: admin.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })).status).toBe(403)
    const invalid = await fetch(endpoint, { method: 'POST', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'reject' }) })
    expect(invalid.status).toBe(400)
    const rejected = await fetch(endpoint, { method: 'POST', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'reject', reason: 'El preview tiene ruido de clipping.' }) })
    expect(rejected.status).toBe(200)
    expect((await rejected.json() as { data: { publicationStatus: string } }).data.publicationStatus).toBe('rejected')
    const creatorCatalog = (await (await fetch(`${origin}/api/catalog`, { headers: { cookie: creator.cookie } })).json() as { data: { entries: Array<{ contentId: string; publicationStatus: string; reviewNote?: string }> } }).data.entries
    expect(creatorCatalog.find(entry => entry.contentId === item.contentId)).toMatchObject({ publicationStatus: 'rejected', reviewNote: 'El preview tiene ruido de clipping.' })
    expect((await fetch(endpoint, { method: 'POST', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })).status).toBe(409)
    const publicCatalog = (await (await fetch(`${origin}/api/catalog`)).json() as { data: { entries: Array<{ contentId: string }> } }).data.entries
    expect(publicCatalog.some(entry => entry.contentId === item.contentId)).toBe(false)
    const audit = await fetch(`${origin}/api/admin/audit`, { headers: { cookie: admin.cookie } })
    const events = (await audit.json() as { data: Array<{ targetId: string; metadata: Record<string, unknown> }> }).data
    expect(events.some(event => event.targetId === item.contentId && event.metadata.reason === 'El preview tiene ruido de clipping.')).toBe(true)
  })
  it('requires a fresh community-manager recommendation for admin approval and keeps the offer non-active', async () => {
    const creatorEmail = `marketplace-seller-${randomUUID()}@test.local`
    const password = 'Marketplace-seller-password'
    await auth.register(creatorEmail, password)
    const creatorSession = await auth.login(creatorEmail, password)
    expect(creatorSession).toBeTruthy()
    const creator = { cookie: `beatvault_session=${creatorSession!.token}`, csrf: creatorSession!.csrfToken }
    const created = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Seller review ${randomUUID()}`, type: 'Beat', tagIds: ['trap'] }) })
    expect(created.status).toBe(201)
    const contentId = (await created.json() as { data: { contentId: string } }).data.contentId
    const listing = {
      description: 'A fully described beat prepared for artist licensing review.', genre: 'Hip-hop', explicitContent: false,
      rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, collaborators: [], declarationAccepted: true },
      offers: [{ id: 'basic-license', label: 'Basic', amountMinor: 3000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Preliminary terms; final agreement is not enabled.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
    }
    const saved = await fetch(`${origin}/api/seller/beat-listings/${contentId}`, { method: 'PUT', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' }, body: JSON.stringify(listing) })
    expect(saved.status).toBe(201)
    const runtime = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `marketplace-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminInfo = await bootstrapAdmin(env, runtime.repository)
    await runtime.close()
    const adminSession = await auth.login(adminInfo.email, 'A-strong-admin-password')
    expect(adminSession).toBeTruthy()
    const admin = { cookie: `beatvault_session=${adminSession!.token}`, csrf: adminSession!.csrfToken }
    expect((await fetch(`${origin}/api/admin/marketplace-listings`, { headers: { cookie: creator.cookie } })).status).toBe(403)
    const endpoint = `${origin}/api/admin/marketplace-listings/${contentId}`
    const post = (decision: string, headers: Record<string, string> = { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' }) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ decision, note: 'Reviewed for the next marketplace stage.' }) })
    expect((await post('approve', { cookie: admin.cookie, 'content-type': 'application/json' })).status).toBe(403)
    expect((await post('approve')).status).toBe(409)
    const managerEmail = `marketplace-manager-${randomUUID()}@test.local`
    await auth.register(managerEmail, 'Marketplace-manager-password')
    const managerAccount = await auth.login(managerEmail, 'Marketplace-manager-password')
    expect(managerAccount).toBeTruthy()
    const managerRole = await fetch(`${origin}/api/admin/accounts/${managerAccount!.id}/role`, { method: 'PATCH', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'community_manager' }) })
    expect(managerRole.status).toBe(200)
    const managerSession = await auth.login(managerEmail, 'Marketplace-manager-password')
    expect(managerSession).toBeTruthy()
    const recommendation = await fetch(`${origin}/api/staff/marketplace-review/${contentId}`, { method: 'POST', headers: { cookie: `beatvault_session=${managerSession!.token}`, 'x-csrf-token': managerSession!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'recommend', note: 'Rights and offer details are complete.' }) })
    expect(recommendation.status).toBe(200)
    await new Promise(resolve => setTimeout(resolve, 5))
    const editedListing = await fetch(`${origin}/api/seller/beat-listings/${contentId}`, { method: 'PUT', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ ...listing, genre: 'Trap' }) })
    expect(editedListing.status).toBe(200)
    expect((await post('approve')).status).toBe(409)
    const renewedRecommendation = await fetch(`${origin}/api/staff/marketplace-review/${contentId}`, { method: 'POST', headers: { cookie: `beatvault_session=${managerSession!.token}`, 'x-csrf-token': managerSession!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'recommend', note: 'Updated listing checked and complete.' }) })
    expect(renewedRecommendation.status).toBe(200)
    const approved = await post('approve')
    expect(approved.status).toBe(200)
    const queue = await fetch(`${origin}/api/admin/marketplace-listings`, { headers: { cookie: admin.cookie } }).then(response => response.json()) as { data: Array<{ listing: { contentId: string; offers: Array<{ status: string }> }; latestAdminDecision?: { decision: string; current: boolean } }> }
    const reviewed = queue.data.find(item => item.listing.contentId === contentId)
    expect(reviewed?.latestAdminDecision).toMatchObject({ decision: 'approve', current: true })
    expect(reviewed?.listing.offers[0].status).toBe('draft-only')
    const sellerSnapshot = await fetch(`${origin}/api/seller/beat-listings/${contentId}`, { headers: { cookie: creator.cookie } }).then(response => response.json()) as { data: { communityReview?: { decision: string; current: boolean }; adminReview?: { decision: string; current: boolean }; offers: Array<{ status: string }> } }
    expect(sellerSnapshot.data.communityReview).toMatchObject({ decision: 'recommend', current: true })
    expect(sellerSnapshot.data.adminReview).toMatchObject({ decision: 'approve', current: true })
    expect(sellerSnapshot.data.offers[0].status).toBe('draft-only')
    await new Promise(resolve => setTimeout(resolve, 5))
    const sellerEdit = await fetch(`${origin}/api/seller/beat-listings/${contentId}`, { method: 'PUT', headers: { cookie: creator.cookie, 'x-csrf-token': creator.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ ...listing, description: 'An updated fully described beat pending another review.' }) })
    expect(sellerEdit.status).toBe(200)
    const afterEdit = await fetch(`${origin}/api/seller/beat-listings/${contentId}`, { headers: { cookie: creator.cookie } }).then(response => response.json()) as { data: { communityReview?: { current: boolean }; adminReview?: { current: boolean } } }
    expect(afterEdit.data.communityReview?.current).toBe(false)
    expect(afterEdit.data.adminReview?.current).toBe(false)
  })
  it('lets admins persist marketplace discounts with CSRF validation and audit history', async () => {
    const runtime = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `promotion-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminInfo = await bootstrapAdmin(env, runtime.repository)
    await runtime.close()
    const adminSession = await auth.login(adminInfo.email, 'A-strong-admin-password')
    expect(adminSession).toBeTruthy()
    const creator = await auth.login('demo@beatvault.local', 'local-demo-password')
    const endpoint = `${origin}/api/admin/promotions`
    const cookie = `beatvault_session=${adminSession!.token}`
    const headers = { cookie, 'x-csrf-token': adminSession!.csrfToken, 'content-type': 'application/json' }
    expect((await fetch(endpoint)).status).toBe(401)
    expect((await fetch(endpoint, { headers: { cookie: `beatvault_session=${creator!.token}` } })).status).toBe(403)
    const payload = { name: 'Launch 10%', scope: 'one-shot', percentOff: 10, enabled: true }
    expect((await fetch(endpoint, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) })).status).toBe(403)
    expect((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ ...payload, percentOff: 90 }) })).status).toBe(400)
    const created = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) })
    expect(created.status).toBe(201)
    const rule = (await created.json() as { data: { id: string; scope: string; percentOff: number; enabled: boolean } }).data
    expect(rule).toMatchObject({ scope: 'one-shot', percentOff: 10, enabled: true })
    expect((await fetch(endpoint, { headers: { cookie } })).status).toBe(200)
    const updated = await fetch(`${endpoint}/${rule.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...payload, scope: 'loop', percentOff: 15, enabled: false }) })
    expect((await updated.json() as { data: { scope: string; percentOff: number; enabled: boolean } }).data).toMatchObject({ scope: 'loop', percentOff: 15, enabled: false })
    expect((await fetch(`${endpoint}/${rule.id}`, { method: 'DELETE', headers: { cookie } })).status).toBe(403)
    expect((await fetch(`${endpoint}/${rule.id}`, { method: 'DELETE', headers })).status).toBe(200)
    expect((await fetch(endpoint, { headers: { cookie } }).then(response => response.json()) as { data: unknown[] }).data).toHaveLength(0)
    const auditResponse = await fetch(`${origin}/api/admin/audit`, { headers: { cookie } })
    const auditRows = (await auditResponse.json() as { data: Array<{ targetId: string; metadata: Record<string, unknown> }> }).data
    expect(auditRows.some(row => row.targetId === rule.id && row.metadata.resource === 'marketplace-promotion')).toBe(true)
  })
  it('limits community managers to marketplace recommendations and keeps role assignment admin-only', async () => {
    const creatorInfo = await auth.register(`cm-${randomUUID()}@test.local`, 'Community-manager-password')
    const runtime = createRepository()
    const env = { ...process.env, BEATVAULT_ADMIN_EMAIL: `cm-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminInfo = await bootstrapAdmin(env, runtime.repository)
    await runtime.close()
    const admin = await auth.login(adminInfo.email, 'A-strong-admin-password')
    const creator = await auth.login(creatorInfo.email, 'Community-manager-password')
    expect(admin && creator).toBeTruthy()
    const endpoint = `${origin}/api/admin/accounts/${creatorInfo.id}/role`
    const adminHeaders = { cookie: `beatvault_session=${admin!.token}`, 'x-csrf-token': admin!.csrfToken, 'content-type': 'application/json' }
    expect((await fetch(endpoint, { method: 'PATCH', headers: { cookie: adminHeaders.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'community_manager' }) })).status).toBe(403)
    expect((await fetch(endpoint, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ role: 'admin' }) })).status).toBe(400)
    expect((await fetch(endpoint, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ role: 'community_manager' }) })).status).toBe(200)
    const manager = await auth.login(creatorInfo.email, 'Community-manager-password')
    expect(manager?.role).toBe('community_manager')
    const managerCookie = { cookie: `beatvault_session=${manager!.token}` }
    expect((await fetch(`${origin}/api/admin/overview`, { headers: managerCookie })).status).toBe(403)
    expect((await fetch(`${origin}/api/staff/marketplace-review`, { headers: managerCookie })).status).toBe(200)
    expect((await fetch(`${origin}/api/staff/marketplace-review`, { headers: { cookie: `beatvault_session=${(await auth.login('demo@beatvault.local', 'local-demo-password'))!.token}` } })).status).toBe(403)
    const recommendation = `${origin}/api/staff/marketplace-review/${randomUUID()}`
    expect((await fetch(recommendation, { method: 'POST', headers: { ...managerCookie, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'recommend', note: 'Looks complete for review.' }) })).status).toBe(403)
    expect((await fetch(recommendation, { method: 'POST', headers: { ...managerCookie, 'x-csrf-token': manager!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'recommend', note: 'ok' }) })).status).toBe(400)
    expect((await fetch(recommendation, { method: 'POST', headers: { ...managerCookie, 'x-csrf-token': manager!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'recommend', note: 'Looks complete for review.' }) })).status).toBe(404)
  })
})
