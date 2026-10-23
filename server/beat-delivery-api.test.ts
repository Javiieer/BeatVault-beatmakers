import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CatalogEntry } from '../src/domains/catalog/types'
import type { BeatListingRecord, BeatOfferDraft } from '../src/domains/marketplace/sellerListings'
import { assetPath } from './uploads'
import type { AssetRecord } from './store'
import { buildBeatPurchaseSnapshot } from './beat-delivery'
import { auth, server } from './index'
import { bootstrapAdmin } from './bootstrap'
import { createRepository } from './repository'

describe('beat delivery API', () => {
  let origin = ''
  beforeAll(async () => {
    await auth.initialize()
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no address')
    origin = `http://localhost:${address.port}`
  })
  afterAll(() => server.close())

  it('checks every advertised deliverable against the paid file and preserves a buyer purchase snapshot', async () => {
    const runtime = createRepository()
    const sellerPassword = 'Beat-delivery-seller-password'
    const sellerEmail = `delivery-seller-${randomUUID()}@test.local`
    await auth.register(sellerEmail, sellerPassword)
    const sellerSession = await auth.login(sellerEmail, sellerPassword)
    const buyerEmail = `delivery-buyer-${randomUUID()}@test.local`
    await auth.register(buyerEmail, 'Beat-delivery-buyer-password')
    const buyerSession = await auth.login(buyerEmail, 'Beat-delivery-buyer-password')
    expect(sellerSession && buyerSession).toBeTruthy()
    const seller = sellerSession!
    const buyer = buyerSession!
    const sellerHeaders = { cookie: `beatvault_session=${seller.token}`, 'x-csrf-token': seller.csrfToken, 'content-type': 'application/json' }
    const buyerHeaders = { cookie: `beatvault_session=${buyer.token}`, 'x-csrf-token': buyer.csrfToken, 'content-type': 'application/json' }
    const now = new Date().toISOString()
    const createAsset = async (originalName: string, mimeType: string, bytes: Buffer): Promise<AssetRecord> => {
      const id = randomUUID()
      const storageKey = `${seller.id.replace(/[^a-zA-Z0-9_-]/g, '_')}/${id}`
      const asset: AssetRecord = { id, ownerId: seller.id, originalName, storageKey, mimeType, sizeBytes: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex'), state: 'available', createdAt: now, updatedAt: now }
      await mkdir(dirname(assetPath(asset)), { recursive: true })
      await writeFile(assetPath(asset), bytes)
      await runtime.repository.createAsset(asset)
      return asset
    }
    const mp3Bytes = Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000BeatVault test audio')
    const wavBytes = Buffer.alloc(48)
    wavBytes.write('RIFF', 0); wavBytes.writeUInt32LE(wavBytes.length - 8, 4); wavBytes.write('WAVEfmt ', 8)
    wavBytes.writeUInt32LE(16, 16); wavBytes.writeUInt16LE(1, 20); wavBytes.writeUInt16LE(1, 22)
    wavBytes.writeUInt32LE(8000, 24); wavBytes.writeUInt32LE(16000, 28); wavBytes.writeUInt16LE(2, 32); wavBytes.writeUInt16LE(16, 34)
    wavBytes.write('data', 36); wavBytes.writeUInt32LE(4, 40)
    const mp3Asset = await createAsset('Night drive.wav', 'audio/mpeg', mp3Bytes)
    const wavAsset = await createAsset('Daylight.wav', 'audio/wav', wavBytes)
    const offers: BeatOfferDraft[] = [
      { id: 'mp3-only', label: 'MP3 license', amountMinor: 3000, currency: 'USD' as const, deliverables: ['mp3'], usageSummary: 'Commercial release with producer credit.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const },
      { id: 'wav-only', label: 'WAV license', amountMinor: 4000, currency: 'USD' as const, deliverables: ['wav'], usageSummary: 'Commercial release with producer credit.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const },
      { id: 'stems', label: 'Stems license', amountMinor: 5000, currency: 'USD' as const, deliverables: ['stems'], usageSummary: 'Commercial release with producer credit.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const },
      { id: 'multiple-formats', label: 'Multi-format license', amountMinor: 6000, currency: 'USD' as const, deliverables: ['mp3', 'wav'], usageSummary: 'Commercial release with producer credit.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const },
      { id: 'wrong-format', label: 'Wrong format license', amountMinor: 3000, currency: 'USD' as const, deliverables: ['wav'], usageSummary: 'Commercial release with producer credit.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const },
    ]
    const contentId = randomUUID()
    const wavContentId = randomUUID()
    const entry: CatalogEntry = { contentId, creatorId: seller.id, type: 'beat', title: 'Night drive', tagIds: ['test'], previewIds: [], publicationStatus: 'published', assetId: mp3Asset.id }
    const wavEntry: CatalogEntry = { contentId: wavContentId, creatorId: seller.id, type: 'beat', title: 'Daylight', tagIds: ['test'], previewIds: [], publicationStatus: 'published', assetId: wavAsset.id }
    await runtime.repository.createCatalog(entry)
    await runtime.repository.createCatalog(wavEntry)
    const makeListing = (id: string, assetOffers: typeof offers): BeatListingRecord => ({
      contentId: id, ownerId: seller.id, description: 'A fully described beat prepared for commercial review.', genre: 'Hip-hop', explicitContent: false,
      rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, collaborators: [], declarationAccepted: true },
      offers: assetOffers.map(offer => ({ ...offer, deliverables: [...offer.deliverables] })), currency: 'USD', status: 'draft-only', schemaVersion: 1,
      rightsDeclarationVersion: 'rights-intake-v1', rightsDeclarationAcceptedAt: now, createdAt: now, updatedAt: now,
    })
    await runtime.repository.saveBeatListingDraft(makeListing(contentId, [offers[0], offers[2], offers[3], offers[4]]))
    await runtime.repository.saveBeatListingDraft(makeListing(wavContentId, [offers[1]]))
    await runtime.repository.saveStripeConnectAccount({ accountId: seller.id, stripeAccountId: 'acct_test_delivery', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, deauthorized: false, updatedAt: now })

    const adminEnv = { ...process.env, BEATVAULT_ADMIN_EMAIL: `delivery-admin-${randomUUID()}@test.local`, BEATVAULT_ADMIN_PASSWORD: 'A-strong-admin-password', BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomUUID() + randomUUID() }
    const adminInfo = await bootstrapAdmin(adminEnv, runtime.repository)
    const admin = await auth.login(adminInfo.email, adminEnv.BEATVAULT_ADMIN_PASSWORD)
    expect(admin).toBeTruthy()
    for (const id of [contentId, wavContentId]) {
      const decision = await fetch(`${origin}/api/admin/marketplace-listings/${id}`, { method: 'POST', headers: { cookie: `beatvault_session=${admin!.token}`, 'x-csrf-token': admin!.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve', note: 'Delivery fixture approved for API regression.' }) })
      expect(decision.status, await decision.clone().text()).toBe(200)
    }

    const checkout = (id: string, offerId: string) => fetch(`${origin}/api/checkout/beats/${id}`, {
      method: 'POST', headers: { ...buyerHeaders, 'idempotency-key': randomUUID() }, body: JSON.stringify({ offerId }),
    })
    const compatibleMp3 = await checkout(contentId, 'mp3-only')
    expect(compatibleMp3.status).toBe(503)
    expect((await compatibleMp3.json() as { error: { code: string } }).error.code).toBe('STRIPE_PAYMENTS_DISABLED')
    const compatibleWav = await checkout(wavContentId, 'wav-only')
    expect(compatibleWav.status).toBe(503)
    expect((await compatibleWav.json() as { error: { code: string } }).error.code).toBe('STRIPE_PAYMENTS_DISABLED')
    for (const offerId of ['stems', 'multiple-formats', 'wrong-format']) {
      const rejected = await checkout(contentId, offerId)
      expect(rejected.status).toBe(409)
      expect((await rejected.json() as { error: { code: string } }).error.code).toBe('BEAT_DELIVERY_NOT_CONFIGURED')
    }

    const purchaseSnapshot = buildBeatPurchaseSnapshot(offers[0], mp3Asset)!
    const orderId = randomUUID()
    await runtime.repository.createBeatOrder({
      id: orderId, buyerId: buyer.id, sellerId: seller.id, contentId, offerId: offers[0].id, title: 'Night drive',
      amountMinor: 3000, commissionMinor: 150, processingEstimateMinor: 126, applicationFeeMinor: 276, sellerNetMinor: 2724,
      currency: 'usd', status: 'paid', purchaseSnapshot, createdAt: now, paidAt: now,
    })
    await runtime.repository.updateCatalog(contentId, { title: 'Night drive', type: 'beat', tagIds: ['test'], publicationStatus: 'published', assetId: wavAsset.id }, seller.id)
    const orderList = await fetch(`${origin}/api/orders`, { headers: { cookie: buyerHeaders.cookie } }).then(response => response.json()) as { data: Array<{ id: string; purchase: { usageSummary: string; deliverables: string[] } }> }
    expect(orderList.data.find(order => order.id === orderId)?.purchase).toMatchObject({ usageSummary: offers[0].usageSummary, deliverables: ['mp3'] })
    const download = await fetch(`${origin}/api/orders/${orderId}/download`, { headers: { cookie: buyerHeaders.cookie } })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('audio/mpeg')
    expect(download.headers.get('content-disposition')).toContain('Night%20drive.mp3')
    expect(Buffer.from(await download.arrayBuffer())).toEqual(mp3Bytes)
    const protectedDelete = await fetch(`${origin}/api/assets/${mp3Asset.id}`, { method: 'DELETE', headers: buyerHeaders })
    expect(protectedDelete.status).toBe(404)
    const sellerDelete = await fetch(`${origin}/api/assets/${mp3Asset.id}`, { method: 'DELETE', headers: sellerHeaders })
    expect(sellerDelete.status).toBe(409)
    await runtime.close()
  })
})
