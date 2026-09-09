# Admin Panel Discovery

**Status:** Planned, not implemented

## Purpose

The internal admin panel will manage creators, accounts, catalog review, plans, promotions, moderation, provider operations, and platform health.

## Security Rule

An admin ID must never be trusted by the browser as authorization. The frontend may hide admin navigation, but every admin API request must be authorized server-side with an authenticated session, role/permission checks, and audit logging.

Recommended layers:

- Authenticated account.
- Platform or organization scope.
- Roles such as `admin`, `support`, `moderator`, `catalog-manager`, and `finance`.
- Fine-grained read/create/update/publish/suspend/refund/delete permissions.
- Audit event for every sensitive action.
- MFA or re-authentication for financial and destructive actions.

## Admin Areas

### Operations

- Active users, creators, reviews, catalog activity, storage health, preview health, failed jobs, sync errors, subscriptions, and promotions.

### Account review

- Search by account, creator, email, and internal ID.
- Account states: active, pending, suspended, deleted.
- Creator verification queue, support notes, moderation history, sessions, and security events.

### Catalog moderation

- Review beats, samples, packs, and future products.
- Visibility and publication status.
- Copyright/takedown workflow.
- Metadata corrections with audit trail.
- Preview and file health.

### Plans and entitlements

- Plan definitions and feature limits.
- Download, preview, storage, and provider connection limits.
- Trials, grace periods, manual adjustments, and upgrade/downgrade history.

### Promotions

- Server-side promotion code generation and validation.
- Fixed or percentage discounts.
- Validity window, plan/product eligibility, redemption limits, minimum purchase, and stacking rules.
- Active, paused, expired, and exhausted states.
- Fraud and rate-limit protections.

Codes should be stored hashed where practical, never exposed as an unrestricted client list, and every redemption must be idempotent and auditable.

### Platform configuration

- Feature flags, provider availability, upload limits, preview policies, maintenance mode, and active legal terms version.

## Future API Boundary

```text
Admin UI
  -> Admin API
      -> Authorization and audit middleware
          -> Accounts / Catalog / Plans / Promotions / Providers
```

The browser must never access the database directly or receive provider credentials.

## Deferred Work

Do not implement real admin access, promotion redemption, billing changes, account suspension/deletion, refunds, or provider credentials in the local frontend. Mock screens may be designed later; sensitive behavior belongs behind the VPS API.

## Decisions Required

- Internal roles and organization scope.
- MFA requirements.
- Who can issue discounts or adjust entitlements.
- Promotion stacking and eligibility rules.
- Audit-log retention.
- Copyright and moderation process.
- Production billing provider.
