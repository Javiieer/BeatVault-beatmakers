import { createHash, randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import type { BeatOrder, ServerRepository } from './store'
import { isPurchaseEntitlement, type PurchaseEntitlement } from './purchase-entitlements'

export type StripePaymentsGateway = Pick<Stripe, 'checkout' | 'webhooks' | 'refunds' | 'paymentIntents'>
export type BeatCheckoutOffer = { id: string; label: string; amountMinor: number; usageSummary: string; deliverables: string[] }
export type BeatCheckoutInput = { orderId: string; buyerId: string; buyerEmail: string; sellerId: string; stripeAccountId: string; contentId: string; title: string; offer: BeatCheckoutOffer; fulfillment: PurchaseEntitlement }
export type FeePolicy = { commissionBps: number; processingRateBps: number; processingFixedMinor: number }
const integrationIdentifier = (orderId: string) => {
  const suffix = createHash('sha256').update(`beatvault:${orderId}`).digest().subarray(0, 8)
  return `beatvault_${Array.from(suffix, byte => String.fromCharCode(97 + byte % 26)).join('')}`
}

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
    if (!isPurchaseEntitlement(input.fulfillment) || JSON.stringify(input.fulfillment.deliverables) !== JSON.stringify(input.offer.deliverables) || input.fulfillment.offerLabel !== input.offer.label || input.fulfillment.usageSummary !== input.offer.usageSummary) throw new Error('ORDER_DELIVERABLES_UNAVAILABLE')
    const existing = await this.repository.findBeatOrder(orderId)
    if (existing && (existing.buyerId !== input.buyerId || existing.sellerId !== input.sellerId || existing.contentId !== input.contentId || existing.offerId !== input.offer.id || existing.amountMinor !== input.offer.amountMinor || JSON.stringify(existing.fulfillment) !== JSON.stringify(input.fulfillment))) throw new Error('ORDER_IDEMPOTENCY_CONFLICT')
    if (existing && existing.status !== 'pending' && !(existing.status === 'failed' && !existing.stripeCheckoutSessionId)) throw new Error('ORDER_ALREADY_SETTLED')
    if (existing?.stripeCheckoutSessionId) {
      const previousSession = await this.stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId)
      if (previousSession.status === 'open' && previousSession.url) return { order: existing, url: previousSession.url }
      throw new Error('ORDER_CHECKOUT_CLOSED')
    }
    if (existing && (!existing.stripeDestinationAccountId || !existing.stripeCheckoutBaseUrl)) throw new Error('ORDER_CHECKOUT_RETRY_UNSAFE')

    let order: BeatOrder
    if (existing) {
      order = existing
    } else {
      const fee = calculateBeatFees(input.offer.amountMinor, this.fees)
      const created: BeatOrder = {
        id: orderId, buyerId: input.buyerId, sellerId: input.sellerId, contentId: input.contentId,
        offerId: input.offer.id, title: input.title, amountMinor: input.offer.amountMinor,
        ...fee, currency: 'usd', status: 'pending', createdAt: new Date().toISOString(), fulfillment: structuredClone(input.fulfillment),
        stripeDestinationAccountId: input.stripeAccountId, stripeCheckoutBaseUrl: this.publicUrl,
      }
      const stored = await this.repository.createBeatOrder(created)
      if (stored.buyerId !== created.buyerId || stored.sellerId !== created.sellerId || stored.contentId !== created.contentId || stored.offerId !== created.offerId || stored.amountMinor !== created.amountMinor || JSON.stringify(stored.fulfillment) !== JSON.stringify(created.fulfillment)) throw new Error('ORDER_IDEMPOTENCY_CONFLICT')
      if (stored.status !== 'pending') throw new Error('ORDER_ALREADY_SETTLED')
      order = stored
    }
    if (order.status === 'failed') {
      const reopened = await this.repository.transitionBeatOrder(orderId, ['failed'], { status: 'pending' })
      if (!reopened) throw new Error('ORDER_ALREADY_SETTLED')
      order = reopened
    }

    const entitlement = order.fulfillment
    if (!isPurchaseEntitlement(entitlement) || !order.stripeDestinationAccountId || !order.stripeCheckoutBaseUrl) throw new Error('ORDER_CHECKOUT_RETRY_UNSAFE')
    const successUrl = new URL(order.stripeCheckoutBaseUrl)
    successUrl.hash = `/marketplace?tab=purchases&checkout=success&order=${encodeURIComponent(orderId)}`
    const cancelUrl = new URL(order.stripeCheckoutBaseUrl)
    cancelUrl.hash = '/marketplace?tab=purchases&checkout=cancelled'
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: orderId,
        line_items: [{ quantity: 1, price_data: {
          currency: order.currency, unit_amount: order.amountMinor,
          product_data: { name: `${order.title} - ${entitlement.offerLabel}`, description: `${entitlement.usageSummary} Deliverables: ${entitlement.deliverables.join(', ')}.` },
        } }],
        payment_intent_data: {
          application_fee_amount: order.applicationFeeMinor,
          transfer_data: { destination: order.stripeDestinationAccountId },
          metadata: { beatvaultOrderId: order.id, beatvaultContentId: order.contentId, beatvaultOfferId: order.offerId },
        },
        metadata: { beatvaultOrderId: order.id, beatvaultBuyerId: order.buyerId },
        success_url: successUrl.toString(), cancel_url: cancelUrl.toString(),
        integration_identifier: integrationIdentifier(orderId),
      }, { idempotencyKey: `beatvault-checkout-${orderId}` })
      if (!session.url) throw new Error('STRIPE_CHECKOUT_URL_MISSING')
      const saved = await this.repository.updateBeatOrder(orderId, { stripeCheckoutSessionId: session.id })
      if (!saved) throw new Error('BEAT_ORDER_NOT_FOUND')
      return { order: saved, url: session.url }
    } catch (error) {
      await this.repository.transitionBeatOrder(orderId, ['pending'], { status: 'failed' })
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
    const updated = await this.repository.transitionBeatOrder(order.id, ['paid'], {
      status: 'refund_pending', stripeRefundId: refund.id,
      refundRequestedAt: new Date().toISOString(), refundRequestedBy: adminId,
    })
    if (updated) return updated
    const current = await this.repository.findBeatOrder(order.id)
    if (current && ['refunded', 'partially_refunded', 'disputed', 'refund_pending'].includes(current.status)) return current
    throw new Error('BEAT_ORDER_NOT_REFUNDABLE')
  }

  async handleWebhook(rawBody: Buffer, signature: string, webhookSecret: string): Promise<'processed' | 'duplicate' | 'ignored'> {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    if (event.livemode) return 'ignored'
    if (await this.repository.hasProcessedStripeEvent(event.id)) return 'duplicate'

    if (event.type.startsWith('checkout.session.')) {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.beatvaultOrderId || session.client_reference_id
      const order = orderId ? await this.repository.findBeatOrder(orderId) : await this.repository.findBeatOrderByCheckoutSessionId(session.id)
      if (orderId && !order) throw new Error('STRIPE_ORDER_NOT_FOUND')
      if (order) {
        if (order.stripeCheckoutSessionId !== session.id || session.currency !== order.currency || session.amount_total !== order.amountMinor ||
          (session.client_reference_id && session.client_reference_id !== order.id) ||
          (session.metadata?.beatvaultBuyerId && session.metadata.beatvaultBuyerId !== order.buyerId)) throw new Error('STRIPE_ORDER_MISMATCH')
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
        if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid') {
          await this.repository.transitionBeatOrder(order.id, ['pending', 'failed'], { status: 'paid', stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId, paidAt: order.paidAt || new Date().toISOString() })
        } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
          await this.repository.transitionBeatOrder(order.id, ['pending'], { status: 'failed', stripeCheckoutSessionId: session.id })
        } else if (event.type === 'checkout.session.completed') {
          await this.repository.updateBeatOrder(order.id, { stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId })
        }
      }
    } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute
      const paymentIntent = object.payment_intent
      const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id
      if (paymentIntentId) {
        let order = await this.repository.findBeatOrderByPaymentIntentId(paymentIntentId)
        if (!order) {
          const payment = await this.stripe.paymentIntents.retrieve(paymentIntentId)
          const orderId = payment.metadata?.beatvaultOrderId
          if (orderId) {
            order = await this.repository.findBeatOrder(orderId)
            if (!order) throw new Error('STRIPE_ORDER_NOT_FOUND')
            if (order.stripePaymentIntentId && order.stripePaymentIntentId !== paymentIntentId) throw new Error('STRIPE_ORDER_MISMATCH')
            await this.repository.updateBeatOrder(order.id, { stripePaymentIntentId: paymentIntentId })
          }
        }
        if (!order) {
          await this.repository.recordProcessedStripeEvent(event.id, event.type)
          return 'ignored'
        }
        if (order && event.type === 'charge.refunded') {
          const charge = object as Stripe.Charge
          const refund = charge.refunds?.data.at(-1)
          await this.repository.transitionBeatOrder(order.id, ['pending', 'paid', 'failed', 'refund_pending', 'partially_refunded', 'disputed'], {
            status: charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded',
            ...(refund?.id ? { stripeRefundId: refund.id } : {}), stripePaymentIntentId: paymentIntentId,
          })
        } else if (order) {
          const dispute = object as Stripe.Dispute
          await this.repository.transitionBeatOrder(order.id, ['pending', 'paid', 'failed', 'refund_pending', 'partially_refunded'], { status: 'disputed', disputeId: dispute.id, disputeReason: dispute.reason || 'unknown', stripePaymentIntentId: paymentIntentId })
        }
      }
    }

    await this.repository.recordProcessedStripeEvent(event.id, event.type)
    return 'processed'
  }
}
