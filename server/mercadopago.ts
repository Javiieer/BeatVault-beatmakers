import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Mexico Split 1:1: OAuth seller tokens + Checkout Pro Preferences, not Orders API.
// No module-level clients, secrets, network requests, or application configuration.
const apiOrigin = 'https://api.mercadopago.com'
export type MercadoPagoMode = 'test' | 'production'
export type MercadoPagoScope = { accountId: string; applicationId: string; mode: MercadoPagoMode }
export type MercadoPagoSettings = {
  clientId: string; clientSecret: string; redirectUri: string; publicOrigin: string
  notificationUrl: string; webhookSecret: string; mode: MercadoPagoMode
  allowLive?: boolean; allowLocalHttp?: boolean; requestTimeoutMs?: number; webhookToleranceMs?: number
}
export class MercadoPagoError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly httpStatus?: number) {
    super(code); this.name = 'MercadoPagoError'
  }
}
export interface MercadoPagoCipher {
  seal(plaintext: string, context: string): Promise<string> | string
  open(ciphertext: string, context: string): Promise<string> | string
}
export class MercadoPagoAesGcmCipher implements MercadoPagoCipher {
  private readonly key: Buffer
  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) throw new MercadoPagoError('MP_ENCRYPTION_KEY_INVALID')
    this.key = Buffer.from(key)
  }
  seal(plaintext: string, context: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(context))
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
  }
  open(ciphertext: string, context: string): string {
    try {
      const parts = ciphertext.split('.')
      if (parts.length !== 4 || parts[0] !== 'v1' || !parts.slice(1).every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error()
      const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url')
      if (iv.length !== 12 || tag.length !== 16) throw new Error()
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
      decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8')
    } catch { throw new MercadoPagoError('MP_CREDENTIAL_DECRYPT_FAILED') }
  }
}
export type MercadoPagoOAuthIntent = MercadoPagoScope & {
  stateHash: string; sessionBindingHash: string; encryptedCodeVerifier: string; createdAt: string; expiresAt: string
}
export type MercadoPagoSellerLink = MercadoPagoScope & {
  providerUserId: string; encryptedAccessToken: string; encryptedRefreshToken: string
  accessTokenExpiresAt: string; version: number; status: 'connected' | 'reauthorization_required' | 'deauthorized'; updatedAt: string
}
export type MercadoPagoPreference = {
  preferenceId: string; checkoutUrl: string; collectorId: string; orderId: string
  amountMinor: number; commissionMinor: number; currency: 'MXN'
}
export type MercadoPagoPreferenceReservation = MercadoPagoScope & {
  key: string; fingerprint: string; buyerId: string; orderId: string; operationId: string
}
export type MercadoPagoPreferenceClaim = { state: 'reserved' } | { state: 'complete'; result: MercadoPagoPreference } |
  { state: 'busy' | 'conflict' | 'uncertain' }
