import { randomBytes, randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import type { BeatOrder, ServerRepository } from './store'

export type StripePaymentsGateway = Pick<Stripe, 'checkout' | 'webhooks' | 'refunds'>
export type BeatCheckoutOffer = { id: string; label: string; amountMinor: number; usageSummary: string; deliverables: string[] }
export type BeatCheckoutInput = { orderId: string; buyerId: string; buyerEmail: string; sellerId: string; stripeAccountId: string; contentId: string; title: string; offer: BeatCheckoutOffer }
export type FeePolicy = { commissionBps: number; processingRateBps: number; processingFixedMinor: number }

export function calculateBeatFees(amountMinor: number, policy: FeePolicy) {
  const commissionMinor = Math.round(amountMinor * policy.commissionBps / 10_000)
  const processingEstimateMinor = Math.round(amountMinor * policy.processingRateBps / 10_000) + policy.processingFixedMinor
  const applicationFeeMinor = commissionMinor + processingEstimateMinor
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || applicationFeeMinor >= amountMinor) throw new Error('BEAT_PRICE_NOT_SUPPORTED')
  return { commissionMinor, processingEstimateMinor, applicationFeeMinor, sellerNetMinor: amountMinor - applicationFeeMinor }
}

export class StripePaymentsService {
  constructor(private readonly stripe: StripePaymentsGateway, private readonly repository: ServerRepository, private readonly publicUrl: string, private readonly fees: FeePolicy) {}

  async createBeatCheckout(input: BeatCheckoutInput): Promise<{ order: BeatOrder; url: string }> {
    const orderId = input.orderId || randomUUID()
    const fee = calculateBeatFees(input.offer.amountMinor, this.fees)
    const order: BeatOrder = {
      id: orderId, buyerId: input.buyerId, sellerId: input.sellerId, contentId: input.contentId,
      offerId: input.offer.id, title: input.title, amountMinor: input.offer.amountMinor,
      ...fee, currency: 'usd', status: 'pending', createdAt: new Date().toISOString(),
    }
    const existing = await this.repository.findBeatOrder(orderId)
    if (existing && (existing.buyerId !== input.buyerId || existing.sellerId !== input.sellerId || existing.contentId !== input.contentId || existing.offerId !== input.offer.id || existing.amountMinor !== input.offer.amountMinor)) throw new Error('ORDER_IDEMPOTENCY_CONFLICT')
    if (existing && existing.status !== 'pending' && !(existing.status === 'failed' && !existing.stripeCheckoutSessionId)) throw new Error('ORDER_ALREADY_SETTLED')
    if (existing?.stripeCheckoutSessionId) {
      const previousSession = await this.stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId)
      if (previousSession.status === 'open' && previousSession.url) return { order: existing, url: previousSession.url }
      throw new Error('ORDER_CHECKOUT_CLOSED')
    }
    if (!existing) await this.repository.createBeatOrder(order)
    else if (existing.status === 'failed') await this.repository.updateBeatOrder(orderId, { status: 'pending' })

    const successUrl = new URL(this.publicUrl)
    successUrl.hash = `/marketplace?checkout=success&order=${encodeURIComponent(orderId)}`
    const cancelUrl = new URL(this.publicUrl)
    cancelUrl.hash = '/marketplace?checkout=cancelled'
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: orderId,
        customer_email: input.buyerEmail,
        line_items: [{ quantity: 1, price_data: {
          currency: 'usd', unit_amount: input.offer.amountMinor,
          product_data: { name: `${input.title} - ${input.offer.label}`, description: `${input.offer.usageSummary} Deliverables: ${input.offer.deliverables.join(', ')}.` },
        } }],
        payment_intent_data: {
          application_fee_amount: fee.applicationFeeMinor,
          transfer_data: { destination: input.stripeAccountId },
          metadata: { beatvaultOrderId: orderId, beatvaultContentId: input.contentId, beatvaultOfferId: input.offer.id },
        },
        metadata: { beatvaultOrderId: orderId, beatvaultBuyerId: input.buyerId },
        success_url: successUrl.toString(), cancel_url: cancelUrl.toString(),
        integration_identifier: `beatvault_${randomBytes(4).toString('hex')}`,
      }, { idempotencyKey: `beatvault-checkout-${orderId}` })
      if (!session.url) throw new Error('STRIPE_CHECKOUT_URL_MISSING')
      const saved = await this.repository.updateBeatOrder(orderId, { stripeCheckoutSessionId: session.id })
      if (!saved) throw new Error('BEAT_ORDER_NOT_FOUND')
      return { order: saved, url: session.url }
    } catch (error) {
      await this.repository.updateBeatOrder(orderId, { status: 'failed' })
      throw error
    }
  }

  async refundBeatOrder(orderId: string, adminId: string, reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' = 'requested_by_customer'): Promise<BeatOrder> {
    const order = await this.repository.findBeatOrder(orderId)
    if (!order) throw new Error('BEAT_ORDER_NOT_FOUND')
    if (order.status !== 'paid' || !order.stripePaymentIntentId || order.stripeRefundId) throw new Error('BEAT_ORDER_NOT_REFUNDABLE')
    const refund = await this.stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      reason,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { beatvaultOrderId: order.id, requestedBy: adminId },
    }, { idempotencyKey: `beatvault-refund-${order.id}` })
    const updated = await this.repository.updateBeatOrder(order.id, {
      status: 'refund_pending', stripeRefundId: refund.id,
      refundRequestedAt: new Date().toISOString(), refundRequestedBy: adminId,
    })
    if (!updated) throw new Error('BEAT_ORDER_NOT_FOUND')
    return updated
  }

  async handleWebhook(rawBody: Buffer, signature: string, webhookSecret: string): Promise<'processed' | 'duplicate' | 'ignored'> {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    if (event.livemode) return 'ignored'
    if (await this.repository.hasProcessedStripeEvent(event.id)) return 'duplicate'

    if (event.type.startsWith('checkout.session.')) {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.beatvaultOrderId || session.client_reference_id
      const order = orderId ? await this.repository.findBeatOrder(orderId) : await this.repository.findBeatOrderByCheckoutSessionId(session.id)
      if (order) {
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
        const terminalStatus = order.status === 'refund_pending' || order.status === 'refunded' || order.status === 'partially_refunded' || order.status === 'disputed'
        if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid' && !terminalStatus) {
          await this.repository.updateBeatOrder(order.id, { status: 'paid', stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId, paidAt: order.paidAt || new Date().toISOString() })
        } else if ((event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') && !terminalStatus && order.status !== 'paid') {
          await this.repository.updateBeatOrder(order.id, { status: 'failed', stripeCheckoutSessionId: session.id })
        } else if (event.type === 'checkout.session.completed') {
          await this.repository.updateBeatOrder(order.id, { stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId })
        }
      }
    } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute
      const paymentIntent = object.payment_intent
      const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id
      if (paymentIntentId) {
        const order = await this.repository.findBeatOrderByPaymentIntentId(paymentIntentId)
        if (order && event.type === 'charge.refunded') {
          const charge = object as Stripe.Charge
          const refund = charge.refunds?.data.at(-1)
          await this.repository.updateBeatOrder(order.id, {
            status: charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded',
            ...(refund?.id ? { stripeRefundId: refund.id } : {}),
          })
        } else if (order) {
          const dispute = object as Stripe.Dispute
          await this.repository.updateBeatOrder(order.id, { status: 'disputed', disputeId: dispute.id, disputeReason: dispute.reason || 'unknown' })
        }
      }
    }

    await this.repository.recordProcessedStripeEvent(event.id, event.type)
    return 'processed'
  }
}
