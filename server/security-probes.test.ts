// @vitest-environment node
import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth, server } from './index'
import { config } from './config'
import { maxJsonBytes } from './http'

// The test setup forces disposable JSON storage. Never accept an external target.
describe('local security probes', () => {
  let origin = ''
  let owner: Record<string, string>
  let other: Record<string, string>
  let assetId = ''
  let projectId = ''
  let catalogId = ''
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(36)])
  const jsonHeaders = { 'content-type': 'application/json' }
  const call = (path: string, init?: RequestInit) => fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(5000) })
  const credentials = { email: 'probe-owner@test.local', password: 'temporary-probe-password' }
  async function login(email: string) {
    const response = await call('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...credentials, email }) })
    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(cookies[0]).toContain('HttpOnly')
    expect(cookies[0]).toContain('SameSite=Lax')
    return { ...jsonHeaders, cookie: cookies.map(value => value.split(';')[0]).join('; '), 'x-csrf-token': cookies[1].split(';')[0].split('=')[1] }
  }
  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing local test listener')
    origin = `http://127.0.0.1:${address.port}`
    await auth.register(credentials.email, credentials.password)
    await auth.register('probe-other@test.local', credentials.password)
    owner = await login(credentials.email)
    other = await login('probe-other@test.local')
    const project = await call('/api/projects', { method: 'POST', headers: owner, body: JSON.stringify({ title: 'Private security fixture' }) })
    expect(project.status).toBe(201)
    projectId = ((await project.json()) as { data: { id: string } }).data.id
    const catalog = await call('/api/catalog', { method: 'POST', headers: owner, body: JSON.stringify({ title: 'Private draft fixture', type: 'sample', publicationStatus: 'draft', tagIds: ['probe'] }) })
    expect(catalog.status).toBe(201)
    catalogId = ((await catalog.json()) as { data: { contentId: string } }).data.contentId
    const form = new FormData()
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'sample.wav')
    const upload = await call('/api/assets/upload', { method: 'POST', headers: { cookie: owner.cookie, 'x-csrf-token': owner['x-csrf-token'] }, body: form })
    expect(upload.status).toBe(201)
    assetId = ((await upload.json()) as { data: { id: string } }).data.id
  })
  afterAll(async () => {
    await auth.clearSessions()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('SEC-001 blocks anonymous private routes and creator access to admin', async () => {
    for (const path of ['/api/projects', '/api/admin/accounts', `/api/assets/${assetId}/preview`]) expect((await call(path)).status).toBe(401)
    expect((await call('/api/admin/accounts', { headers: owner })).status).toBe(403)
  })
  it('SEC-002 rejects forged ownership and cross-account writes', async () => {
    expect((await call(`/api/projects/${projectId}`, { method: 'PUT', headers: other, body: JSON.stringify({ title: 'Changed', status: 'draft' }) })).status).toBe(404)
    expect((await call(`/api/projects/${projectId}`, { method: 'DELETE', headers: other })).status).toBe(404)
    expect((await call(`/api/catalog/${catalogId}`, { method: 'DELETE', headers: other })).status).toBe(404)
    expect((await call(`/api/assets/${assetId}/download`, { headers: other })).status).toBe(404)
    expect((await call(`/api/assets/${assetId}`, { method: 'DELETE', headers: other })).status).toBe(404)
    const ownProjects = await (await call('/api/projects', { headers: owner })).json() as { data: { id: string }[] }
    expect(ownProjects.data.map((item: { id: string }) => item.id)).toContain(projectId)
  })
  it('SEC-003 rejects missing and invalid CSRF tokens', async () => {
    for (const token of ['', 'invalid']) expect((await call('/api/projects', { method: 'POST', headers: { ...owner, 'x-csrf-token': token }, body: JSON.stringify({ title: 'Rejected' }) })).status).toBe(403)
  })
  it('SEC-004 rejects foreign origins without granting CORS access', async () => {
    const response = await call('/api/health', { headers: { origin: 'https://untrusted.invalid' } })
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
  it('SEC-005 bounds JSON bodies, including requests without Content-Length', async () => {
    const response = await call('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ padding: 'a'.repeat(maxJsonBytes) }) })
    expect(response.status).toBe(413)
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${origin}/api/auth/register`, { method: 'POST', headers: jsonHeaders }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)) })
      req.on('error', reject)
      req.setTimeout(5000, () => req.destroy(new Error('Probe timed out')))
      req.write('{"padding":"')
      req.end('a'.repeat(maxJsonBytes) + '"}')
    })
    expect(status).toBe(413)
  })
  it('SEC-006 handles malformed JSON and media types without internal errors', async () => {
    expect((await call('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: '{' })).status).toBe(400)
    expect((await call('/api/auth/register', { method: 'POST', body: '{}' })).status).toBe(415)
  })
  it('SEC-015 throttles public account creation before password hashing', async () => {
    for (let index = 0; index < config.rateLimit.limit; index++) {
      const response = await call('/api/auth/register', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ email: `register-${index}@test.local`, password: credentials.password }),
      })
      expect(response.status).toBe(201)
    }
    const blocked = await call('/api/auth/register', {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ email: 'register-blocked@test.local', password: credentials.password }),
    })
    expect(blocked.status).toBe(429)
  })
  it('SEC-007 hides drafts from anonymous visitors and other creators', async () => {
    for (const headers of [undefined, other]) {
      const result = await (await call('/api/catalog', { headers })).json() as { data: { entries: { contentId: string }[] } }
      expect(result.data.entries.map((entry: { contentId: string }) => entry.contentId)).not.toContain(catalogId)
    }
    const result = await (await call('/api/catalog', { headers: owner })).json() as { data: { entries: { contentId: string }[] } }
    expect(result.data.entries.map((entry: { contentId: string }) => entry.contentId)).toContain(catalogId)
  })
  it('SEC-008 prevents role escalation and bypassing publication review', async () => {
    expect((await call('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...credentials, role: 'admin' }) })).status).toBe(400)
    const body = JSON.stringify({ title: 'Private draft fixture', type: 'sample', publicationStatus: 'published' })
    expect((await call('/api/catalog', { method: 'POST', headers: owner, body })).status).toBe(403)
    expect((await call(`/api/catalog/${catalogId}`, { method: 'PUT', headers: owner, body })).status).toBe(403)
  })
  it('SEC-009 rejects executable content disguised as audio', async () => {
    const form = new FormData()
    form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'audio/wav' }), 'forged.wav')
    const response = await call('/api/assets/upload', { method: 'POST', headers: { cookie: owner.cookie, 'x-csrf-token': owner['x-csrf-token'] }, body: form })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('UPLOAD_SIGNATURE')
  })
  it('SEC-010 returns bounded byte ranges and rejects invalid ranges', async () => {
    for (const [range, start, end] of [['bytes=-8', 40, 47], ['bytes=4-99999', 4, 47], ['bytes=0-3', 0, 3]] as const) {
      const response = await call(`/api/assets/${assetId}/preview`, { headers: { ...owner, range } })
      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/${wav.length}`)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(wav.subarray(start, end + 1))
    }
    for (const range of ['bytes=-0', 'bytes=-', 'bytes=999-', 'bytes=5-2', 'bytes=0-1,4-5']) {
      const response = await call(`/api/assets/${assetId}/preview`, { headers: { ...owner, range } })
      expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe(`bytes */${wav.length}`)
    }
  })
  it('SEC-011 protects media responses and handles HEAD requests', async () => {
    const response = await call(`/api/assets/${assetId}/download`, { method: 'HEAD', headers: { ...owner, origin: config.corsOrigins[0] } })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(config.corsOrigins[0])
    expect(response.headers.get('content-length')).toBe(String(wav.length))
    expect(await response.text()).toBe('')
  })
  it('SEC-013 binds catalog audio to its owner and preserves references through edits', async () => {
    const input = { title: 'Linked audio', type: 'beat', assetId, coverId: 'lo-fi', publicationStatus: 'draft' }
    const create = (headers: Record<string, string>, value = input) => call('/api/catalog', { method: 'POST', headers, body: JSON.stringify(value) })
    expect((await create(other)).status).toBe(400)
    const first = await (await create(owner)).json()
    expect(first.data).toMatchObject({ assetId, coverId: 'lo-fi', audio: { sizeBytes: wav.length, originalName: 'sample.wav', state: 'available' } })
    expect(first.data.audio).not.toHaveProperty('storageKey')
    const again = await (await create(owner)).json()
    expect(again.data.contentId).toBe(first.data.contentId)
    const updated = await call(`/api/catalog/${first.data.contentId}`, { method: 'PUT', headers: owner, body: JSON.stringify({ title: 'Updated linked audio', type: 'beat', publicationStatus: 'archived' }) })
    expect((await updated.json()).data).toMatchObject({ assetId, coverId: 'lo-fi', publicationStatus: 'archived' })
    const replaced = await call(`/api/catalog/${first.data.contentId}`, { method: 'PUT', headers: owner, body: JSON.stringify({ ...input, assetId: projectId }) })
    expect(replaced.status).toBe(400)
    const reloaded = await (await call('/api/catalog', { headers: owner })).json()
    expect(reloaded.data.entries.find((entry: { contentId: string }) => entry.contentId === first.data.contentId)).toMatchObject({ assetId, coverId: 'lo-fi' })
    const foreign = await (await call('/api/catalog', { headers: other })).json()
    expect(foreign.data.entries.some((entry: { assetId?: string }) => entry.assetId === assetId)).toBe(false)
  })
  it('SEC-012 throttles failed logins and invalidates sessions on logout', async () => {
    let lastStatus = 0
    for (let i = 0; i <= config.rateLimit.limit; i++) lastStatus = (await call('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: credentials.email, password: 'incorrect' }) })).status
    expect(lastStatus).toBe(429)
    expect((await call('/api/auth/logout', { method: 'POST', headers: other })).status).toBe(200)
    expect((await call('/api/auth/me', { headers: other })).status).toBe(401)
  })
})