export interface MercadoPagoRepository {
  createOAuthIntent(intent: MercadoPagoOAuthIntent): Promise<void>
  /** Atomically consume only a matching, unexpired, unused intent. No raw OAuth state is stored. */
  consumeOAuthIntent(stateHash: string, sessionBindingHash: string, now: string): Promise<MercadoPagoOAuthIntent | undefined>
  findSellerLink(scope: MercadoPagoScope): Promise<MercadoPagoSellerLink | undefined>
  /** CAS on version AND unique (clientId, mode, providerUserId). False must not modify an existing link. */
  saveSellerLink(link: MercadoPagoSellerLink, expectedVersion: number): Promise<boolean>
  /** Serialize refresh-token rotation per seller/app/mode, including across API processes when hosted. */
  withSellerLock?<T>(scope: MercadoPagoScope, action: () => Promise<T>): Promise<T>
}
export interface MercadoPagoPreferenceStore {
  /** Atomically reserve by key, compare fingerprint, and return any previously persisted result. */
  reservePreference(request: MercadoPagoPreferenceReservation): Promise<MercadoPagoPreferenceClaim>
  completePreference(key: string, fingerprint: string, result: MercadoPagoPreference): Promise<void>
  /** Uncertain means the provider may have created a preference: do not blindly create another. */
  failPreference(key: string, fingerprint: string, uncertain: boolean): Promise<void>
}
export type MercadoPagoQuote = {
  accountId: string; buyerId: string; orderId: string; amountMinor: number
  commissionMinor: number; currency: 'MXN'; title: string; idempotencyKey: string
}
export type MercadoPagoPaymentLookup = {
  accountId: string; paymentId: string; orderId: string; amountMinor: number; currency: 'MXN'
  preferenceId: string; commissionMinor: number; itemId: string; title: string
}
export type MercadoPagoPayment = {
  paymentId: string; collectorId: string; orderId: string; amountMinor: number; refundedMinor: number
  preferenceId: string; commissionMinor: number; itemId: string; title: string
  /** Provider observation only: callers must also enforce order ownership and local refund/dispute holds with CAS. */
  currency: 'MXN'; status: string; statusDetail: string; mode: MercadoPagoMode; canDownload: boolean
  normalizedStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed'
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max = 4096): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const entityId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
const operationId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_-]{8,128}$/.test(value)
const providerId = (value: unknown): string | undefined => {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  return typeof normalized === 'string' && /^[1-9][0-9]{0,31}$/.test(normalized) ? normalized : undefined
}
const money = (value: unknown): number => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value
  if (typeof raw !== 'string' || !/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/.test(raw)) throw new MercadoPagoError('MP_AMOUNT_INVALID')
  const [whole, fraction = ''] = raw.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount)) throw new MercadoPagoError('MP_AMOUNT_INVALID')
  return amount
}
function safeUrl(value: string, allowLocalHttp: boolean) {
  let url: URL
  try { url = new URL(value) } catch { throw new MercadoPagoError('MP_URL_INVALID') }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(allowLocalHttp && loopback && url.protocol === 'http:'))) throw new MercadoPagoError('MP_URL_INVALID')
  return url
}
function checkoutUrl(value: unknown, mode: MercadoPagoMode, preferenceId: string): string {
  if (!text(value, 4096)) throw new MercadoPagoError('MP_CHECKOUT_URL_INVALID')
  const url = safeUrl(value, false)
  const expectedHosts = mode === 'test' ? ['sandbox.mercadopago.com.mx', 'sandbox.mercadopago.com'] : ['www.mercadopago.com.mx', 'www.mercadopago.com']
  if (!expectedHosts.includes(url.hostname) || url.port || url.hash || url.searchParams.getAll('pref_id').length !== 1 || url.searchParams.get('pref_id') !== preferenceId ||
    !(url.pathname.startsWith('/checkout/') || url.hostname.endsWith('.com') && url.pathname.startsWith('/mlm/checkout/'))) throw new MercadoPagoError('MP_CHECKOUT_URL_INVALID')
  return url.toString()
}

