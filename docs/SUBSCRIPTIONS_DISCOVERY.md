# Subscriptions Discovery

## Purpose and scope

This document is product discovery for a future plans page and account control panel. It does not define final pricing and does not authorize payment, authentication, backend, or entitlement implementation in the current local-only prototype.

## User types

- **Visitor:** can browse public catalog content and previews according to future public-access rules.
- **Free creator:** can create a limited workspace, test the workflow, and use explicitly defined free entitlements.
- **Subscribed creator:** receives plan entitlements for downloads, beats, storage, previews, and collaboration.
- **Team or collaborator:** may access shared workspaces only through explicit workspace membership and role permissions.
- **Publisher or seller:** may need separate marketplace, licensing, payout, and catalog entitlements; a subscription must not imply seller status.
- **Administrator or support agent:** can inspect and correct subscription state through audited internal tools, without bypassing content ownership rules.

## Package directions

Packages should be tested as entitlement bundles rather than named or priced commitments. Possible dimensions include:

- Download credits or monthly download counts for sample libraries and other downloadable assets.
- Beat access, beat downloads, license tiers, or separate purchase rights. Subscription access must not silently grant commercial licenses.
- Preview access, preview quality, waveform visibility, and playback limits.
- BeatVault Cloud storage quota, file count, upload size, retention, and version history.
- Connected cloud providers, such as provider count, sync capacity, or supported operations. Originals may remain with the connected provider.
- Collaboration seats, shared projects, roles, comments, revision history, and guest access.
- Creator tools such as private/public catalog capacity, analytics history, and export limits.

These are candidate dimensions only. A first release should minimize overlapping quotas and clearly separate subscription access from one-time marketplace licenses.

## Measurable entitlements and limits

Every entitlement should have a stable key, unit, scope, period, and enforcement source. Candidate fields:

- `library_downloads`: count per billing period, with a defined policy for failed, repeated, and cancelled downloads.
- `beat_downloads` and `beat_license_tier`: count and license relationship must be explicit.
- `preview_minutes` or `preview_requests`: only if abuse or infrastructure cost justifies a limit.
- `storage_bytes`, `file_count`, `max_file_bytes`, and `version_count` per user or workspace.
- `cloud_provider_count` and provider-specific capability flags.
- `collaborator_seats`, `shared_projects`, and role capabilities.
- `private_assets`, `published_assets`, `analytics_retention_days`, and `export_count`.

The product must define whether unused quotas roll over, whether limits apply to existing data after downgrade, and whether a workspace or its owner consumes the quota. Usage records should be idempotent and auditable.

## Trial and lifecycle

The trial should have a stated duration, eligible user rule, payment-method requirement, conversion behavior, and abuse policy. Trial entitlements should be distinguishable from paid entitlements.

Upgrades should state when increased limits become available and how proration is handled. Downgrades should state whether they apply immediately or at period end, what happens when usage exceeds the new limit, and whether existing files remain readable. Cancellation should normally preserve access through the paid period, stop renewal, and provide export/deletion guidance. Past-due, payment-failed, grace-period, suspension, and data-retention states require explicit product decisions.

## Future billing provider

Select a provider later after tax, geography, payout, marketplace licensing, invoicing, and platform-fee requirements are known. The billing adapter should be replaceable and the application should store provider-neutral customer, subscription, invoice, and event identifiers. Provider webhooks must be authenticated, replay-safe, ordered by event version or timestamp policy, and observable. The provider remains the source of payment truth; BeatVault remains the source of product entitlement policy.

## Security and server-side entitlements

Entitlements must be calculated and enforced server-side. The client may display a cached plan state but must never be trusted to authorize downloads, storage writes, previews, licenses, provider connections, or collaboration actions. Download and preview URLs should be short-lived and scoped to authorized assets.

Future implementation should include authenticated sessions, least-privilege workspace roles, webhook signature verification, idempotency keys, audit logs, rate limits, abuse detection, encrypted provider tokens, secret isolation, and explicit revocation. OAuth credentials and refresh tokens must not reach the browser. Subscription changes should be traceable from billing event to entitlement decision.

## Legal and operational risks

- Beat and sample access may involve distinct copyright, mechanical, synchronization, resale, and commercial-use licenses.
- Terms must distinguish subscription access, downloads, previews, perpetual licenses, and ownership of user uploads.
- Refunds, chargebacks, taxes, VAT/GST, consumer cancellation rights, renewals, and regional availability need jurisdiction-specific review.
- User files and connected-provider metadata require privacy notices, retention/deletion rules, data export, and processor agreements.
- Shared workspaces need ownership, permission, takedown, dispute, and post-cancellation rules.
- Quotas and trial abuse can create infrastructure cost, scraping, account farming, and provider rate-limit exposure.
- Storage deletion, provider disconnection, and account closure must avoid accidental loss and provide clear recovery windows.

## Decisions pending

- Which primary outcome is monetized first: downloads, storage, collaboration, creator tools, or licensed beats?
- Are sample-library downloads subscription entitlements, purchases, or both?
- Are beat licenses always separate products from subscriptions?
- What is the free baseline and what meaningful workflow does it support?
- Will storage be BeatVault-owned, provider-backed, or a hybrid with explicit availability guarantees?
- Are plans per creator, per workspace, or both?
- Which cloud providers and capabilities are in the first integration scope?
- What are the trial duration, eligibility, grace period, retention, and export policies?
- Which regions, currencies, taxes, and payment methods are supported at launch?
- What admin, support, refund, and entitlement-correction workflows are required?
- Which usage events are billable or quota-counted, and what telemetry/privacy boundaries apply?

## Current boundary

No pricing, payment flow, auth, backend, billing provider, entitlement service, cloud integration, or functional plans/control-panel page is implemented. The existing frontend remains local-only with mock data and browser-local persistence.
