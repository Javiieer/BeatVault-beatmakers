import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { BeatOrder, ServerRepository } from './store'
import type { PurchaseEntitlement } from './purchase-entitlements'
import { calculateBeatFees, StripePaymentsService, type StripePaymentsGateway } from './stripe-payments'

const feePolicy = { commissionBps: 500, processingRateBps: 320, processingFixedMinor: 30 }
const baseOrder: BeatOrder = { id: '11111111-1111-4111-8111-111111111111', buyerId: 'buyer-1', sellerId: 'seller-1', contentId: 'beat-1', offerId: 'wav', title: 'Night drive', amountMinor: 2000, commissionMinor: 100, processingEstimateMinor: 94, applicationFeeMinor: 194, sellerNetMinor: 1806, currency: 'usd', status: 'pending', stripeDestinationAccountId: 'acct_test_1', stripeCheckoutBaseUrl: 'https://beatvault.test', createdAt: new Date(0).toISOString() }
const fulfillment: PurchaseEntitlement = { version: 1, assetId: '22222222-2222-4222-8222-222222222222', sourceHash: 'a'.repeat(64), sourceSizeBytes: 1000, sourceMimeType: 'audio/wav', sourceName: 'beat.wav', deliverables: ['wav', 'mp3'], offerLabel: 'WAV license', usageSummary: 'Commercial release allowed.', termsVersion: 'non-exclusive-offer-draft-v1' }
const makeRepository = () => {
  let order: BeatOrder | undefined
  const repo = {
    createBeatOrder: vi.fn(async (value: BeatOrder) => order = value),
    findBeatOrder: vi.fn(async () => order),
    findBeatOrderByCheckoutSessionId: vi.fn(async () => order),
    findBeatOrderByPaymentIntentId: vi.fn(async (paymentIntentId: string) => order?.stripePaymentIntentId === paymentIntentId ? order : undefined),
    listBeatOrders: vi.fn(async () => order ? [order] : []),
    updateBeatOrder: vi.fn(async (_id: string, patch: Partial<BeatOrder>) => order ? order = { ...order, ...patch } : undefined),
    transitionBeatOrder: vi.fn(async (_id: string, from: BeatOrder['status'][], patch: Partial<BeatOrder> & Pick<BeatOrder, 'status'>) => {
      if (!order || !from.includes(order.status)) return undefined
      return order = { ...order, ...patch }
    }),
    hasProcessedStripeEvent: vi.fn(async () => false),
    recordProcessedStripeEvent: vi.fn(async () => true),
  }
  return { repo, get order() { return order } }
}

