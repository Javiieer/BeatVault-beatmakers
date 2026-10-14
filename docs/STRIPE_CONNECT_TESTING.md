# Stripe test setup

BeatVault supports test-mode Stripe Connect Express onboarding and one-time Checkout purchases for approved beats. Creator/Studio recurring subscriptions, one-shots, live payments, tax calculation, and production payouts are not enabled.

## Local setup

1. Use a Stripe test-mode key (`rk_test_...` preferred; `sk_test_...` also supported). Give a restricted key only the API permissions this integration needs. Never put Stripe secrets in `VITE_*` variables, browser code, screenshots, or Git.
2. Set the server-only environment variables shown in `.env.example`:
   - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PROCESSING_RATE_BPS` and, if applicable, `STRIPE_PROCESSING_FIXED_MINOR`, copied from the actual pricing for the account/payment methods being tested
   - `STRIPE_PLATFORM_COMMISSION_BPS=500` for the provisional 5% platform commission
   - `BEATVAULT_PUBLIC_URL=http://localhost:5188`
3. Start the Stripe CLI listener and forward account and payment events to the local API. Keep the CLI-provided `whsec_...` value local:

   ```sh
   stripe listen --forward-to localhost:4174/api/webhooks/stripe --forward-connect-to localhost:4174/api/webhooks/stripe
   ```

   Subscribe the webhook destination to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `v2.core.account[configuration.recipient].capability_status_updated`, and `v2.core.account.closed`.
4. Restart the API. Connect onboarding requires the test key and webhook secret. Checkout additionally stays disabled until the processing estimate is configured.
5. Sign in as a creator, open Marketplace, and choose **Set up with Stripe**. Stripe-hosted Express onboarding is for Mexico and requests recipient transfers. A seller's offer is purchasable only after current admin approval, an available source file, and an active transfer capability.
6. Sign in with a different account to test buying. Checkout uses the offer amount loaded from the server, USD, and one beat per session. The webhook, not the success redirect, marks an order paid. The original file is downloadable only by that buyer after the verified paid event.

## Fee model

The current estimate uses integer USD cents: a provisional 5% commission plus a configurable percentage and fixed Stripe-processing estimate. That combined estimate is sent as the destination charge's application fee; the remaining amount is transferred to the seller when Stripe completes payment. This is an estimate, not a guaranteed margin: actual processing costs vary by account, payment method, geography, and currency. Do not enable checkout with guessed rates or treat this as an approved final price/tax policy.

## Persistence and remaining launch controls

JSON mode stores connected accounts, webhook event IDs, and orders under the local data directory. PostgreSQL must apply migrations `019_stripe_connect.sql`, `020_beat_orders.sql`, and `021_beat_order_refunds.sql`. Webhook signatures use the original raw body and a bounded payload; repeated event IDs are deduplicated.

## Refund and dispute testing

An administrator can see the local order ledger and request a full refund for a paid purchase. The API uses a stable Stripe idempotency key and asks Stripe to refund the application fee and reverse the destination transfer. The order remains `refund_pending` until the signed `charge.refunded` webhook confirms it; paid-only downloads stop as soon as the request is accepted. Partial refunds performed outside BeatVault are recorded separately and do not enable downloads.

Disputes are flagged in the admin order queue, but evidence preparation and submission remain manual in Stripe. BeatVault does not automatically reverse a disputed transfer: reversals can fail if the connected seller lacks sufficient balance, and the platform remains responsible for the negative balance under the selected Connect model. Test in Stripe test mode, including repeated refund requests, failed reversals, partial refunds, and dispute notifications. No production or live keys are accepted by this configuration.

Legal license terms, seller/buyer policies, Stripe account pricing, tax registrations, refund support policy, and a full live-mode review remain required before a public launch.
