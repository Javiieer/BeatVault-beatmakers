# Marketplace use, purchase, and subscription policy — working draft

**Status:** Internal product draft for discussion. It is not a published policy, contract, legal advice, or a promise that a purchase flow is enabled. Obtain review from qualified counsel for the jurisdictions BeatVault serves before publishing terms or accepting live payments.

## Scope and current product state

BeatVault is a creative marketplace and community for beatmakers and music artists. The Marketplace is intended for discovery and future purchases of Beat licenses. This draft concerns Beats and the creator plans shown in the app; it does not cover music distribution, DJ tools, or automatic library organization.

Today, sellers can save private Beat offer drafts and submit their commercial listing for review. Stored offers retain `draft-only` status; the API can expose eligible offers to the test-mode purchase flow only when the listing is complete and currently approved, its Beat is currently public, the seller's Stripe account is connected and able to receive transfers, the source asset is available, and Stripe payments are configured. Test-mode support is not a public offer or a live-payment commitment. Review and publication are independent decisions.

Creator and Studio plan assignment is local administrative state with storage limits/features; recurring subscription billing, renewals, cancellation billing, and paid entitlement changes are not implemented. Any prices or plan descriptions are proposals until approved and shown in a real checkout.

## Proposed seller terms

- Sellers should offer only Beats they created or are authorized to license, and should describe collaborators, composition/master shares, samples, licenses, restrictions, deliverables, and any relevant attribution accurately.
- Sellers remain responsible for obtaining permissions from co-creators, rightsholders, and sample licensors. BeatVault's intake review, seller declarations, documents, and any future matching result do not establish ownership or legal clearance.
- Sellers should keep evidence relevant to a listing current. A change to the listing or its evidence requires a new commercial review. Public catalog moderation does not replace commercial review.
- A seller should not offer an asset if they cannot grant the stated license or if its rights conflict with an existing exclusive grant. The final scope, territory, term, uses, exclusivity, and permitted monetization must be defined in the eventual license and checkout receipt.
- BeatVault should define how creator names, credits, collaborator splits, attribution, takedowns, disputes, and inaccurate declarations are handled before live launch.

## Proposed buyer terms

- Before payment, a buyer should see the exact Beat, seller identity, price and currency, license version, deliverables, permitted uses, restrictions, term, territory, exclusivity, credit requirements, and refund conditions.
- A paid order should grant only the license stated in the versioned checkout terms and receipt. A purchase should not transfer copyright ownership unless an explicit written agreement says so.
- Buyers should not resell or redistribute the raw Beat, stems, or source files as standalone products, or claim authorship of material they did not create. The final license must state whether the buyer may make a derivative composition, release it commercially, monetize video, use it in ads, or sublicense it.
- A payment confirmation must come from a verified provider event and an order receipt. A browser redirect, an unpaid order, a seller's review, or a file preview is not proof of purchase.
- Refund eligibility, chargebacks, failed delivery, duplicate payments, disputes, and post-refund download access must be described before purchases are enabled. The current implementation can request a full refund in test mode; this does not settle a public refund policy.

## Proposed subscriptions and creator plans

- Free, Creator, and Studio plan names or feature lists should not imply recurring billing until a subscription checkout, renewal, cancellation, proration, failed-payment handling, and entitlement lifecycle exist.
- Before enabling a paid plan, clearly show the billing interval, amount, taxes, included storage and features, renewal date, cancellation path and effective date, treatment of stored files after downgrades, and any refund rules.
- Do not infer a Beat license or purchase credit from a Creator/Studio subscription. A plan subscription and a one-time Beat license are separate products unless a later approved plan explicitly says otherwise.
- Entitlements should follow provider-confirmed subscription state and remain auditable when a subscription starts, renews, pauses, fails, cancels, or expires.

## Open decisions before publication

Counsel and product owners must settle applicable jurisdictions and consumer rules, final license templates, sample and collaborator warranties, tax/invoicing, seller payout timing and currency, platform fees, refunds, takedown and counter-notice handling, dispute operations, data retention, and how seller evidence is protected. The policy must match the shipped UI, provider configuration, and actual support process before it is published.

## Product references

- [Seller intake rules](MARKETPLACE_SELLER_RULES.md)
- [Stripe test-mode workflow and launch controls](STRIPE_CONNECT_TESTING.md)
- [Current product and release scope](RELEASE_SCOPE.md)
