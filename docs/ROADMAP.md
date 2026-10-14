# Roadmap

Current priority: complete one reliable creator audio workflow before expanding modules.
See RELEASE_SCOPE.md for the decision on every section.

Home's browser-local composer/profile mirror, Friends request foundation, and direct
friend chat are supporting creator surfaces. Home remains browser-local; chat messages
persist in the local API and connected clients use SSE. Keep these boundaries honest.

Oracle VPS Compose/Caddy deployment scaffolding is now present for a single-machine
private pilot. It is not public-launch ready; follow docs/DEPLOY_ORACLE_VPS.md and
close the email, admin provisioning, Postgres restore, and media-validation blockers.

## 1. Diagnostics and scope - implemented

Shared module inventory, focused navigation, repeatable code checks, local HTTP
security probes, browser route coverage and a GitHub workflow definition.
Results live in artifacts/diagnostics, with unresolved issues in BUGS.md.
The `npm run test:qa-bots` suite runs the two-account chat journey, creator upload
isolation, profile/settings menus, social notifications and admin API permission
checks against temporary test data. A visual bot captures every menu URL in dark,
light and custom RGB at desktop and mobile sizes.

## 2. Authenticated audio lifecycle - implemented with local JSON

Owned audio/cover references, reload playback/download, account cache isolation and
lost-response retries have desktop/mobile coverage. A separate AAC/M4A public preview
is encoded through external FFmpeg; owners can retry missing previews. The original
remains private. Retrying a lost upload after reload still requires file reselection.
FFmpeg tests generate and validate WAV, MP3, FLAC, AAC, M4A, OGG and WEBM source
fixtures, including malformed media. The full multipart API/DB matrix remains next.
Production storage remains separate work.

## 3. Publication and discovery

The local admin review queue and published Beat catalog use server records. Processed
previews keep originals private; Postgres 001-014 migrations, ownership/CSRF checks,
moderation, actual AAC encoding, seven upload formats, quota concurrency, admin
account-specific quota overrides and local package assignment passed against a
disposable database. Provisional 5/50/250 GiB package caps have deterministic
virtual-user estimates; replace planning assumptions with measured usage before
choosing VPS disk sizing. Stripe Connect test-only seller onboarding has started;
subscriptions, charges, marketplace transfers, payouts and purchased-package badges
remain disabled until pricing, terms, tax and the full payment ledger are designed.

### Marketplace discovery backend (2026-10-12)

`GET /api/marketplace` returns only approved Beats and One-shots, with bounded search,
creator/tag/type filters and cursor pagination. Public DTOs continue to omit original
asset IDs and private audio metadata; only approved preview endpoints are exposed.
The UI requests filtered pages and supports loading additional results. Stripe Connect
Express seller onboarding is available behind local test credentials, with signed,
replay-safe account webhooks. This is still not commerce: offers, license terms, orders,
buyer charges, marketplace transfers, refunds and tax handling are not implemented.

English is now the default document/navigation/Marketplace locale, with Spanish
translations for those strings and a message catalog that can be extended. The
settings preference supports English and Spanish; remaining application routes still
need their strings migrated before complete localization can be claimed.

## 3a. Social foundation - limited local scope

Home posts are account-scoped to one browser and mirrored to the owner's profile.
Friends discovers opted-in public profiles and persists requests/connections in the
local API (migration 006). Direct text messages are restricted to accepted friends,
persist in JSON or PostgreSQL (migration 008), and update connected clients over SSE.
Published catalog Beats support persisted comments/reactions and in-app notifications
(migration 009). Public Home post distribution, chat attachments, blocking/reporting,
and friend-based feed ranking remain future work.

## 4. Private pilot readiness

Real Postgres integration and concurrency tests, durable sessions, email delivery,
backup/restore drills, deployment configuration and authenticated browser coverage.

## 5. Market discovery - partial; commerce deferred

The Mercado surface browses published Beats and One-shots, with creator links and audio
previews. Admin can persist category-scoped promotional rules (migration 015), but they
are not applied to listing prices or checkout. USD is the selected marketplace base and
listing currency. Users can choose USD, MXN, or EUR for display, with cached ECB
reference rates for indicative conversion only. Seller settlement currency is not yet
selected. One purchase flow replaces Store; license pricing, tax handling, platform
fees, checkout, and payouts wait for product, fiscal, and payment-provider decisions.
The private beat offer-intake form persists artist-facing metadata, separate master and
composition shares, collaborator credits, sample provenance declarations, USD reference
offers, and a versioned rights-intake timestamp. Offers remain `draft-only`. Sellers can
attach private, signature-checked PDF/JPEG/PNG rights evidence. Community managers can
leave a reasoned recommendation or request changes; admins can make a reasoned final
intake decision only after a current positive recommendation from a different account.
Admin approval does not activate offers or permit purchases. Evidence and the seller rules
in `docs/MARKETPLACE_SELLER_RULES.md` are not legal clearance or enforceable terms.
Sellers can see the community recommendation and final admin decision, including when
either review became stale after an edit. A current approval is explicitly not a sale
activation; UI and API tests cover these boundaries. Next, review license templates and
seller terms with qualified counsel. Paid delivery and checkout remain gated on approved
terms, tax handling, payment ledger design, and end-to-end purchase/refund testing. Plans
follow an implemented purchase model, not an isolated pricing screen.

## 6. Expansion - deferred

Shorts, expanded community and collaboration workflows after catalog validation. AI and distribution
require separate evidence of demand and implementation scope.

Historical phase numbering and older "frontend only" limits remain in CHANGELOG.md
and phase reports; they do not describe the current repository state.