describe('Stripe beat payments', () => {
  it('keeps the provisional commission and processing estimate in integer USD cents', () => {
    expect(calculateBeatFees(2000, feePolicy)).toEqual({ commissionMinor: 100, processingEstimateMinor: 94, applicationFeeMinor: 194, sellerNetMinor: 1806 })
    expect(() => calculateBeatFees(100, { commissionBps: 500, processingRateBps: 0, processingFixedMinor: 95 })).toThrow('BEAT_PRICE_NOT_SUPPORTED')
  })

  it('creates a one-time destination Checkout from server-priced offer data with order idempotency', async () => {
    const state = makeRepository()
    const { repo } = state
    const create = vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }))
    const retrieve = vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', status: 'open' }))
    const stripe = { checkout: { sessions: { create, retrieve } }, webhooks: { constructEvent: vi.fn() } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, repo as unknown as ServerRepository, 'https://beatvault.test', feePolicy)

    const result = await service.createBeatCheckout({ orderId: baseOrder.id, buyerId: 'buyer-1', buyerEmail: 'buyer@example.test', sellerId: 'seller-1', stripeAccountId: 'acct_test_1', contentId: 'beat-1', title: 'Night drive', offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: 'Commercial release allowed.', deliverables: ['wav', 'mp3'] }, fulfillment })
    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    expect(state.order?.stripeCheckoutSessionId).toBe('cs_test_1')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'payment', client_reference_id: expect.any(String), line_items: [expect.objectContaining({ price_data: expect.objectContaining({ currency: 'usd', unit_amount: 2000 }) })], payment_intent_data: { application_fee_amount: 194, transfer_data: { destination: 'acct_test_1' }, metadata: expect.objectContaining({ beatvaultOrderId: expect.any(String) }) }, success_url: expect.stringContaining('#/marketplace?tab=purchases&checkout=success'), cancel_url: expect.stringContaining('#/marketplace?tab=purchases&checkout=cancelled'), integration_identifier: expect.stringMatching(/^beatvault_[a-z]{8}$/) }), { idempotencyKey: `beatvault-checkout-${result.order.id}` })
    expect(state.order?.sellerNetMinor).toBe(1806)
    await expect(service.createBeatCheckout({ orderId: baseOrder.id, buyerId: 'buyer-1', buyerEmail: 'buyer@example.test', sellerId: 'seller-1', stripeAccountId: 'acct_test_1', contentId: 'beat-1', title: 'Night drive', offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: 'Commercial release allowed.', deliverables: ['wav', 'mp3'] }, fulfillment })).resolves.toMatchObject({ order: { id: baseOrder.id }, url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    expect(create).toHaveBeenCalledOnce()
    expect(retrieve).toHaveBeenCalledWith('cs_test_1')
  })

  it('fulfills only paid webhook sessions and makes repeated deliveries idempotent', async () => {
    const state = makeRepository()
    const { repo } = state
    await repo.createBeatOrder({ ...baseOrder, stripeCheckoutSessionId: 'cs_test_1' })
    const event = { id: 'evt_paid', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_1', client_reference_id: baseOrder.id, metadata: { beatvaultOrderId: baseOrder.id }, currency: 'usd', amount_total: 2000, payment_status: 'paid', payment_intent: 'pi_test_1' } } } as unknown as Stripe.Event
    const constructEvent = vi.fn(() => event)
    const stripe = { checkout: { sessions: { create: vi.fn() } }, webhooks: { constructEvent } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')).resolves.toBe('processed')
    expect(state.order).toMatchObject({ status: 'paid', stripeCheckoutSessionId: 'cs_test_1', stripePaymentIntentId: 'pi_test_1' })
    repo.hasProcessedStripeEvent.mockResolvedValue(true)
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')).resolves.toBe('duplicate')
    expect(repo.transitionBeatOrder).toHaveBeenCalledOnce()
  })

  it('does not fulfill a completed session until Stripe reports payment_status paid', async () => {
    const state = makeRepository()
    const { repo } = state
    await repo.createBeatOrder({ ...baseOrder, stripeCheckoutSessionId: 'cs_test_1' })
    const event = { id: 'evt_unpaid', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_1', client_reference_id: baseOrder.id, metadata: { beatvaultOrderId: baseOrder.id }, currency: 'usd', amount_total: 2000, payment_status: 'unpaid' } } } as unknown as Stripe.Event
    const stripe = { checkout: { sessions: { create: vi.fn() } }, webhooks: { constructEvent: vi.fn(() => event) } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')
    expect(state.order?.status).toBe('pending')
  })

  it.each([
    { id: 'cs_test_other', currency: 'usd', amount_total: 2000 },
    { id: 'cs_test_1', currency: 'eur', amount_total: 2000 },
    { id: 'cs_test_1', currency: 'usd', amount_total: 1 },
  ])('rejects signed checkout events for a different session, currency or amount: %j', async mismatch => {
    const state = makeRepository()
    await state.repo.createBeatOrder({ ...baseOrder, stripeCheckoutSessionId: 'cs_test_1' })
    const event = { id: 'evt_wrong_order', type: 'checkout.session.completed', livemode: false, data: { object: { ...mismatch, metadata: { beatvaultOrderId: baseOrder.id }, payment_status: 'paid' } } } as unknown as Stripe.Event
    const stripe = { webhooks: { constructEvent: vi.fn(() => event) } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')).rejects.toThrow('STRIPE_ORDER_MISMATCH')
    expect(state.order?.status).toBe('pending')
    expect(state.repo.recordProcessedStripeEvent).not.toHaveBeenCalled()
  })

  it('rejects changed deliverables when retrying an existing checkout and keeps the original snapshot', async () => {
    const state = makeRepository()
    await state.repo.createBeatOrder({ ...baseOrder, fulfillment, stripeCheckoutSessionId: 'cs_test_1' })
    const stripe = { checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)
    await expect(service.createBeatCheckout({ orderId: baseOrder.id, buyerId: baseOrder.buyerId, buyerEmail: 'buyer@example.test', sellerId: baseOrder.sellerId, stripeAccountId: 'acct_test_1', contentId: baseOrder.contentId, title: baseOrder.title,
      offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: fulfillment.usageSummary, deliverables: ['mp3'] }, fulfillment: { ...fulfillment, deliverables: ['mp3'] } })).rejects.toThrow('ORDER_IDEMPOTENCY_CONFLICT')
    expect(state.order?.fulfillment?.deliverables).toEqual(['wav', 'mp3'])
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('does not expose a competing buyer checkout if the order key was inserted concurrently', async () => {
    const state = makeRepository()
    state.repo.createBeatOrder.mockResolvedValue({ ...baseOrder, buyerId: 'other-buyer', fulfillment })
    const create = vi.fn()
    const stripe = { checkout: { sessions: { create } } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)
    await expect(service.createBeatCheckout({ orderId: baseOrder.id, buyerId: baseOrder.buyerId, buyerEmail: 'buyer@example.test', sellerId: baseOrder.sellerId, stripeAccountId: 'acct_test_1', contentId: baseOrder.contentId, title: baseOrder.title,
      offer: { id: 'wav', label: fulfillment.offerLabel, amountMinor: 2000, usageSummary: fulfillment.usageSummary, deliverables: fulfillment.deliverables }, fulfillment })).rejects.toThrow('ORDER_IDEMPOTENCY_CONFLICT')
    expect(create).not.toHaveBeenCalled()
  })

  it('does not reopen a refund that races with retrying a failed checkout', async () => {
    const state = makeRepository()
    await state.repo.createBeatOrder({ ...baseOrder, status: 'failed', fulfillment })
    state.repo.transitionBeatOrder.mockImplementationOnce(async () => {
      await state.repo.updateBeatOrder(baseOrder.id, { status: 'refunded' })
      return undefined
    })
    const create = vi.fn()
    const stripe = { checkout: { sessions: { create } }, webhooks: { constructEvent: vi.fn() } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await expect(service.createBeatCheckout({ orderId: baseOrder.id, buyerId: baseOrder.buyerId, buyerEmail: 'buyer@example.test', sellerId: baseOrder.sellerId, stripeAccountId: 'acct_test_1', contentId: baseOrder.contentId, title: baseOrder.title,
      offer: { id: 'wav', label: fulfillment.offerLabel, amountMinor: 2000, usageSummary: fulfillment.usageSummary, deliverables: fulfillment.deliverables }, fulfillment })).rejects.toThrow('ORDER_ALREADY_SETTLED')
    expect(state.order?.status).toBe('refunded')
    expect(create).not.toHaveBeenCalled()
  })

  it('reuses the same checkout parameters after Stripe succeeds but saving the session response fails', async () => {
    const state = makeRepository()
    const persistUpdate = state.repo.updateBeatOrder.getMockImplementation()!
    let failFirstSessionSave = true
    state.repo.updateBeatOrder.mockImplementation(async (id, patch) => {
      if (patch.stripeCheckoutSessionId && failFirstSessionSave) {
        failFirstSessionSave = false
        throw new Error('simulated lost persistence response')
      }
      return persistUpdate(id, patch)
    })
    const calls: Array<{ params: Stripe.Checkout.SessionCreateParams; options: Stripe.RequestOptions }> = []
    const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
      calls.push({ params, options })
      return { id: 'cs_test_retry', url: 'https://checkout.stripe.com/c/pay/cs_test_retry' }
    })
    const stripe = { checkout: { sessions: { create, retrieve: vi.fn() } }, webhooks: { constructEvent: vi.fn() } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'https://beatvault.test', feePolicy)
    const input = { orderId: baseOrder.id, buyerId: 'buyer-1', buyerEmail: 'buyer@example.test', sellerId: 'seller-1', stripeAccountId: 'acct_test_1', contentId: 'beat-1', title: 'Night drive', offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: 'Commercial release allowed.', deliverables: ['wav', 'mp3'] }, fulfillment }

    await expect(service.createBeatCheckout(input)).rejects.toThrow('simulated lost persistence response')
    const retryService = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'https://changed-beatvault.test', { commissionBps: 700, processingRateBps: 400, processingFixedMinor: 40 })
    await expect(retryService.createBeatCheckout({ ...input, title: 'Updated listing title', buyerEmail: 'updated@example.test', stripeAccountId: 'acct_test_changed' })).resolves.toMatchObject({ url: 'https://checkout.stripe.com/c/pay/cs_test_retry' })
    expect(create).toHaveBeenCalledTimes(2)
    expect(calls[0]?.params).toEqual(calls[1]?.params)
    expect(calls[0]?.params.integration_identifier).toMatch(/^beatvault_[a-z]{8}$/)
    expect(calls[0]?.options).toEqual(calls[1]?.options)
  })

  it('requests an idempotent full refund, reverses seller transfer and returns BeatVault fee', async () => {
    const state = makeRepository()
    const paid = { ...baseOrder, status: 'paid' as const, stripePaymentIntentId: 'pi_test_1' }
    await state.repo.createBeatOrder(paid)
    const create = vi.fn(async () => ({ id: 're_test_1' }))
    const stripe = { checkout: { sessions: { create: vi.fn() } }, refunds: { create }, webhooks: { constructEvent: vi.fn() } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await expect(service.refundBeatOrder(paid.id, 'admin-1')).resolves.toMatchObject({ status: 'refund_pending', stripeRefundId: 're_test_1', refundRequestedBy: 'admin-1' })
    expect(create).toHaveBeenCalledWith({ payment_intent: 'pi_test_1', reason: 'requested_by_customer', reverse_transfer: true, refund_application_fee: true, metadata: { beatvaultOrderId: paid.id, requestedBy: 'admin-1' } }, { idempotencyKey: `beatvault-refund-${paid.id}` })
    await expect(service.refundBeatOrder(paid.id, 'admin-1')).rejects.toThrow('BEAT_ORDER_NOT_REFUNDABLE')
    expect(create).toHaveBeenCalledOnce()
  })

  it('only marks a refund final after a signed Stripe charge-refunded webhook', async () => {
    const state = makeRepository()
    await state.repo.createBeatOrder({ ...baseOrder, status: 'paid', stripePaymentIntentId: 'pi_test_1' })
    const event = { id: 'evt_refund', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_test_1', payment_intent: 'pi_test_1', amount: 2000, amount_refunded: 2000, refunds: { data: [{ id: 're_test_1' }] } } } } as unknown as Stripe.Event
    const stripe = { checkout: { sessions: { create: vi.fn() } }, refunds: { create: vi.fn() }, webhooks: { constructEvent: vi.fn(() => event) } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')
    expect(state.order).toMatchObject({ status: 'refunded', stripeRefundId: 're_test_1' })
  })

  it.each(['pending', 'failed'] as const)('retrieves and applies a refund that arrives before the Checkout payment event from %s', async initialStatus => {
    const state = makeRepository()
    await state.repo.createBeatOrder({ ...baseOrder, status: initialStatus, stripeCheckoutSessionId: 'cs_test_1' })
    const refund = { id: 'evt_refund_first', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_test_1', payment_intent: 'pi_test_1', amount: 2000, amount_refunded: 2000, refunds: { data: [{ id: 're_test_1' }] } } } } as unknown as Stripe.Event
    const paid = { id: 'evt_paid_second', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_1', client_reference_id: baseOrder.id, metadata: { beatvaultOrderId: baseOrder.id }, currency: 'usd', amount_total: 2000, payment_status: 'paid', payment_intent: 'pi_test_1' } } } as unknown as Stripe.Event
    const constructEvent = vi.fn().mockReturnValueOnce(refund).mockReturnValueOnce(paid)
    const stripe = { checkout: { sessions: { create: vi.fn() } }, paymentIntents: { retrieve: vi.fn(async () => ({ id: 'pi_test_1', metadata: { beatvaultOrderId: baseOrder.id } })) }, webhooks: { constructEvent } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, state.repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_refund', 'whsec_test')).resolves.toBe('processed')
    expect(state.order).toMatchObject({ status: 'refunded', stripePaymentIntentId: 'pi_test_1' })
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_paid', 'whsec_test')).resolves.toBe('processed')
    expect(state.order?.status).toBe('refunded')
  })

  it('does not overwrite a refund when a payment transition races with a terminal status', async () => {
    const state = makeRepository()
    await state.repo.createBeatOrder({ ...baseOrder, status: 'refunded' })
    await expect(state.repo.transitionBeatOrder(baseOrder.id, ['pending', 'failed'], { status: 'paid' })).resolves.toBeUndefined()
    expect(state.order?.status).toBe('refunded')
  })
})
