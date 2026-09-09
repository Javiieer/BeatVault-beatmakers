import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth, server } from './index'
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
    const created = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Loop ${Date.now()}`, type: 'Loop', tagIds: ['dark'], ownerId: 'attacker' }) })
    expect(created.status).toBe(400)
    const valid = await fetch(`${origin}/api/catalog`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Loop ${Date.now()}`, type: 'Loop', tagIds: ['dark'] }) })
    expect(valid.status).toBe(201)
    const payload = await valid.json() as { data: { creatorId: string; contentId: string } }
    expect(payload.data.creatorId).toBe('local-demo')
    expect((await fetch(`${origin}/api/catalog/${payload.data.contentId}`, { method: 'DELETE', headers: { cookie, 'x-csrf-token': csrf } })).status).toBe(200)
  })
})
