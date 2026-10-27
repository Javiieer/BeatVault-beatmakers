import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { auth, audit, server } from './index'
import { createRepository } from './repository'
import { config } from './config'
import { LocalRepository } from './store'
import { marketplaceRevision } from './marketplace-review-state'

describe('consolidated account and review flows', () => {
  let origin = ''
  const runtime = createRepository()
  const repo = runtime.repository
  const password = 'Local-consolidation-tests-2026!'
  type Session = NonNullable<Awaited<ReturnType<typeof auth.login>>>
  const headers = (session: Session) => ({ cookie: `beatvault_session=${session.token}`, 'x-csrf-token': session.csrfToken, 'x-beatvault-account': session.id, 'content-type': 'application/json' })
  const user = async (role: 'creator' | 'community_manager' | 'admin' = 'creator') => {
    const email = `consolidation-${randomUUID()}@beatvault.test`
    const account = await auth.register(email, password)
    const stored = await repo.findAccountById(account.id)
    await repo.saveAccount({ ...stored!, role })
    return (await auth.login(email, password))!
  }
  beforeAll(async () => {
    await auth.initialize()
    await audit.initialize()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('No test address')
    origin = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await runtime.close() })

  it('persists account-bound idempotent favorites, refuses private adds and scopes removal', async () => {
    const owner = await user(), buyer = await user(), other = await user()
    const entry = await repo.createCatalog({ contentId: randomUUID(), creatorId: owner.id, title: 'Public favorite', type: 'beat', tagIds: [], previewIds: [], publicationStatus: 'published' })
    const privateEntry = await repo.createCatalog({ ...entry, contentId: randomUUID(), title: 'Private favorite', publicationStatus: 'draft' })
    const endpoint = `${origin}/api/account/favorites/${entry.contentId}`
    expect((await fetch(endpoint, { method: 'PUT' })).status).toBe(401)
    expect((await fetch(endpoint, { method: 'PUT', headers: { ...headers(buyer), 'x-csrf-token': '' } })).status).toBe(403)
    expect((await fetch(endpoint, { method: 'PUT', headers: { ...headers(buyer), 'x-beatvault-account': other.id } })).status).toBe(409)
    expect((await fetch(endpoint, { method: 'PUT', headers: { ...headers(buyer), 'x-beatvault-account': '' } })).status).toBe(409)
    expect((await fetch(`${origin}/api/account/favorites/${privateEntry.contentId}`, { method: 'PUT', headers: headers(buyer) })).status).toBe(404)
    for (let index = 0; index < 2; index++) expect((await fetch(endpoint, { method: 'PUT', headers: headers(buyer) })).status).toBe(200)
    expect(await new LocalRepository().listFavoriteIds(buyer.id)).toEqual([entry.contentId])
    expect(await fetch(`${origin}/api/account/favorites`, { headers: headers(other) }).then(response => response.json())).toMatchObject({ data: { accountId: other.id, contentIds: [] } })
    await repo.updateCatalog(entry.contentId, { title: entry.title, type: entry.type, tagIds: [], publicationStatus: 'archived' }, owner.id)
    expect(await fetch(`${origin}/api/account/favorites`, { headers: headers(buyer) }).then(response => response.json())).toMatchObject({ data: { accountId: buyer.id, contentIds: [entry.contentId] } })
    await fetch(endpoint, { method: 'DELETE', headers: headers(other) })
    expect(await repo.listFavoriteIds(buyer.id)).toEqual([entry.contentId])
    for (let index = 0; index < 2; index++) expect((await fetch(endpoint, { method: 'DELETE', headers: headers(buyer) })).status).toBe(200)
    expect(await repo.listFavoriteIds(buyer.id)).toEqual([])
  })

  it('serializes favorite limits across simultaneous writes', async () => {
    const owner = await user(), account = await user()
    const entries = await Promise.all([0, 1].map(index => repo.createCatalog({ contentId: randomUUID(), creatorId: owner.id, title: `Race favorite ${index}`, type: 'beat', tagIds: [], previewIds: [], publicationStatus: 'published' })))
    const results = await Promise.allSettled(entries.map(entry => repo.addFavorite(account.id, entry.contentId, 1)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await repo.listFavoriteIds(account.id)).toHaveLength(1)
  })

  it('preserves independent approval after audit rotation and invalidates add/remove evidence without resurrection', async () => {
    const owner = await user(), manager = await user('community_manager'), admin = await user('admin')
    const entry = await repo.createCatalog({ contentId: randomUUID(), creatorId: owner.id, title: 'Durable reviewed beat', type: 'beat', tagIds: [], previewIds: [], publicationStatus: 'published' })
    const input = { description: 'A complete and independently reviewed local Beat offer.', genre: 'Hip-hop', explicitContent: false, rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, collaborators: [], declarationAccepted: true }, offers: [{ id: 'standard', label: 'Standard', amountMinor: 3000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Recording and distribution under the stated license.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }] }
    const sellerUrl = `${origin}/api/seller/beat-listings/${entry.contentId}`
    expect((await fetch(sellerUrl, { method: 'PUT', headers: headers(owner), body: JSON.stringify(input) })).status).toBe(201)
    const recommend = () => fetch(`${origin}/api/staff/marketplace-review/${entry.contentId}`, { method: 'POST', headers: headers(manager), body: JSON.stringify({ decision: 'recommend', note: 'Verified rights and supported offer formats.' }) })
    const approve = () => fetch(`${origin}/api/admin/marketplace-listings/${entry.contentId}`, { method: 'POST', headers: headers(admin), body: JSON.stringify({ decision: 'approve', note: 'Independent commercial terms review complete.' }) })
    expect((await approve()).status).toBe(409)
    expect((await recommend()).status).toBe(200)
    expect((await approve()).status).toBe(200)
    await writeFile(`${config.dataDirectory}/audit.json`, '[]')
    await audit.initialize()
    expect(audit.entries).toHaveLength(0)
    let result = await fetch(sellerUrl, { headers: headers(owner) }).then(response => response.json())
    expect(result.data.adminReview).toMatchObject({ decision: 'approve', current: true })
    expect((await new LocalRepository().findMarketplaceReviewState(entry.contentId, owner.id))?.adminReview?.decision).toBe('approve')
    const evidence = { id: randomUUID(), contentId: entry.contentId, ownerId: owner.id, originalName: 'proof.pdf', mimeType: 'application/pdf' as const, sizeBytes: 16, storageKey: 'test/proof.pdf', contentHash: 'a'.repeat(64), createdAt: new Date().toISOString() }
    await repo.saveSellerEvidence(evidence)
    await repo.deleteSellerEvidence(evidence.id, owner.id)
    result = await fetch(sellerUrl, { headers: headers(owner) }).then(response => response.json())
    expect(result.data.adminReview.current).toBe(false)
    expect((await approve()).status).toBe(409)
    expect((await recommend()).status).toBe(200)
    expect((await approve()).status).toBe(200)
    const listing = (await repo.findBeatListingDraft(entry.contentId, owner.id))!
    const oldRevision = marketplaceRevision(listing, [])
    await repo.saveBeatListingDraft({ ...listing, description: 'Changed commercial terms require a fresh independent review.' })
    await expect(repo.saveMarketplaceReview({ contentId: entry.contentId, ownerId: owner.id, expectedRevision: oldRevision, stage: 'admin', review: { decision: 'approve', reviewerId: admin.id, createdAt: new Date().toISOString(), current: true, note: 'Old snapshot must not be accepted.' } }, { id: randomUUID(), action: 'marketplace_admin_decision', requestId: 'stale', timestamp: new Date().toISOString(), actorId: admin.id, targetId: entry.contentId, success: true, metadata: {} })).rejects.toThrow('LISTING_REVISION_CHANGED')
  })

  it('resolves notification post IDs with the same privacy boundary as the feed', async () => {
    const owner = await user(), outsider = await user()
    const now = new Date().toISOString()
    const post = await repo.createSocialPost({ id: randomUUID(), authorId: owner.id, kind: 'status', body: 'Private notification destination', audience: 'private', visibility: 'published', createdAt: now, updatedAt: now }, 1024)
    const endpoint = `${origin}/api/posts/${post.id}`
    expect((await fetch(endpoint)).status).toBe(401)
    expect((await fetch(endpoint, { headers: headers(outsider) })).status).toBe(404)
    expect(await fetch(endpoint, { headers: headers(owner) }).then(response => response.json())).toMatchObject({ data: { id: post.id, body: post.body } })
    await repo.deleteSocialPost(post.id, owner.id)
    expect((await fetch(endpoint, { headers: headers(owner) })).status).toBe(404)
  })
})
