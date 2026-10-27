import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { ServerRepository, StripeConnectRecord } from './store'
import { StripeConnectService, type StripeGateway } from './stripe-connect'

const existing: StripeConnectRecord = { accountId: 'creator-1', stripeAccountId: 'acct_test_1', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, deauthorized: false, updatedAt: new Date(0).toISOString() }
const repository = () => ({
  findStripeConnectAccount: vi.fn(async () => undefined as StripeConnectRecord | undefined),
  findStripeConnectAccountByStripeId: vi.fn(async () => existing as StripeConnectRecord | undefined),
  saveStripeConnectAccount: vi.fn(async () => undefined),
  hasProcessedStripeEvent: vi.fn(async () => false),
  recordProcessedStripeEvent: vi.fn(async () => true),
})
const account = {
  id: 'acct_test_1', configuration: { recipient: { applied: true, capabilities: { stripe_balance: { stripe_transfers: { status: 'active', status_details: [] } } } } },
} as unknown as Stripe.V2.Core.Account
const stripeGateway = (accounts: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> }, links: { create: ReturnType<typeof vi.fn> }, constructEvent = vi.fn(), parseEventNotification = vi.fn()) => ({
  v2: { core: { accounts, accountLinks: links } }, webhooks: { constructEvent }, parseEventNotification,
}) as unknown as StripeGateway

describe('Stripe Connect Accounts v2', () => {
  it('creates an Express recipient account and a hosted onboarding link', async () => {
    const repo = repository()
    const stripe = stripeGateway({ create: vi.fn(async () => account), retrieve: vi.fn() }, { create: vi.fn(async () => ({ url: 'https://connect.stripe.com/setup/test' })) })
    const service = new StripeConnectService(stripe, repo as unknown as ServerRepository, 'https://beatvault.test')

    await expect(service.createOnboardingLink('creator-1', 'creator@example.test')).resolves.toBe('https://connect.stripe.com/setup/test')
    expect(stripe.v2.core.accounts.create).toHaveBeenCalledWith(expect.objectContaining({
      identity: { country: 'MX', entity_type: 'individual' }, contact_email: 'creator@example.test', dashboard: 'express',
      defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { beatvaultAccountId: 'creator-1' },
    }), { idempotencyKey: 'beatvault-connect-creator-1' })
    expect(stripe.v2.core.accountLinks.create).toHaveBeenCalledWith({ account: 'acct_test_1', use_case: { type: 'account_onboarding', account_onboarding: { return_url: 'https://beatvault.test/#/marketplace?connect=return', refresh_url: 'https://beatvault.test/#/marketplace?connect=refresh' } } })
    expect(repo.saveStripeConnectAccount).toHaveBeenCalledOnce()
  })

  it('reuses the v2 connected account when onboarding is resumed', async () => {
    const repo = repository()
    repo.findStripeConnectAccount.mockResolvedValue(existing)
    const stripe = stripeGateway({ create: vi.fn(), retrieve: vi.fn() }, { create: vi.fn(async () => ({ url: 'https://connect.stripe.com/setup/resume' })) })
    const service = new StripeConnectService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188')

    await service.createOnboardingLink('creator-1', 'creator@example.test')
    expect(stripe.v2.core.accounts.create).not.toHaveBeenCalled()
  })

  it('refreshes v2 recipient capability state from Stripe on signed account events', async () => {
    const repo = repository()
    const notification = { id: 'evt_test_1', type: 'v2.core.account[configuration.recipient].capability_status_updated', livemode: false, related_object: { id: 'acct_test_1' }, fetchRelatedObject: vi.fn(async () => account) }
    const stripe = stripeGateway({ create: vi.fn(), retrieve: vi.fn() }, { create: vi.fn() }, vi.fn(), vi.fn(() => notification))
    const service = new StripeConnectService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188')

    await expect(service.handleWebhook(Buffer.from('{"object":"v2.core.event"}'), 'sig_test', 'whsec_test')).resolves.toBe('processed')
    expect(notification.fetchRelatedObject).toHaveBeenCalledOnce()
    expect(repo.saveStripeConnectAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'creator-1', payoutsEnabled: true, detailsSubmitted: true }))
    expect(repo.recordProcessedStripeEvent).toHaveBeenCalledWith('evt_test_1', notification.type)
    repo.hasProcessedStripeEvent.mockResolvedValue(true)
    await expect(service.handleWebhook(Buffer.from('{"object":"v2.core.event"}'), 'sig_test', 'whsec_test')).resolves.toBe('duplicate')
    expect(repo.saveStripeConnectAccount).toHaveBeenCalledOnce()
  })

  it('marks the connected account deauthorized from event.account, not the application object id', async () => {
    const repo = repository()
    const event = { id: 'evt_deauthorized', type: 'account.application.deauthorized', livemode: false, account: 'acct_test_1', data: { object: { id: 'ca_test_application' } } } as unknown as Stripe.Event
    const stripe = stripeGateway({ create: vi.fn(), retrieve: vi.fn() }, { create: vi.fn() }, vi.fn(() => event))
    const service = new StripeConnectService(stripe, repo as unknown as ServerRepository, 'http://localhost:5188')

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_test', 'whsec_test')).resolves.toBe('processed')
    expect(repo.findStripeConnectAccountByStripeId).toHaveBeenCalledWith('acct_test_1')
    expect(repo.saveStripeConnectAccount).toHaveBeenCalledWith(expect.objectContaining({ stripeAccountId: 'acct_test_1', deauthorized: true, payoutsEnabled: false }))
  })
})
