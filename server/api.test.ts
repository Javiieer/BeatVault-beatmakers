import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { auth, server } from './index'
import { createRepository } from './repository'
import { bootstrapAdmin } from './bootstrap'
describe('local API routes', () => {
 let origin = ''; let cookie = ''
 beforeAll(async () => { await auth.initialize(); await new Promise<void>(resolve => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('no address'); origin = `http://localhost:${address.port}` })
 afterAll(() => server.close())
 it('serves public health and catalog', async () => { expect((await fetch(`${origin}/api/health`)).status).toBe(200); expect((await fetch(`${origin}/api/catalog`)).status).toBe(200) })
  it('authenticates, uses the session owner, and logs out', async () => { const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@beatvault.local', password: 'local-demo-password' }) }); expect(login.status).toBe(200); const headers = login.headers.getSetCookie(); expect(headers[0]).toContain('HttpOnly'); cookie = headers[0].split(';')[0]; const csrf = headers[1].split(';')[0].split('=')[1]; expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(200); const created = await fetch(`${origin}/api/projects`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ ownerId: 'attacker', title: `Session project ${Date.now()}` }) }); expect(created.status).toBe(201); const result = await created.json() as { data: { ownerId: string } }; expect(result.data.ownerId).toBe('local-demo'); await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } }); expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(401) })
  it('protects project routes, CSRF, and payloads', async () => { expect((await fetch(`${origin}/api/projects`)).status).toBe(401); const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@beatvault.local', password: 'local-demo-password' }) }); const parts = login.headers.getSetCookie(); cookie = parts[0].split(';')[0]; const csrf = parts[1].split(';')[0].split('=')[1]; expect((await fetch(`${origin}/api/projects`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })).status).toBe(403); const response = await fetch(`${origin}/api/projects`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: '{}' }); expect(response.status).toBe(400) })
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
    expect((await fetch(`${origin}/api/friends/${connections[0].id}`, { method: 'DELETE', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf } })).status).toBe(200)
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
})
