// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHmac, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { AuthService } from './auth'
type LocalOrderView = { id: string; status: string; deliverables?: string[]; downloads?: Array<{ format: string; url: string }> }

const nativeFetch = globalThis.fetch.bind(globalThis)
const paymentId = '123456789'
const collectorId = 987654
const checkoutUrl = 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=synthetic-local-http'
const syntheticEnvironment = {
  MERCADOPAGO_CLIENT_ID: '123456',
  MERCADOPAGO_CLIENT_SECRET: 'synthetic-local-http-client-secret',
  MERCADOPAGO_WEBHOOK_SECRET: 'synthetic-local-http-webhook-secret-32-characters',
  BEATVAULT_MP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  BEATVAULT_MP_USD_MXN_RATE: '20',
  BEATVAULT_MP_MARKETPLACE_FEE_BPS: '500',
  BEATVAULT_PUBLIC_URL: 'https://beatvault.test',
}
const hasFfmpeg = spawnSync(process.env.BEATVAULT_FFMPEG_PATH || 'ffmpeg', ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0

// Real disposable HTTP server, repository, OAuth and signature verification.
// The fetch boundary blocks all external traffic and synthesizes only provider REST.
for (const enabled of [false, true]) describe(`local Mercado Pago HTTP (${enabled ? 'synthetic provider' : 'unconfigured defaults'})`, () => {
  let app: typeof import('./index')
  let runtime: ReturnType<typeof import('./repository').createRepository>
  let origin = ''
  let externalReference = ''
  let preferenceItems: unknown[] = []
  let providerStatus = 'approved'
  let refundedAmount = 0
  const gateway = { create: vi.fn(), retrieve: vi.fn(), refund: vi.fn(), oauth: vi.fn() }

  beforeAll(async () => {
    vi.resetModules()
    for (const [key, value] of Object.entries(syntheticEnvironment)) vi.stubEnv(key, enabled ? value : undefined)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (origin && url.origin === origin) return nativeFetch(input, init)
      if (!enabled || url.origin !== 'https://api.mercadopago.com') throw new Error('Unexpected external request blocked')
      const method = init?.method || 'GET'
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.pathname === '/oauth/token' && method === 'POST') {
        gateway.oauth(init)
        return json({ access_token: 'synthetic-seller-access-token', refresh_token: 'synthetic-seller-refresh-token', user_id: collectorId, live_mode: false, expires_in: 3600, scope: 'read write offline_access' })
      }
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-seller-access-token')
      if (url.pathname === '/checkout/preferences' && method === 'POST') {
        const body = JSON.parse(String(init?.body))
        gateway.create(body)
        externalReference = body.external_reference
        preferenceItems = body.items
        return json({ id: 'synthetic-local-http', collector_id: collectorId, sandbox_init_point: checkoutUrl })
      }
      if (url.pathname === `/v1/payments/${paymentId}` && method === 'GET') {
        gateway.retrieve(init)
        return json({ id: Number(paymentId), collector_id: collectorId, application_id: syntheticEnvironment.MERCADOPAGO_CLIENT_ID,
          order: { id: 456789, type: 'mercadopago' }, external_reference: externalReference, live_mode: false, currency_id: 'MXN', transaction_amount: 780,
          transaction_amount_refunded: refundedAmount, status: providerStatus, status_detail: providerStatus === 'approved' ? 'accredited' : 'refunded' })
      }
      if (url.pathname === '/merchant_orders/456789' && method === 'GET') return json({ id: 456789, collector: { id: collectorId },
        application_id: syntheticEnvironment.MERCADOPAGO_CLIENT_ID, marketplace: `MP-MKT-${syntheticEnvironment.MERCADOPAGO_CLIENT_ID}`,
        external_reference: externalReference, preference_id: 'synthetic-local-http', payments: [{ id: Number(paymentId), currency_id: 'MXN', transaction_amount: 780 }] })
      if (url.pathname === '/checkout/preferences/synthetic-local-http' && method === 'GET') return json({ id: 'synthetic-local-http', collector_id: collectorId,
        client_id: syntheticEnvironment.MERCADOPAGO_CLIENT_ID, marketplace: `MP-MKT-${syntheticEnvironment.MERCADOPAGO_CLIENT_ID}`,
        external_reference: externalReference, marketplace_fee: 39, items: preferenceItems })
      if (url.pathname === `/v1/payments/${paymentId}/refunds` && method === 'POST') {
        gateway.refund(init)
        return json({ id: 3456789, status: 'approved' })
      }
      throw new Error('Unexpected provider endpoint blocked')
    }))
    app = await import('./index')
    runtime = (await import('./repository')).createRepository()
    await app.auth.initialize()
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  }, 30000)

  afterAll(async () => {
    if (app) await new Promise<void>(resolve => app.server.close(() => resolve()))
    if (runtime) await runtime.close()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  if (!enabled) it('rejects authenticated checkout when payment configuration is absent', async () => {
    const password = 'Synthetic-disabled-checkout-password'
    const account = await app.auth.register(`disabled-${randomUUID()}@beatvault.test`, password)
    const session = (await app.auth.login(account.email, password))!
    const response = await fetch(`${origin}/api/checkout/beats/${randomUUID()}`, { method: 'POST',
      headers: { cookie: `beatvault_session=${session.token}`, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ offerId: 'mp3-wav' }) })
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe('MERCADOPAGO_PAYMENTS_DISABLED')
    expect(gateway.create).not.toHaveBeenCalled()
    expect(gateway.oauth).not.toHaveBeenCalled()
  })

  if (enabled) it.skipIf(!hasFfmpeg)('connects a seller, buys an approved offer, reconciles signed payment and holds delivery during refund', async () => {
    const repo = runtime.repository
    const suffix = randomUUID()
    const password = 'Synthetic-purchase-http-password'
    const register = async (kind: string) => {
      const account = await app.auth.register(`${kind}-${suffix}@beatvault.test`, password)
      return { account, session: (await app.auth.login(account.email, password))! }
    }
    const seller = await register('seller')
    const buyer = await register('buyer')
    const stranger = await register('stranger')
    const managerAccount = await app.auth.register(`manager-${suffix}@beatvault.test`, password)
    await app.auth.assignStaffRole(managerAccount.id, 'community_manager')
    const manager = { account: managerAccount, session: (await app.auth.login(managerAccount.email, password))! }
    const { bootstrapAdmin } = await import('./bootstrap')
    await bootstrapAdmin({ NODE_ENV: 'test', BEATVAULT_ADMIN_EMAIL: `admin-${suffix}@beatvault.test`, BEATVAULT_ADMIN_PASSWORD: password, BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: 'synthetic-local-http-bootstrap-token-32-characters' }, repo)
    const admin = { session: (await app.auth.login(`admin-${suffix}@beatvault.test`, password))! }
    type Session = NonNullable<Awaited<ReturnType<AuthService['login']>>>
    const headers = (session: Session) => ({ cookie: `beatvault_session=${session.token}`, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' })
    const post = (path: string, session: Session, body: unknown) => fetch(`${origin}${path}`, { method: 'POST', headers: headers(session), body: JSON.stringify(body) })

    const wav = Buffer.alloc(16044)
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
    const uploadBody = new FormData()
    uploadBody.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'complete-purchased-beat.wav')
    const uploaded = await fetch(`${origin}/api/assets/upload`, { method: 'POST', headers: { cookie: headers(seller.session).cookie, 'x-csrf-token': seller.session.csrfToken }, body: uploadBody })
    expect(uploaded.status, await uploaded.clone().text()).toBe(201)
    const asset = (await uploaded.json()).data as { id: string; previewStorageKey?: string }
    expect(asset.previewStorageKey).toBeTruthy()
    const catalog = await post('/api/catalog', seller.session, { title: 'Synthetic purchase HTTP beat', type: 'beat', tagIds: ['qa'], assetId: asset.id, publicationStatus: 'pending-review' })
    expect(catalog.status, await catalog.clone().text()).toBe(201)
    const contentId = (await catalog.json()).data.contentId as string
    const listing = {
      description: 'Original production prepared only for a disposable local purchase test.', genre: 'Hip hop', bpm: 90, explicitContent: false,
      rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, declarationAccepted: true, collaborators: [] },
      offers: [{ id: 'mp3-wav', label: 'MP3 and WAV license', amountMinor: 3900, currency: 'USD', deliverables: ['mp3', 'wav'], usageSummary: 'Synthetic non-exclusive terms for local automated testing only.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
    }
    const saved = await fetch(`${origin}/api/seller/beat-listings/${contentId}`, { method: 'PUT', headers: headers(seller.session), body: JSON.stringify(listing) })
    expect(saved.status, await saved.clone().text()).toBe(201)
    const publish = await post(`/api/staff/catalog-review/${contentId}`, manager.session, { decision: 'approve', note: 'Synthetic local audio reviewed.' })
    expect(publish.status, await publish.clone().text()).toBe(200)
    const recommendation = await post(`/api/staff/marketplace-review/${contentId}`, manager.session, { decision: 'recommend', note: 'Synthetic local listing recommended.' })
    expect(recommendation.status, await recommendation.clone().text()).toBe(200)
    const approval = await post(`/api/admin/marketplace-listings/${contentId}`, admin.session, { decision: 'approve', note: 'Synthetic local offer approved.' })
    expect(approval.status, await approval.clone().text()).toBe(200)
    const authorization = await post('/api/payments/mercadopago/oauth/start', seller.session, {})
    expect(authorization.status, await authorization.clone().text()).toBe(200)
    const authorizationUrl = new URL((await authorization.json()).data.url)
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
    const state = authorizationUrl.searchParams.get('state')!
    const callback = await fetch(`${origin}/api/payments/mercadopago/oauth/callback?state=${encodeURIComponent(state)}&code=synthetic-local-code`, { headers: headers(seller.session), redirect: 'manual' })
    expect(callback.status).toBe(303)
    expect(callback.headers.get('location')).toContain('paymentAccount=connected')
    expect(gateway.oauth).toHaveBeenCalledOnce()
    const detail = await fetch(`${origin}/api/catalog/${contentId}`).then(response => response.json())
    expect(detail.data.purchaseOffers).toMatchObject([{ id: 'mp3-wav', available: true }])

    const orderId = randomUUID()
    const checkoutPath = `${origin}/api/checkout/beats/${contentId}`
    const noCsrf = await fetch(checkoutPath, { method: 'POST', headers: { cookie: headers(buyer.session).cookie, 'content-type': 'application/json', 'Idempotency-Key': orderId }, body: JSON.stringify({ offerId: 'mp3-wav' }) })
    expect(noCsrf.status).toBe(403)
    expect(gateway.create).not.toHaveBeenCalled()
    const checkoutRequest = () => fetch(checkoutPath, { method: 'POST', headers: { ...headers(buyer.session), 'Idempotency-Key': orderId }, body: JSON.stringify({ offerId: 'mp3-wav' }) })
    const checkout = await checkoutRequest()
    expect(gateway.create).toHaveBeenCalledOnce()
    expect(checkout.status, await checkout.clone().text()).toBe(201)
    expect((await checkout.json()).data).toEqual({ orderId, url: checkoutUrl })
    expect(gateway.create.mock.calls[0][0]).toMatchObject({ external_reference: orderId, marketplace_fee: 39,
      items: [{ currency_id: 'MXN', unit_price: 780, quantity: 1 }], notification_url: 'https://beatvault.test/api/webhooks/mercadopago' })
    const retry = await checkoutRequest()
    expect(retry.status).toBe(200)
    expect((await retry.json()).data).toEqual({ orderId, url: checkoutUrl })
    expect(gateway.create).toHaveBeenCalledOnce()
    const orders = async () => (await fetch(`${origin}/api/orders`, { headers: headers(buyer.session) }).then(response => response.json())).data as LocalOrderView[]
    expect((await orders())[0]).toMatchObject({ status: 'pending', downloads: [] })
    const download = (format: string, session = buyer.session) => fetch(`${origin}/api/orders/${orderId}/download?format=${format}`, { headers: headers(session) })
    expect((await download('wav')).status).toBe(404)

    const ts = String(Math.floor(Date.now() / 1000))
    const webhook = (requestId: string, invalid = false) => {
      const digest = createHmac('sha256', syntheticEnvironment.MERCADOPAGO_WEBHOOK_SECRET).update(`id:${paymentId};request-id:${requestId};ts:${ts};`).digest('hex')
      return fetch(`${origin}/api/webhooks/mercadopago?data.id=${paymentId}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${invalid ? '0'.repeat(64) : digest}` },
        body: JSON.stringify({ type: 'payment', action: 'payment.updated', user_id: collectorId, data: { id: paymentId } }) })
    }
    expect((await webhook('invalid-payment', true)).status).toBe(400)
    expect(gateway.retrieve).not.toHaveBeenCalled()
    expect((await orders())[0].status).toBe('pending')
    const paid = await webhook('approved-payment')
    expect(paid.status, await paid.clone().text()).toBe(200)
    expect((await orders())[0]).toMatchObject({ id: orderId, status: 'paid', deliverables: ['mp3', 'wav'], downloads: [{ format: 'mp3' }, { format: 'wav' }] })
    expect((await webhook('approved-payment').then(response => response.json())).duplicate).toBe(true)
    expect(gateway.retrieve).toHaveBeenCalledOnce()

    expect((await download('wav', stranger.session)).status).toBe(404)
    expect((await download('stems')).status).toBe(400)
    const downloadedWav = await download('wav')
    expect(downloadedWav.status).toBe(200)
    expect(downloadedWav.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await downloadedWav.arrayBuffer())).toEqual(wav)
    const downloadedMp3 = await download('mp3')
    expect(downloadedMp3.status).toBe(200)
    expect(downloadedMp3.headers.get('content-type')).toBe('audio/mpeg')
    const mp3 = Buffer.from(await downloadedMp3.arrayBuffer())
    expect(mp3.length).toBeGreaterThan(100)
    expect(mp3.equals(wav)).toBe(false)
    expect(mp3.subarray(0, 4).toString('ascii')).not.toBe('RIFF')

    const requestedRefund = await post(`/api/admin/beat-orders/${orderId}/refund`, admin.session, { reason: 'requested_by_customer' })
    expect(requestedRefund.status, await requestedRefund.clone().text()).toBe(202)
    expect(gateway.refund).toHaveBeenCalledOnce()
    expect(new Headers(gateway.refund.mock.calls[0][0].headers).get('x-idempotency-key')).toMatch(/^[a-f0-9]{64}$/)
    expect((await orders())[0]).toMatchObject({ status: 'refund_pending', downloads: [] })
    expect((await download('wav')).status).toBe(404)
    // Provider acknowledgment is not refund confirmation; a still-approved
    // observation must retain the local delivery hold.
    expect((await webhook('approved-after-refund-request')).status).toBe(200)
    expect((await orders())[0]).toMatchObject({ status: 'refund_pending', downloads: [] })
    providerStatus = 'refunded'
    refundedAmount = 780
    expect((await webhook('confirmed-refund')).status).toBe(200)
    expect((await orders())[0]).toMatchObject({ status: 'refunded', downloads: [] })
    providerStatus = 'approved'
    refundedAmount = 0
    expect((await webhook('stale-approval-after-refund')).status).toBe(200)
    expect((await orders())[0]).toMatchObject({ status: 'refunded', downloads: [] })
    expect((await download('mp3')).status).toBe(404)
    expect((await download('wav')).status).toBe(404)
  }, 60000)
})