export class MercadoPagoProvider {
  private static readonly sellerLocks = new Map<string, Promise<void>>()
  private readonly settings: Readonly<MercadoPagoSettings>
  constructor(settings: MercadoPagoSettings, private readonly repository: MercadoPagoRepository,
    private readonly cipher: MercadoPagoCipher, private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now,
    private readonly preferences?: MercadoPagoPreferenceStore) {
    this.settings = Object.freeze({ ...settings })
    if (!/^[0-9]{1,40}$/.test(settings.clientId) || !text(settings.clientSecret) || !text(settings.webhookSecret) ||
      !['test', 'production'].includes(settings.mode) || settings.mode === 'production' && !settings.allowLive) throw new MercadoPagoError('MP_CONFIGURATION_INVALID')
    const redirect = safeUrl(settings.redirectUri, Boolean(settings.allowLocalHttp))
    const origin = safeUrl(settings.publicOrigin, Boolean(settings.allowLocalHttp))
    const notification = safeUrl(settings.notificationUrl, Boolean(settings.allowLocalHttp))
    if (redirect.search || redirect.hash || notification.hash || origin.origin !== settings.publicOrigin || origin.pathname !== '/' ||
      (settings.requestTimeoutMs !== undefined && (!Number.isSafeInteger(settings.requestTimeoutMs) || settings.requestTimeoutMs < 1 || settings.requestTimeoutMs > 120000)) ||
      (settings.webhookToleranceMs !== undefined && (!Number.isSafeInteger(settings.webhookToleranceMs) || settings.webhookToleranceMs < 0))) throw new MercadoPagoError('MP_CONFIGURATION_INVALID')
  }
  private scope(accountId: string): MercadoPagoScope {
    if (!entityId(accountId)) throw new MercadoPagoError('MP_ACCOUNT_INVALID')
    return { accountId, applicationId: this.settings.clientId, mode: this.settings.mode }
  }
  private context(scope: MercadoPagoScope, kind: string) { return `mercadopago:${scope.mode}:${scope.applicationId}:${scope.accountId}:${kind}` }
  private findSeller(scope: MercadoPagoScope) { return this.repository.findSellerLink(scope) }
  private async sellerLock<T>(scope: MercadoPagoScope, action: () => Promise<T>): Promise<T> {
    if (this.repository.withSellerLock) return this.repository.withSellerLock(scope, action)
    // Local single-process fallback. Hosted multi-process deployments must inject a
    // cross-process lease; CAS alone cannot serialize an external token rotation.
    const key = this.context(scope, 'tokens'), previous = MercadoPagoProvider.sellerLocks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.catch(() => undefined).then(() => current)
    MercadoPagoProvider.sellerLocks.set(key, tail)
    await previous.catch(() => undefined)
    try { return await action() }
    finally { release(); if (MercadoPagoProvider.sellerLocks.get(key) === tail) MercadoPagoProvider.sellerLocks.delete(key) }
  }
  private publicLink(link: MercadoPagoSellerLink) {
    return { accountId: link.accountId, providerUserId: link.providerUserId, mode: link.mode, expiresAt: link.accessTokenExpiresAt, revoked: link.status !== 'connected' }
  }
  async beginAuthorization(input: { accountId: string; sessionBindingHash: string }) {
    const scope = this.scope(input.accountId)
    if (!/^[a-f0-9]{64}$/i.test(input.sessionBindingHash)) throw new MercadoPagoError('MP_SESSION_BINDING_INVALID')
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
    const stateHash = hash(state)
    await this.repository.createOAuthIntent({ ...scope, stateHash, sessionBindingHash: input.sessionBindingHash,
      encryptedCodeVerifier: await this.cipher.seal(verifier, this.context(scope, `pkce:${stateHash}`)), createdAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + 5 * 60 * 1000).toISOString() })
    const url = new URL('https://auth.mercadopago.com.mx/authorization')
    url.search = new URLSearchParams({ client_id: this.settings.clientId, response_type: 'code', platform_id: 'mp', redirect_uri: this.settings.redirectUri,
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString()
    return { url: url.toString() }
  }
  async completeAuthorization(input: { accountId: string; sessionBindingHash: string; state: string; code: string }) {
    const scope = this.scope(input.accountId)
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(input.state) || !/^[a-f0-9]{64}$/i.test(input.sessionBindingHash) || !text(input.code, 2048)) throw new MercadoPagoError('MP_OAUTH_STATE_INVALID')
    const intent = await this.repository.consumeOAuthIntent(hash(input.state), input.sessionBindingHash, new Date(this.now()).toISOString())
    if (!intent || intent.stateHash !== hash(input.state) || !Number.isFinite(Date.parse(intent.expiresAt)) || Date.parse(intent.expiresAt) <= this.now() || intent.accountId !== scope.accountId || intent.mode !== scope.mode || intent.applicationId !== scope.applicationId ||
      intent.sessionBindingHash !== input.sessionBindingHash) throw new MercadoPagoError('MP_OAUTH_STATE_INVALID')
    const verifier = await this.cipher.open(intent.encryptedCodeVerifier, this.context(scope, `pkce:${intent.stateHash}`))
    const token = await this.request('/oauth/token', { form: { client_id: this.settings.clientId, client_secret: this.settings.clientSecret,
      grant_type: 'authorization_code', redirect_uri: this.settings.redirectUri, code: input.code, code_verifier: verifier } })
    return this.sellerLock(scope, async () => {
      const previous = await this.findSeller(scope)
      return this.publicLink(await this.persistTokens(scope, token, previous))
    })
  }
  private async persistTokens(scope: MercadoPagoScope, value: unknown, previous?: MercadoPagoSellerLink) {
    if (!object(value) || !text(value.access_token) || !text(value.refresh_token) || !providerId(value.user_id) || typeof value.live_mode !== 'boolean' ||
      value.live_mode !== (scope.mode === 'production') || !Number.isSafeInteger(value.expires_in) || Number(value.expires_in) <= 0 || Number(value.expires_in) > 2 * 366 * 86400 ||
      typeof value.scope !== 'string' || !value.scope.split(' ').includes('offline_access')) throw new MercadoPagoError('MP_OAUTH_RESPONSE_INVALID')
    const id = providerId(value.user_id)!
    if (previous && previous.providerUserId !== id) throw new MercadoPagoError('MP_OAUTH_ACCOUNT_MISMATCH')
    const link: MercadoPagoSellerLink = { ...scope, providerUserId: id,
      encryptedAccessToken: await this.cipher.seal(value.access_token, this.context(scope, 'access')),
      encryptedRefreshToken: await this.cipher.seal(value.refresh_token, this.context(scope, 'refresh')),
      accessTokenExpiresAt: new Date(this.now() + Number(value.expires_in) * 1000).toISOString(), version: (previous?.version ?? 0) + 1, status: 'connected', updatedAt: new Date(this.now()).toISOString() }
    if (!(await this.repository.saveSellerLink(link, previous?.version ?? 0))) throw new MercadoPagoError('MP_SELLER_LINK_CONFLICT')
    return link
  }
  async refreshSeller(accountId: string) {
    const scope = this.scope(accountId)
    return this.sellerLock(scope, async () => {
      const previous = await this.findSeller(scope)
      if (!previous || previous.status !== 'connected') throw new MercadoPagoError('MP_RECONNECT_REQUIRED')
      return this.publicLink(await this.rotateTokens(scope, previous))
    })
  }
  private async rotateTokens(scope: MercadoPagoScope, previous: MercadoPagoSellerLink) {
    try {
      const refresh = await this.cipher.open(previous.encryptedRefreshToken, this.context(scope, 'refresh'))
      const token = await this.request('/oauth/token', { form: { client_id: this.settings.clientId, client_secret: this.settings.clientSecret,
        grant_type: 'refresh_token', refresh_token: refresh } })
      return await this.persistTokens(scope, token, previous)
    } catch (error) {
      if (error instanceof MercadoPagoError && (error.httpStatus === 400 || error.httpStatus === 401)) {
        await this.repository.saveSellerLink({ ...previous, status: 'reauthorization_required', version: previous.version + 1, updatedAt: new Date(this.now()).toISOString() }, previous.version)
        throw new MercadoPagoError('MP_RECONNECT_REQUIRED')
      }
      throw error
    }
  }
  private async seller(accountId: string) {
    const scope = this.scope(accountId)
    return this.sellerLock(scope, async () => {
      let link = await this.findSeller(scope)
      if (!link || link.status !== 'connected' || link.accountId !== scope.accountId || link.applicationId !== scope.applicationId || link.mode !== scope.mode) throw new MercadoPagoError('MP_RECONNECT_REQUIRED')
      if (Date.parse(link.accessTokenExpiresAt) <= this.now() + 60000) link = await this.rotateTokens(scope, link)
      return { link, accessToken: await this.cipher.open(link.encryptedAccessToken, this.context(scope, 'access')) }
    })
  }
  async createPreference(input: MercadoPagoQuote): Promise<MercadoPagoPreference> {
    if (!this.preferences) throw new MercadoPagoError('MP_PREFERENCE_STORE_REQUIRED')
    const scope = this.scope(input.accountId)
    if (!uuid(input.orderId) || !entityId(input.buyerId) || !operationId(input.idempotencyKey) || input.currency !== 'MXN' || !text(input.title, 160) ||
      input.accountId === input.buyerId || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 100 || input.amountMinor > 100000000 || !Number.isSafeInteger(input.commissionMinor) ||
      input.commissionMinor < 0 || input.commissionMinor >= input.amountMinor) throw new MercadoPagoError('MP_QUOTE_INVALID')
    const { link, accessToken } = await this.seller(input.accountId)
    const back = (status: string) => `${this.settings.publicOrigin}/#/marketplace?tab=purchases&checkout=${status}&order=${encodeURIComponent(input.orderId)}`
    const payload = { external_reference: input.orderId, items: [{ id: input.orderId, title: input.title, quantity: 1, currency_id: input.currency, unit_price: input.amountMinor / 100 }],
      marketplace_fee: input.commissionMinor / 100, back_urls: { success: back('success'), pending: back('pending'), failure: back('failed') }, notification_url: this.settings.notificationUrl, auto_return: 'approved' }
    const key = this.context(scope, `preference:${input.orderId}`)
    const fingerprint = hash(JSON.stringify({ buyerId: input.buyerId, collectorId: link.providerUserId, payload }))
    const claim = await this.preferences.reservePreference({ ...scope, key, fingerprint, buyerId: input.buyerId, orderId: input.orderId, operationId: input.idempotencyKey })
    if (claim.state === 'conflict') throw new MercadoPagoError('MP_IDEMPOTENCY_CONFLICT')
    if (claim.state === 'busy') throw new MercadoPagoError('MP_REQUEST_IN_PROGRESS', true)
    if (claim.state === 'uncertain') throw new MercadoPagoError('MP_PREFERENCE_UNCERTAIN')
    if (claim.state === 'complete') {
      const cached = claim.result
      if (cached.collectorId !== link.providerUserId || cached.orderId !== input.orderId || cached.amountMinor !== input.amountMinor || cached.commissionMinor !== input.commissionMinor || cached.currency !== input.currency) throw new MercadoPagoError('MP_IDEMPOTENCY_CONFLICT')
      return { ...cached, checkoutUrl: checkoutUrl(cached.checkoutUrl, scope.mode, cached.preferenceId) }
    }
    try {
      // The Preferences reference does not promise Stripe-like HTTP idempotency.
      const result = await this.request('/checkout/preferences', { token: accessToken, json: payload })
      if (!object(result) || !text(result.id, 128) || !/^[A-Za-z0-9_-]+$/.test(result.id) || providerId(result.collector_id) !== link.providerUserId) throw new MercadoPagoError('MP_PREFERENCE_RESPONSE_INVALID')
      const preference: MercadoPagoPreference = { preferenceId: result.id, collectorId: link.providerUserId, orderId: input.orderId, amountMinor: input.amountMinor,
        commissionMinor: input.commissionMinor, currency: 'MXN', checkoutUrl: checkoutUrl(scope.mode === 'test' ? result.sandbox_init_point : result.init_point, scope.mode, result.id) }
      await this.preferences.completePreference(key, fingerprint, preference)
      return preference
    } catch (error) {
      const definitiveRejection = error instanceof MercadoPagoError && error.httpStatus !== undefined && error.httpStatus >= 400 && error.httpStatus < 500 && ![408, 409, 429].includes(error.httpStatus)
      await this.preferences.failPreference(key, fingerprint, !definitiveRejection)
      throw error
    }
  }
  async retrievePaymentForSeller(input: { accountId: string; paymentId: string }): Promise<MercadoPagoPayment> {
    if (!providerId(input.paymentId)) throw new MercadoPagoError('MP_PAYMENT_LOOKUP_INVALID')
    const { link, accessToken } = await this.seller(input.accountId)
    const value = await this.request(`/v1/payments/${encodeURIComponent(input.paymentId)}`, { token: accessToken, method: 'GET' })
    if (!object(value) || providerId(value.id) !== input.paymentId || providerId(value.collector_id) !== link.providerUserId ||
      !uuid(value.external_reference) || value.currency_id !== 'MXN' || typeof value.live_mode !== 'boolean' || value.live_mode !== (this.settings.mode === 'production') ||
      !text(value.status, 64) || !text(value.status_detail, 100) || value.application_id !== undefined && String(value.application_id) !== this.settings.clientId) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    const amountMinor = money(value.transaction_amount), refundedMinor = money(value.transaction_amount_refunded)
    if (amountMinor < 100 || refundedMinor > amountMinor) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    // A seller can receive unrelated direct payments with a copied reference.
    // Verify the Checkout Pro chain using provider-owned resource IDs, never a
    // URL supplied by the payment response or notification.
    if (!object(value.order) || value.order.type !== 'mercadopago' || !providerId(value.order.id)) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    const merchant = await this.request(`/merchant_orders/${providerId(value.order.id)}`, { token: accessToken, method: 'GET' })
    const marketplace = `MP-MKT-${this.settings.clientId}`
    if (!object(merchant) || providerId(merchant.id) !== providerId(value.order.id) || !object(merchant.collector) ||
      providerId(merchant.collector.id) !== link.providerUserId || String(merchant.application_id) !== this.settings.clientId ||
      merchant.marketplace !== marketplace || merchant.external_reference !== value.external_reference ||
      !text(merchant.preference_id, 128) || !/^[A-Za-z0-9_-]+$/.test(merchant.preference_id) || !Array.isArray(merchant.payments)) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    const matches = merchant.payments.filter(item => object(item) && providerId(item.id) === input.paymentId)
    if (matches.length !== 1 || !object(matches[0]) || matches[0].currency_id !== 'MXN' || money(matches[0].transaction_amount) !== amountMinor) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    const preference = await this.request(`/checkout/preferences/${encodeURIComponent(merchant.preference_id)}`, { token: accessToken, method: 'GET' })
    if (!object(preference) || preference.id !== merchant.preference_id || providerId(preference.collector_id) !== link.providerUserId ||
      String(preference.client_id) !== this.settings.clientId || preference.marketplace !== marketplace ||
      preference.external_reference !== value.external_reference || !Array.isArray(preference.items) || preference.items.length !== 1 ||
      !object(preference.items[0])) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    const item = preference.items[0], commissionMinor = money(preference.marketplace_fee)
    if (item.id !== value.external_reference || !text(item.title, 160) || item.quantity !== 1 || item.currency_id !== 'MXN' ||
      money(item.unit_price) !== amountMinor || commissionMinor >= amountMinor) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    const normalizedStatus = value.status === 'charged_back' || value.status === 'in_mediation' ? 'disputed' : value.status === 'refunded' || refundedMinor === amountMinor ? 'refunded' :
      refundedMinor > 0 || value.status_detail === 'partially_refunded' ? 'partially_refunded' : value.status === 'approved' && value.status_detail === 'accredited' ? 'paid' :
        value.status === 'rejected' || value.status === 'cancelled' ? 'failed' : 'pending'
    return { paymentId: input.paymentId, collectorId: link.providerUserId, orderId: value.external_reference, amountMinor, refundedMinor, currency: 'MXN',
      preferenceId: merchant.preference_id, commissionMinor, itemId: item.id, title: item.title,
      status: value.status, statusDetail: value.status_detail, mode: this.settings.mode, normalizedStatus, canDownload: normalizedStatus === 'paid' }
  }
  async getPayment(input: MercadoPagoPaymentLookup): Promise<MercadoPagoPayment> {
    if (!uuid(input.orderId) || input.currency !== 'MXN' || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 100 ||
      !text(input.preferenceId, 128) || !/^[A-Za-z0-9_-]+$/.test(input.preferenceId) || !Number.isSafeInteger(input.commissionMinor) ||
      input.commissionMinor < 0 || input.commissionMinor >= input.amountMinor || input.itemId !== input.orderId || !text(input.title, 160)) throw new MercadoPagoError('MP_PAYMENT_LOOKUP_INVALID')
    const payment = await this.retrievePaymentForSeller(input)
    if (payment.orderId !== input.orderId || payment.amountMinor !== input.amountMinor || payment.currency !== input.currency ||
      payment.preferenceId !== input.preferenceId || payment.commissionMinor !== input.commissionMinor || payment.itemId !== input.itemId || payment.title !== input.title) throw new MercadoPagoError('MP_PAYMENT_MISMATCH')
    return payment
  }
  async requestRefund(input: MercadoPagoPaymentLookup & { amountToRefundMinor?: number; idempotencyKey: string }) {
    if (!operationId(input.idempotencyKey) || input.amountToRefundMinor !== undefined && (!Number.isSafeInteger(input.amountToRefundMinor) || input.amountToRefundMinor <= 0 || input.amountToRefundMinor > input.amountMinor)) throw new MercadoPagoError('MP_REFUND_INVALID')
    await this.getPayment(input) // Verify collector, reference, amount, currency and environment before any refund request.
    const { accessToken } = await this.seller(input.accountId)
    const body = input.amountToRefundMinor === undefined ? {} : { amount: input.amountToRefundMinor / 100 }
    const value = await this.request(`/v1/payments/${encodeURIComponent(input.paymentId)}/refunds`, { token: accessToken, json: body,
      idempotencyKey: hash(this.context(this.scope(input.accountId), `refund:${input.paymentId}:${input.idempotencyKey}`)) })
    if (!object(value) || !providerId(value.id) || value.payment_id !== undefined && providerId(value.payment_id) !== input.paymentId) throw new MercadoPagoError('MP_REFUND_RESPONSE_INVALID')
    // A provider response is a request acknowledgement. Reconcile getPayment/webhooks
    // before changing entitlements. Split 1:1 can fail for insufficient seller funds.
    return { refundId: providerId(value.id)!, paymentId: input.paymentId, status: 'requested' as const, providerStatus: typeof value.status === 'string' ? value.status : undefined }
  }
  verifyWebhook(input: { xSignature: string; xRequestId: string; dataId: string }) {
    if (!text(input.xSignature, 2048) || typeof input.xRequestId !== 'string' || typeof input.dataId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(input.xRequestId) || !/^[A-Za-z0-9_-]{1,128}$/.test(input.dataId)) throw new MercadoPagoError('MP_WEBHOOK_SIGNATURE_INVALID')
    const pairs = input.xSignature.split(',').map(part => part.trim().split('='))
    if (pairs.some(pair => pair.length !== 2) || pairs.filter(([key]) => key === 'ts').length !== 1 || pairs.filter(([key]) => key === 'v1').length !== 1 || pairs.some(([key]) => key !== 'ts' && key !== 'v1')) throw new MercadoPagoError('MP_WEBHOOK_SIGNATURE_INVALID')
    const timestamp = pairs.find(([key]) => key === 'ts')![1], signature = pairs.find(([key]) => key === 'v1')![1]
    if (!/^[0-9]{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) throw new MercadoPagoError('MP_WEBHOOK_SIGNATURE_INVALID')
    const resourceId = input.dataId.toLowerCase()
    const expected = createHmac('sha256', this.settings.webhookSecret).update(`id:${resourceId};request-id:${input.xRequestId};ts:${timestamp};`).digest()
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new MercadoPagoError('MP_WEBHOOK_SIGNATURE_INVALID')
    if (this.settings.webhookToleranceMs !== undefined) {
      const issuedAt = Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1)
      if (Math.abs(this.now() - issuedAt) > this.settings.webhookToleranceMs) throw new MercadoPagoError('MP_WEBHOOK_TIMESTAMP_INVALID')
    }
    // Only this manifest is authenticated, not body.status/action/user_id. Routes
    // must durably deduplicate and fetch the resource; never grant from the body.
    return { resourceId, requestId: input.xRequestId, timestamp }
  }
  private async request(path: string, input: { token?: string; method?: 'GET'; json?: object; form?: Record<string, string>; idempotencyKey?: string }): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, this.settings.requestTimeoutMs ?? 15000)
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (input.token) headers.Authorization = `Bearer ${input.token}`
      if (input.idempotencyKey) headers['X-Idempotency-Key'] = input.idempotencyKey
      if (input.form || input.json) headers['Content-Type'] = input.form ? 'application/x-www-form-urlencoded' : 'application/json'
      const response = await this.fetcher(`${apiOrigin}${path}`, { method: input.method ?? 'POST', headers, redirect: 'error', signal: controller.signal,
        body: input.form ? new URLSearchParams(input.form).toString() : input.json ? JSON.stringify(input.json) : undefined })
      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []; let size = 0
      if (reader) {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break
          size += chunk.value.byteLength
          if (size > 1024 * 1024) { await reader.cancel(); throw new MercadoPagoError('MP_RESPONSE_TOO_LARGE', true) }
          chunks.push(chunk.value)
        }
      }
      if (!response.ok) throw new MercadoPagoError('MP_HTTP_ERROR', response.status === 429 || response.status >= 500, response.status)
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { throw new MercadoPagoError('MP_RESPONSE_INVALID', true) }
    } catch (error) {
      if (error instanceof MercadoPagoError) throw error
      throw new MercadoPagoError(timedOut ? 'MP_REQUEST_TIMEOUT' : 'MP_NETWORK_ERROR', true)
    } finally { clearTimeout(timeout) }
  }
}
