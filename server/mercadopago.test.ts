import { createHash, createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { MercadoPagoAesGcmCipher, MercadoPagoProvider, type MercadoPagoOAuthIntent, type MercadoPagoPreference,
  type MercadoPagoPreferenceClaim, type MercadoPagoPreferenceReservation, type MercadoPagoPreferenceStore,
  type MercadoPagoQuote, type MercadoPagoRepository, type MercadoPagoSellerLink, type MercadoPagoSettings } from './mercadopago'

const clock = Date.parse('2026-10-27T12:00:00.000Z')
const binding = 'a'.repeat(64)
const orderId = '11111111-1111-4111-8111-111111111111'
const settings: MercadoPagoSettings = { clientId: '123456', clientSecret: 'synthetic-client-secret', webhookSecret: 'synthetic-webhook-secret',
  redirectUri: 'https://beatvault.test/api/mercadopago/callback', publicOrigin: 'https://beatvault.test', notificationUrl: 'https://beatvault.test/api/webhooks/mercadopago', mode: 'test' }
const token = { access_token: 'synthetic-seller-access-token', refresh_token: 'synthetic-seller-refresh-token', user_id: 987654,
  expires_in: 180 * 86400, live_mode: false, scope: 'offline_access payments write' }
const preference = { id: '987654-synthetic-preference', collector_id: 987654,
  sandbox_init_point: 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=987654-synthetic-preference',
  init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=987654-synthetic-preference' }
const quote: MercadoPagoQuote = { accountId: 'seller', buyerId: 'buyer', orderId, amountMinor: 4155, commissionMinor: 207, currency: 'MXN', title: 'Original beat', idempotencyKey: 'synthetic-operation-1' }
const lookup = { accountId: 'seller', paymentId: '123456789', orderId, amountMinor: 4155, currency: 'MXN' as const,
  preferenceId: preference.id, commissionMinor: 207, itemId: orderId, title: quote.title }
const payment = { id: 123456789, collector_id: 987654, external_reference: orderId, application_id: 123456, currency_id: 'MXN', live_mode: false,
  order: { id: 456789, type: 'mercadopago' }, transaction_amount: '41.55', transaction_amount_refunded: 0, status: 'approved', status_detail: 'accredited' }
const preferenceSnapshot = { ...preference, client_id: settings.clientId, marketplace: `MP-MKT-${settings.clientId}`, external_reference: orderId,
  marketplace_fee: 2.07, items: [{ id: orderId, title: quote.title, quantity: 1, currency_id: 'MXN', unit_price: '41.55' }] }
const merchantOrder = { id: 456789, collector: { id: 987654 }, application_id: settings.clientId, marketplace: `MP-MKT-${settings.clientId}`,
  external_reference: orderId, preference_id: preference.id, payments: [{ id: payment.id, currency_id: 'MXN', transaction_amount: '41.55' }] }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const resource = (url: unknown) => response(String(url).includes('/merchant_orders/') ? merchantOrder : String(url).includes('/checkout/preferences/') ? preferenceSnapshot : payment)

function fixture(overrides: Partial<MercadoPagoSettings> = {}) {
  let now = clock
  const intents = new Map<string, MercadoPagoOAuthIntent>()
  const links = new Map<string, MercadoPagoSellerLink>()
  const reservations = new Map<string, { fingerprint: string; state: 'busy' | 'complete' | 'uncertain'; result?: MercadoPagoPreference }>()
  const scopeKey = (accountId: string, applicationId: string, mode: string) => `${mode}:${applicationId}:${accountId}`
  const repository: MercadoPagoRepository = {
    async createOAuthIntent(intent) { intents.set(intent.stateHash, structuredClone(intent)) },
    async consumeOAuthIntent(hash, sessionHash, timestamp) {
      const intent = intents.get(hash)
      if (!intent || intent.sessionBindingHash !== sessionHash) return undefined
      intents.delete(hash)
      return Date.parse(intent.expiresAt) > Date.parse(timestamp) ? structuredClone(intent) : undefined
    },
    async findSellerLink({ accountId, applicationId, mode }) { const link = links.get(scopeKey(accountId, applicationId, mode)); return link ? structuredClone(link) : undefined },
    async saveSellerLink(link, expectedVersion) {
      const key = scopeKey(link.accountId, link.applicationId, link.mode), current = links.get(key)
      if ((current?.version ?? 0) !== expectedVersion || link.version !== expectedVersion + 1 || [...links.values()].some(other => other.accountId !== link.accountId && other.applicationId === link.applicationId && other.mode === link.mode && other.providerUserId === link.providerUserId)) return false
      links.set(key, structuredClone(link)); return true
    },
  }
  const preferences: MercadoPagoPreferenceStore = {
    async reservePreference(request: MercadoPagoPreferenceReservation): Promise<MercadoPagoPreferenceClaim> {
      const existing = reservations.get(request.key)
      if (existing?.fingerprint && existing.fingerprint !== request.fingerprint) return { state: 'conflict' }
      if (existing?.state === 'complete') return { state: 'complete', result: structuredClone(existing.result!) }
      if (existing) return { state: existing.state as 'busy' | 'uncertain' }
      reservations.set(request.key, { fingerprint: request.fingerprint, state: 'busy' }); return { state: 'reserved' }
    },
    async completePreference(key, fingerprint, result) {
      if (reservations.get(key)?.fingerprint !== fingerprint) throw new Error('Unexpected preference claim')
      reservations.set(key, { fingerprint, state: 'complete', result: structuredClone(result) })
    },
    async failPreference(key, fingerprint, uncertain) {
      if (reservations.get(key)?.fingerprint !== fingerprint) throw new Error('Unexpected preference claim')
      if (uncertain) reservations.set(key, { fingerprint, state: 'uncertain' }); else reservations.delete(key)
    },
  }
  const fetcher = vi.fn<typeof fetch>(async url => resource(url))
  const cipher = new MercadoPagoAesGcmCipher(randomBytes(32))
  const provider = new MercadoPagoProvider({ ...settings, ...overrides }, repository, cipher, fetcher, () => now, preferences)
  const seed = async (patch: Partial<MercadoPagoSellerLink> = {}) => {
    const context = `mercadopago:test:${settings.clientId}:seller`
    const link: MercadoPagoSellerLink = { accountId: 'seller', applicationId: settings.clientId, mode: 'test', providerUserId: '987654',
      encryptedAccessToken: cipher.seal(token.access_token, `${context}:access`), encryptedRefreshToken: cipher.seal(token.refresh_token, `${context}:refresh`),
      accessTokenExpiresAt: new Date(clock + 3600000).toISOString(), version: 1, status: 'connected', updatedAt: new Date(clock).toISOString(), ...patch }
    links.set(scopeKey(link.accountId, link.applicationId, link.mode), link)
    return link
  }
  return { provider, repository, preferences, cipher, fetcher, intents, links, reservations, seed, setNow: (value: number) => { now = value } }
}

describe('Mercado Pago Mexico provider', () => {
  it('keeps ciphertext bound to seller/application/mode with authenticated encryption', () => {
    const cipher = new MercadoPagoAesGcmCipher(randomBytes(32))
    const encrypted = cipher.seal('synthetic-sensitive-token', 'seller-one')
    expect(encrypted).not.toContain('synthetic-sensitive-token')
    expect(cipher.open(encrypted, 'seller-one')).toBe('synthetic-sensitive-token')
    expect(() => cipher.open(encrypted, 'seller-two')).toThrow('MP_CREDENTIAL_DECRYPT_FAILED')
    expect(cipher.seal('synthetic-sensitive-token', 'seller-one')).not.toBe(encrypted)
  })

  it('uses single-use session-bound state and PKCE without exposing seller credentials', async () => {
    const f = fixture()
    const authorization = new URL((await f.provider.beginAuthorization({ accountId: 'seller', sessionBindingHash: binding })).url)
    expect(authorization.origin).toBe('https://auth.mercadopago.com.mx')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('redirect_uri')).toBe(settings.redirectUri)
    const state = authorization.searchParams.get('state')!
    const stored = [...f.intents.values()][0]
    expect(stored.stateHash).toBe(createHash('sha256').update(state).digest('hex'))
    expect(JSON.stringify(stored)).not.toContain(state)
    const verifier = f.cipher.open(stored.encryptedCodeVerifier, `mercadopago:test:${settings.clientId}:seller:pkce:${stored.stateHash}`)
    expect(authorization.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'))
    f.fetcher.mockResolvedValueOnce(response(token))
    await expect(f.provider.completeAuthorization({ accountId: 'seller', sessionBindingHash: 'b'.repeat(64), state, code: 'synthetic-code' })).rejects.toThrow('MP_OAUTH_STATE_INVALID')
    expect(f.intents.size).toBe(1)
    const linked = await f.provider.completeAuthorization({ accountId: 'seller', sessionBindingHash: binding, state, code: 'synthetic-code' })
    expect(linked).toMatchObject({ accountId: 'seller', providerUserId: '987654', mode: 'test', revoked: false })
    expect(JSON.stringify(linked)).not.toContain(token.access_token)
    expect(JSON.stringify([...f.links.values()])).not.toContain(token.refresh_token)
    const request = f.fetcher.mock.calls[0]
    expect(request[0]).toBe('https://api.mercadopago.com/oauth/token')
    expect(new URLSearchParams(String(request[1]?.body)).get('code_verifier')).toBe(verifier)
    await expect(f.provider.completeAuthorization({ accountId: 'seller', sessionBindingHash: binding, state, code: 'synthetic-code' })).rejects.toThrow('MP_OAUTH_STATE_INVALID')
    expect(f.fetcher).toHaveBeenCalledOnce()
  })

  it('rejects expired OAuth state and production credentials in test mode', async () => {
    const f = fixture()
    const state = new URL((await f.provider.beginAuthorization({ accountId: 'seller', sessionBindingHash: binding })).url).searchParams.get('state')!
    f.setNow(clock + 300001)
    await expect(f.provider.completeAuthorization({ accountId: 'seller', sessionBindingHash: binding, state, code: 'code' })).rejects.toThrow('MP_OAUTH_STATE_INVALID')
    expect(f.fetcher).not.toHaveBeenCalled()
    const next = new URL((await f.provider.beginAuthorization({ accountId: 'seller', sessionBindingHash: binding })).url).searchParams.get('state')!
    f.fetcher.mockResolvedValueOnce(response({ ...token, live_mode: true }))
    await expect(f.provider.completeAuthorization({ accountId: 'seller', sessionBindingHash: binding, state: next, code: 'code' })).rejects.toThrow('MP_OAUTH_RESPONSE_INVALID')
    expect(f.links.size).toBe(0)
  })

  it('rotates access and refresh tokens atomically and never returns plaintext tokens', async () => {
    const f = fixture(); await f.seed()
    f.fetcher.mockResolvedValueOnce(response({ ...token, access_token: 'rotated-access', refresh_token: 'rotated-refresh' }))
    const refreshed = await f.provider.refreshSeller('seller')
    expect(JSON.stringify(refreshed)).not.toContain('rotated-access')
    const link = [...f.links.values()][0]
    expect(link.version).toBe(2)
    expect(f.cipher.open(link.encryptedRefreshToken, `mercadopago:test:${settings.clientId}:seller:refresh`)).toBe('rotated-refresh')
    expect(new URLSearchParams(String(f.fetcher.mock.calls[0][1]?.body)).get('grant_type')).toBe('refresh_token')
  })

  it('serializes simultaneous expired-token requests rather than rotating twice', async () => {
    const f = fixture(); await f.seed({ accessTokenExpiresAt: new Date(clock - 1).toISOString() })
    f.fetcher.mockImplementation(async url => String(url).endsWith('/oauth/token') ? response(token) : resource(url))
    await Promise.all([f.provider.getPayment(lookup), f.provider.getPayment(lookup)])
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/oauth/token'))).toHaveLength(1)
    expect(f.fetcher).toHaveBeenCalledTimes(7)
  })

  it('marks invalid refresh authorization for reconnect without leaking provider error details', async () => {
    const f = fixture(); await f.seed()
    f.fetcher.mockResolvedValueOnce(response({ error: 'invalid_grant', sensitive: token.refresh_token }, 400))
    await expect(f.provider.refreshSeller('seller')).rejects.toThrow('MP_RECONNECT_REQUIRED')
    expect([...f.links.values()][0].status).toBe('reauthorization_required')
    await expect(f.provider.getPayment(lookup)).rejects.toThrow('MP_RECONNECT_REQUIRED')
    expect(f.fetcher).toHaveBeenCalledOnce()
  })

  it('creates Split 1:1 preferences from trusted integer-cent quotes using only the seller token', async () => {
    const f = fixture(); await f.seed(); f.fetcher.mockResolvedValueOnce(response(preference, 201))
    const created = await f.provider.createPreference(quote)
    expect(created).toMatchObject({ preferenceId: preference.id, collectorId: '987654', orderId, amountMinor: 4155, commissionMinor: 207, currency: 'MXN' })
    const [url, request] = f.fetcher.mock.calls[0]
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences')
    expect(request?.headers).toMatchObject({ Authorization: `Bearer ${token.access_token}` })
    expect(JSON.parse(String(request?.body))).toMatchObject({ external_reference: orderId, marketplace_fee: 2.07, items: [{ quantity: 1, currency_id: 'MXN', unit_price: 41.55 }] })
    expect(request?.headers).not.toHaveProperty('X-Idempotency-Key')
    expect(await f.provider.createPreference({ ...quote, idempotencyKey: 'another-operation-key' })).toEqual(created)
    expect(f.fetcher).toHaveBeenCalledOnce()
    await expect(f.provider.createPreference({ ...quote, amountMinor: 9999 })).rejects.toThrow('MP_IDEMPOTENCY_CONFLICT')
  })

  it('never blindly recreates a preference after an ambiguous network result', async () => {
    const f = fixture(); await f.seed(); f.fetcher.mockRejectedValueOnce(new Error('network detail must not escape'))
    await expect(f.provider.createPreference(quote)).rejects.toThrow('MP_NETWORK_ERROR')
    await expect(f.provider.createPreference(quote)).rejects.toThrow('MP_PREFERENCE_UNCERTAIN')
    expect(f.fetcher).toHaveBeenCalledOnce()
  })

  it('rejects foreign collectors and unsafe checkout URLs before exposing the preference', async () => {
    for (const invalid of [{ ...preference, collector_id: 999999 }, { ...preference, sandbox_init_point: `https://evil.example/checkout/?pref_id=${preference.id}` }]) {
      const f = fixture(); await f.seed(); f.fetcher.mockResolvedValueOnce(response(invalid))
      await expect(f.provider.createPreference(quote)).rejects.toThrow(/MP_PREFERENCE_RESPONSE_INVALID|MP_CHECKOUT_URL_INVALID/)
      expect([...f.reservations.values()][0].state).toBe('uncertain')
    }
  })

  it.each([
    ['approved', 'accredited', 0, true, 'paid'],
    ['approved', 'partially_refunded', 0, false, 'partially_refunded'],
    ['approved', 'accredited', '1.00', false, 'partially_refunded'],
    ['authorized', 'pending_capture', 0, false, 'pending'],
    ['pending', 'pending_waiting_payment', 0, false, 'pending'],
    ['in_process', 'pending_review_manual', 0, false, 'pending'],
    ['in_mediation', 'pending', 0, false, 'disputed'],
    ['charged_back', 'settled', 0, false, 'disputed'],
    ['refunded', 'refunded', '41.55', false, 'refunded'],
    ['rejected', 'bank_error', 0, false, 'failed'],
  ])('reconciles %s/%s with refunded=%s without granting prematurely', async (status, statusDetail, refunded, canDownload, normalizedStatus) => {
    const f = fixture(); await f.seed()
    f.fetcher.mockResolvedValueOnce(response({ ...payment, status, status_detail: statusDetail, transaction_amount_refunded: refunded }))
    await expect(f.provider.getPayment(lookup)).resolves.toMatchObject({ canDownload, normalizedStatus, orderId, collectorId: '987654', currency: 'MXN', amountMinor: 4155 })
  })

  it.each([{ collector_id: 99999 }, { external_reference: '22222222-2222-4222-8222-222222222222' }, { transaction_amount: '99.99' }, { currency_id: 'USD' }, { live_mode: true }, { application_id: 99999 }, { transaction_amount: '41.551' }])('rejects payment identity/amount/currency/environment mismatches: %j', async mismatch => {
    const f = fixture(); await f.seed(); f.fetcher.mockResolvedValueOnce(response({ ...payment, ...mismatch }))
    await expect(f.provider.getPayment(lookup)).rejects.toThrow(/MP_PAYMENT_MISMATCH|MP_AMOUNT_INVALID/)
  })

  it('can retrieve a first notification resource for a seller before its payment ID is associated with an internal order', async () => {
    const f = fixture(); await f.seed(); f.fetcher.mockResolvedValueOnce(response(payment))
    await expect(f.provider.retrievePaymentForSeller({ accountId: 'seller', paymentId: lookup.paymentId })).resolves.toMatchObject({ paymentId: lookup.paymentId, orderId, collectorId: '987654', amountMinor: 4155 })
    expect(f.fetcher.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/123456789')
  })

  it.each([
    ['payment lacks merchant order', { ...payment, order: undefined }, merchantOrder, preferenceSnapshot],
    ['merchant is another app', payment, { ...merchantOrder, application_id: '99999' }, preferenceSnapshot],
    ['merchant is another seller', payment, { ...merchantOrder, collector: { id: 99999 } }, preferenceSnapshot],
    ['merchant is not this marketplace', payment, { ...merchantOrder, marketplace: 'NONE' }, preferenceSnapshot],
    ['merchant payment missing', payment, { ...merchantOrder, payments: [] }, preferenceSnapshot],
    ['merchant preference changed', payment, { ...merchantOrder, preference_id: 'foreign-preference' }, preferenceSnapshot],
    ['preference is another app', payment, merchantOrder, { ...preferenceSnapshot, client_id: 99999 }],
    ['preference is another seller', payment, merchantOrder, { ...preferenceSnapshot, collector_id: 99999 }],
    ['preference marketplace changed', payment, merchantOrder, { ...preferenceSnapshot, marketplace: 'NONE' }],
    ['preference reference changed', payment, merchantOrder, { ...preferenceSnapshot, external_reference: 'another-order' }],
    ['preference commission changed', payment, merchantOrder, { ...preferenceSnapshot, marketplace_fee: 1 }],
    ['preference item changed', payment, merchantOrder, { ...preferenceSnapshot, items: [{ ...preferenceSnapshot.items[0], id: 'another-order' }] }],
    ['preference title changed', payment, merchantOrder, { ...preferenceSnapshot, items: [{ ...preferenceSnapshot.items[0], title: 'Different license' }] }],
    ['preference amount changed', payment, merchantOrder, { ...preferenceSnapshot, items: [{ ...preferenceSnapshot.items[0], unit_price: 1 }] }],
    ['preference quantity changed', payment, merchantOrder, { ...preferenceSnapshot, items: [{ ...preferenceSnapshot.items[0], quantity: 2 }] }],
  ])('rejects a copied order reference when %s', async (_label, paymentValue, merchantValue, preferenceValue) => {
    const f = fixture(); await f.seed()
    f.fetcher.mockImplementation(async url => response(String(url).includes('/merchant_orders/') ? merchantValue : String(url).includes('/checkout/preferences/') ? preferenceValue : paymentValue))
    await expect(f.provider.getPayment(lookup)).rejects.toThrow('MP_PAYMENT_MISMATCH')
  })

  it('uses stable refund keys and reports request acknowledgement rather than claiming completed reimbursement', async () => {
    const f = fixture(); await f.seed()
    f.fetcher.mockImplementation(async url => String(url).endsWith('/refunds') ? response({ id: 554433, payment_id: 123456789, status: 'approved' }, 201) : resource(url))
    const refund = { ...lookup, amountToRefundMinor: 1000, idempotencyKey: 'refund-operation-1' }
    await expect(f.provider.requestRefund(refund)).resolves.toMatchObject({ status: 'requested', refundId: '554433', providerStatus: 'approved' })
    await f.provider.requestRefund(refund)
    const calls = f.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refunds'))
    expect(calls[0][1]?.headers).toHaveProperty('X-Idempotency-Key')
    expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers)
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ amount: 10 })
  })

  it('does not call refund for a mismatched payment or mark insufficient-funds errors as success', async () => {
    const f = fixture(); await f.seed(); f.fetcher.mockResolvedValueOnce(response({ ...payment, collector_id: 99999 }))
    await expect(f.provider.requestRefund({ ...lookup, idempotencyKey: 'refund-operation-2' })).rejects.toThrow('MP_PAYMENT_MISMATCH')
    expect(f.fetcher).toHaveBeenCalledOnce()
    f.fetcher.mockImplementation(async url => String(url).endsWith('/refunds') ? response({ error: 'insufficient_funds' }, 400) : resource(url))
    await expect(f.provider.requestRefund({ ...lookup, idempotencyKey: 'refund-operation-2' })).rejects.toMatchObject({ code: 'MP_HTTP_ERROR', httpStatus: 400 })
  })

  it('verifies the Mercado Pago manifest, not a Stripe-style body, and rejects tampering/duplicate fields', () => {
    const f = fixture({ webhookToleranceMs: 300000 })
    const timestamp = String(clock / 1000), requestId = 'request-123', dataId = 'ABC123'
    const digest = createHmac('sha256', settings.webhookSecret).update(`id:abc123;request-id:${requestId};ts:${timestamp};`).digest('hex')
    const input = { xSignature: `ts=${timestamp},v1=${digest}`, xRequestId: requestId, dataId }
    expect(f.provider.verifyWebhook(input)).toEqual({ resourceId: 'abc123', requestId, timestamp })
    expect(() => f.provider.verifyWebhook({ ...input, dataId: 'tampered' })).toThrow('MP_WEBHOOK_SIGNATURE_INVALID')
    expect(() => f.provider.verifyWebhook({ ...input, xRequestId: 'other-request' })).toThrow('MP_WEBHOOK_SIGNATURE_INVALID')
    expect(() => f.provider.verifyWebhook({ ...input, xSignature: `${input.xSignature},ts=${timestamp}` })).toThrow('MP_WEBHOOK_SIGNATURE_INVALID')
    f.setNow(clock + 300001)
    expect(() => f.provider.verifyWebhook(input)).toThrow('MP_WEBHOOK_TIMESTAMP_INVALID')
  })

  it('rejects unsafe configuration, path-like payment IDs and missing durable preference storage', async () => {
    expect(() => fixture({ publicOrigin: 'https://evil.example/path' })).toThrow('MP_CONFIGURATION_INVALID')
    expect(() => fixture({ redirectUri: 'http://evil.example/callback' })).toThrow('MP_URL_INVALID')
    expect(() => fixture({ mode: 'production' })).toThrow('MP_CONFIGURATION_INVALID')
    const f = fixture()
    await expect(f.provider.getPayment({ ...lookup, paymentId: '../../accounts' })).rejects.toThrow('MP_PAYMENT_LOOKUP_INVALID')
    await expect(new MercadoPagoProvider(settings, f.repository, f.cipher, f.fetcher).createPreference(quote)).rejects.toThrow('MP_PREFERENCE_STORE_REQUIRED')
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('bounds response payloads and refuses HTTP redirects without returning tokens in errors', async () => {
    const f = fixture(); await f.seed()
    f.fetcher.mockResolvedValueOnce(new Response('x'.repeat(1024 * 1024 + 1)))
    await expect(f.provider.getPayment(lookup)).rejects.toThrow('MP_RESPONSE_TOO_LARGE')
    expect(f.fetcher.mock.calls[0][1]?.redirect).toBe('error')
    f.fetcher.mockResolvedValueOnce(response({ error: token.access_token }, 500))
    await expect(f.provider.getPayment(lookup)).rejects.toMatchObject({ message: 'MP_HTTP_ERROR', retryable: true, httpStatus: 500 })
  })

  it('aborts timed-out preference requests and persists the ambiguity instead of creating another preference', async () => {
    const f = fixture({ requestTimeoutMs: 5 }); await f.seed()
    f.fetcher.mockImplementation((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }) }))
    await expect(f.provider.createPreference(quote)).rejects.toThrow('MP_REQUEST_TIMEOUT')
    await expect(f.provider.createPreference(quote)).rejects.toThrow('MP_PREFERENCE_UNCERTAIN')
    expect(f.fetcher).toHaveBeenCalledOnce()
  })
})
