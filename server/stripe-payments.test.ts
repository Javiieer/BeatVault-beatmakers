import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { BeatOrder, ServerRepository } from './store'
import type { BeatPurchaseSnapshot } from './beat-delivery'
import { calculateBeatFees, StripePaymentsService, type StripePaymentsGateway } from './stripe-payments'

const feePolicy = { commissionBps: 500, processingRateBps: 320, processingFixedMinor: 30 }
const purchaseSnapshot: BeatPurchaseSnapshot = { offerLabel: 'WAV license', usageSummary: 'Commercial release allowed.', termsVersion: 'non-exclusive-offer-draft-v1', deliverables: ['wav'], assetId: 'asset-1', assetContentHash: 'a'.repeat(64), fileName: 'Night drive.wav', mimeType: 'audio/wav', sizeBytes: 1024 }
const baseOrder: BeatOrder = { id: '11111111-1111-4111-8111-111111111111', buyerId: 'buyer-1', sellerId: 'seller-1', contentId: 'beat-1', offerId: 'wav', title: 'Night drive', amountMinor: 2000, commissionMinor: 100, processingEstimateMinor: 94, applicationFeeMinor: 194, sellerNetMinor: 1806, currency: 'usd', status: 'pending', createdAt: new Date(0).toISOString() }
const makeRepository = () => {
  let order: BeatOrder | undefined
  const repo = {
    createBeatOrder: vi.fn(async (value: BeatOrder) => order = value),
    findBeatOrder: vi.fn(async () => order),
    findBeatOrderByCheckoutSessionId: vi.fn(async () => order),
    findBeatOrderByPaymentIntentId: vi.fn(async (paymentIntentId: string) => order?.stripePaymentIntentId === paymentIntentId ? order : undefined),
    listBeatOrders: vi.fn(async () => order ? [order] : []),
    updateBeatOrder: vi.fn(async (_id: string, patch: Partial<BeatOrder>) => order ? order = { ...order, ...patch } : undefined),
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
    const create = vi.fn(async (...args: unknown[]) => { void args; return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } })
    const retrieve = vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', status: 'open' }))
    const stripe = { checkout: { sessions: { create, retrieve } }, webhooks: { constructEvent: vi.fn() } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, repo as unknown as ServerRepository, 'https://beatvault.test', feePolicy)

    const result = await service.createBeatCheckout({ orderId: baseOrder.id, buyerId: 'buyer-1', buyerEmail: 'buyer@example.test', sellerId: 'seller-1', stripeAccountId: 'acct_test_1', contentId: 'beat-1', title: 'Night drive', offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: 'Commercial release allowed.', deliverables: ['wav'] }, purchaseSnapshot })
    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    expect(state.order?.stripeCheckoutSessionId).toBe('cs_test_1')
    expect(state.order?.purchaseSnapshot).toEqual(purchaseSnapshot)
    expect(create.mock.calls[0]?.[0]).toMatchObject({ line_items: [{ price_data: { product_data: { name: 'Night drive - WAV license', description: 'Commercial release allowed. Deliverables: wav.' } } }] })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'payment', client_reference_id: expect.any(String), line_items: [expect.objectContaining({ price_data: expect.objectContaining({ currency: 'usd', unit_amount: 2000 }) })], payment_intent_data: { application_fee_amount: 194, transfer_data: { destination: 'acct_test_1' }, metadata: expect.objectContaining({ beatvaultOrderId: expect.any(String) }) }, success_url: expect.stringContaining('#/marketplace?checkout=success'), cancel_url: expect.stringContaining('#/marketplace?checkout=cancelled'), integration_identifier: expect.stringMatching(/^beatvault_[a-f0-9]{8}$/) }), { idempotencyKey: `beatvault-checkout-${result.order.id}` })
    expect(state.order?.sellerNetMinor).toBe(1806)
    await expect(service.createBeatCheckout({ orderId: baseOrder.id, buyerId: 'buyer-1', buyerEmail: 'buyer@example.test', sellerId: 'seller-1', stripeAccountId: 'acct_test_1', contentId: 'beat-1', title: 'Night drive', offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: 'Commercial release allowed.', deliverables: ['wav'] }, purchaseSnapshot })).resolves.toMatchObject({ order: { id: baseOrder.id }, url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    expect(create).toHaveBeenCalledOnce()
    expect(retrieve).toHaveBeenCalledWith('cs_test_1')
    await expect(service.createBeatCheckout({ orderId: baseOrder.id, buyerId: 'buyer-1', buyerEmail: 'buyer@example.test', sellerId: 'seller-1', stripeAccountId: 'acct_test_1', contentId: 'beat-1', title: 'Night drive', offer: { id: 'wav', label: 'WAV license', amountMinor: 2000, usageSummary: 'Commercial release allowed.', deliverables: ['wav'] }, purchaseSnapshot: { ...purchaseSnapshot, usageSummary: 'Changed license terms after checkout creation.' } })).rejects.toThrow('ORDER_IDEMPOTENCY_CONFLICT')
  })

  it('fulfills only paid webhook sessions and makes repeated deliveries idempotent', async () => {
    const state = makeRepository()
    const { repo } = state
    await repo.createBeatOrder(baseOrder)
    const event = { id: 'evt_paid', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_1', client_reference_id: baseOrder.id, metadata: { beatvaultOrderId: baseOrder.id }, payment_status: 'paid', payment_intent: 'pi_test_1' } } } as unknown as Stripe.Event
    const constructEvent = vi.fn(() => event)
    const stripe = { checkout: { sessions: { create: vi.fn() } }, webhooks: { constructEvent } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')).resolves.toBe('processed')
    expect(state.order).toMatchObject({ status: 'paid', stripeCheckoutSessionId: 'cs_test_1', stripePaymentIntentId: 'pi_test_1' })
    repo.hasProcessedStripeEvent.mockResolvedValue(true)
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')).resolves.toBe('duplicate')
    expect(repo.updateBeatOrder).toHaveBeenCalledOnce()
  })

  it('does not fulfill a completed session until Stripe reports payment_status paid', async () => {
    const state = makeRepository()
    const { repo } = state
    await repo.createBeatOrder(baseOrder)
    const event = { id: 'evt_unpaid', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_1', client_reference_id: baseOrder.id, metadata: { beatvaultOrderId: baseOrder.id }, payment_status: 'unpaid' } } } as unknown as Stripe.Event
    const stripe = { checkout: { sessions: { create: vi.fn() } }, webhooks: { constructEvent: vi.fn(() => event) } } as unknown as StripePaymentsGateway
    const service = new StripePaymentsService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188', feePolicy)

    await service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')
    expect(state.order?.status).toBe('pending')
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
})
