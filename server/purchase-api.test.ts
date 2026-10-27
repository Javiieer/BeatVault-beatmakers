import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { auth, server } from './index'
import { createRepository } from './repository'
import { config } from './config'
import type { AssetRecord, BeatOrder } from './store'
import { emptyProfile } from '../src/domains/profile'

describe('protected purchase and public detail API', () => {
  let origin = ''
  const runtime = createRepository()
  const repo = runtime.repository
  beforeAll(async () => {
    await auth.initialize()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing address')
    origin = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await runtime.close() })

  async function fixture() {
    const suffix = randomUUID()
    const password = 'Purchase-api-local-password'
    const seller = await auth.register(`seller-${suffix}@test.local`, password)
    const buyer = await auth.register(`buyer-${suffix}@test.local`, password)
    const outsider = await auth.register(`outsider-${suffix}@test.local`, password)
    const sellerSession = (await auth.login(seller.email, password))!
    const buyerSession = (await auth.login(buyer.email, password))!
    const outsiderSession = (await auth.login(outsider.email, password))!
    const bytes = Buffer.alloc(48)
    bytes.write('RIFF', 0); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16)
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40)
    const asset: AssetRecord = { id: randomUUID(), ownerId: seller.id, originalName: 'licensed-beat.wav', storageKey: `${seller.id}/${randomUUID()}`, mimeType: 'audio/wav', sizeBytes: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex'), state: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    await mkdir(join(config.uploadDirectory, seller.id), { recursive: true })
    await writeFile(join(config.uploadDirectory, asset.storageKey), bytes)
    await repo.createAsset(asset)
    const entry = await repo.createCatalog({ contentId: randomUUID(), creatorId: seller.id, title: 'Purchased original', type: 'beat', tagIds: ['qa'], previewIds: [], publicationStatus: 'published', assetId: asset.id })
    await repo.saveProfile({ ...emptyProfile(seller.id), displayName: 'Private seller identity', publicProfile: false })
    const order: BeatOrder = { id: randomUUID(), buyerId: buyer.id, sellerId: seller.id, contentId: entry.contentId, offerId: 'wav', title: entry.title, amountMinor: 2000, commissionMinor: 100, processingEstimateMinor: 94, applicationFeeMinor: 194, sellerNetMinor: 1806, currency: 'usd', status: 'paid', createdAt: new Date().toISOString(), fulfillment: { version: 1, assetId: asset.id, sourceHash: asset.contentHash, sourceMimeType: asset.mimeType, sourceSizeBytes: asset.sizeBytes, sourceName: asset.originalName, deliverables: ['wav'], offerLabel: 'WAV offer', usageSummary: 'Commercial release allowed.', termsVersion: 'non-exclusive-offer-draft-v1' } }
    await repo.createBeatOrder(order)
    return { asset, entry, order, bytes, sellerSession, buyerSession, outsiderSession }
  }

  it('only exposes published public detail and never includes private originals or opted-out seller metadata', async () => {
    const { entry } = await fixture()
    const response = await fetch(`${origin}/api/catalog/${entry.contentId}`)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data).toMatchObject({ contentId: entry.contentId, creatorName: 'BeatVault creator' })
    expect(payload.data).not.toHaveProperty('assetId')
    expect(payload.data).not.toHaveProperty('audio')
    await repo.updateCatalog(entry.contentId, { title: entry.title, type: 'beat', tagIds: [], publicationStatus: 'draft', assetId: entry.assetId }, entry.creatorId)
    const hidden = await fetch(`${origin}/api/catalog/${entry.contentId}`)
    expect(hidden.status).toBe(404)
    expect(JSON.stringify(await hidden.json())).not.toContain('Private review note')
  })

  it('restricts downloads to the paid buyer and purchased format, and retains the original after catalog edits', async () => {
    const { order, entry, asset, bytes, buyerSession, outsiderSession } = await fixture()
    const url = `${origin}/api/orders/${order.id}/download?format=wav`
    expect((await fetch(url)).status).toBe(401)
    expect((await fetch(url, { headers: { cookie: `beatvault_session=${outsiderSession.token}` } })).status).toBe(404)
    await repo.updateCatalog(entry.contentId, { title: 'Changed listing', type: 'beat', tagIds: ['new'], publicationStatus: 'archived' }, entry.creatorId)
    const headers = { cookie: `beatvault_session=${buyerSession.token}` }
    const response = await fetch(url, { headers })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/wav')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    expect((await fetch(url.replace('format=wav', 'format=mp3'), { headers })).status).toBe(410)
    expect((await fetch(`${url}&format=mp3`, { headers })).status).toBe(400)
    expect((await fetch(`${url}&path=../../accounts.json`, { headers })).status).toBe(400)
    expect((await repo.findAsset(asset.id, entry.creatorId))?.contentHash).toBe(asset.contentHash)
    const orders = await fetch(`${origin}/api/orders`, { headers }).then(response => response.json())
    expect(orders.data).toHaveLength(1)
    expect(orders.data[0]).toMatchObject({ offerLabel: 'WAV offer', deliverables: ['wav'], downloads: [{ format: 'wav', url: `/api/orders/${order.id}/download?format=wav` }] })
    expect(JSON.stringify(orders)).not.toContain(asset.contentHash)
  })

  it('blocks deletion of purchased source and revokes downloads when a refund is recorded', async () => {
    const { order, asset, sellerSession, buyerSession } = await fixture()
    const sellerHeaders = { cookie: `beatvault_session=${sellerSession.token}`, 'x-csrf-token': sellerSession.csrfToken }
    const blocked = await fetch(`${origin}/api/assets/${asset.id}`, { method: 'DELETE', headers: sellerHeaders })
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).error.code).toBe('PURCHASE_SOURCE_RETAINED')
    await repo.updateBeatOrder(order.id, { status: 'refunded' })
    expect((await fetch(`${origin}/api/orders/${order.id}/download?format=wav`, { headers: { cookie: `beatvault_session=${buyerSession.token}` } })).status).toBe(404)
    const orders = await fetch(`${origin}/api/orders`, { headers: { cookie: `beatvault_session=${buyerSession.token}` } }).then(response => response.json())
    expect(orders.data[0].downloads).toEqual([])
    expect(orders.data[0].downloadUrl).toBeUndefined()
    expect((await fetch(`${origin}/api/assets/${asset.id}`, { method: 'DELETE', headers: sellerHeaders })).status).toBe(200)
  })

  it.each([true, false])('serializes source deletion against new local checkout creation (checkout first: %s)', async checkoutFirst => {
    const { order, asset } = await fixture()
    await repo.updateBeatOrder(order.id, { status: 'refunded' })
    const pending: BeatOrder = { ...order, id: randomUUID(), status: 'pending' }
    const create = () => repo.createBeatOrder(pending)
    const remove = () => repo.deleteAsset(asset.id, order.sellerId)
    const outcomes = await Promise.allSettled(checkoutFirst ? [create(), remove()] : [remove(), create()])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const kept = await repo.findAsset(asset.id, order.sellerId)
    const saved = await repo.findBeatOrder(pending.id)
    expect(Boolean(kept)).toBe(Boolean(saved))
    if (saved) expect(saved.fulfillment?.sourceHash).toBe(asset.contentHash)
  })
})
