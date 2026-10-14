import Stripe from 'stripe'
import type { ServerRepository, StripeConnectRecord } from './store'

export type StripeGateway = Pick<Stripe, 'v2' | 'webhooks' | 'parseEventNotification'>

const accountState = (account: Stripe.V2.Core.Account, accountId: string, deauthorized = false): StripeConnectRecord => ({
  accountId,
  stripeAccountId: account.id,
  chargesEnabled: false,
  payoutsEnabled: !deauthorized && account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active',
  detailsSubmitted: !deauthorized && Boolean(account.configuration?.recipient?.applied),
  deauthorized,
  updatedAt: new Date().toISOString(),
})

export class StripeConnectService {
  constructor(private readonly stripe: StripeGateway, private readonly repository: ServerRepository, private readonly publicUrl: string) {}

  status(accountId: string) { return this.repository.findStripeConnectAccount(accountId) }

  async createOnboardingLink(accountId: string, email: string): Promise<string> {
    let connected = await this.repository.findStripeConnectAccount(accountId)
    if (connected?.deauthorized) throw new Error('CONNECT_ACCOUNT_DEAUTHORIZED')
    if (!connected) {
      const created = await this.stripe.v2.core.accounts.create({
        identity: { country: 'MX', entity_type: 'individual' },
        contact_email: email,
        dashboard: 'express',
        defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        include: ['configuration.recipient'],
        metadata: { beatvaultAccountId: accountId },
      }, { idempotencyKey: `beatvault-connect-${accountId}` })
      connected = accountState(created, accountId)
      await this.repository.saveStripeConnectAccount(connected)
    }

    const returnUrl = new URL(this.publicUrl)
    returnUrl.hash = '/marketplace?connect=return'
    const refreshUrl = new URL(this.publicUrl)
    refreshUrl.hash = '/marketplace?connect=refresh'
    const link = await this.stripe.v2.core.accountLinks.create({
      account: connected.stripeAccountId,
      use_case: { type: 'account_onboarding', account_onboarding: { return_url: returnUrl.toString(), refresh_url: refreshUrl.toString() } },
    })
    return link.url
  }

  async handleWebhook(rawBody: Buffer, signature: string, webhookSecret: string): Promise<'processed' | 'duplicate' | 'ignored'> {
    let payload: { object?: unknown } | undefined
    try { payload = JSON.parse(rawBody.toString('utf8')) as { object?: unknown } } catch { /* Let Stripe return its normal signature or payload error. */ }
    if (payload?.object === 'v2.core.event') {
      const notification = this.stripe.parseEventNotification(rawBody, signature, webhookSecret)
      if (notification.livemode) return 'ignored'
      if (await this.repository.hasProcessedStripeEvent(notification.id)) return 'duplicate'
      if (notification.type === 'v2.core.account.closed') {
        const accountNotification = notification as unknown as { related_object?: { id?: string } | null }
        const stripeAccountId = accountNotification.related_object?.id
        const record = stripeAccountId ? await this.repository.findStripeConnectAccountByStripeId(stripeAccountId) : undefined
        if (record) await this.repository.saveStripeConnectAccount({ ...record, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, deauthorized: true, updatedAt: new Date().toISOString() })
      } else if (notification.type.startsWith('v2.core.account')) {
        const accountNotification = notification as unknown as { related_object: { id: string }; fetchRelatedObject: () => Promise<unknown> }
        const stripeAccountId = accountNotification.related_object?.id
        if (!stripeAccountId) return 'ignored'
        const record = await this.repository.findStripeConnectAccountByStripeId(stripeAccountId)
        if (record) {
          const stripeAccount = await accountNotification.fetchRelatedObject() as Stripe.V2.Core.Account | null
          if (stripeAccount) await this.repository.saveStripeConnectAccount(accountState(stripeAccount, record.accountId))
        }
      } else return 'ignored'
      await this.repository.recordProcessedStripeEvent(notification.id, notification.type)
      return 'processed'
    }
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    const eventType = String(event.type)
    if (event.livemode) return 'ignored'
    if (await this.repository.hasProcessedStripeEvent(event.id)) return 'duplicate'

    if (eventType.startsWith('v2.core.account') && eventType !== 'v2.core.account.closed') {
      const object = event.data.object as { id?: string }
      const stripeAccountId = object.id
      const record = stripeAccountId ? await this.repository.findStripeConnectAccountByStripeId(stripeAccountId) : undefined
      if (record && stripeAccountId) {
        const stripeAccount = await this.stripe.v2.core.accounts.retrieve(stripeAccountId, { include: ['configuration.recipient', 'requirements'] })
        await this.repository.saveStripeConnectAccount(accountState(stripeAccount, record.accountId))
      }
    } else if (eventType === 'v2.core.account.closed' || eventType === 'account.application.deauthorized') {
      const object = event.data.object as { id?: string }
      const stripeAccountId = object.id || event.account || undefined
      const record = stripeAccountId ? await this.repository.findStripeConnectAccountByStripeId(stripeAccountId) : undefined
      if (record) await this.repository.saveStripeConnectAccount({ ...record, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, deauthorized: true, updatedAt: new Date().toISOString() })
    } else return 'ignored'

    await this.repository.recordProcessedStripeEvent(event.id, eventType)
    return 'processed'
  }
}
