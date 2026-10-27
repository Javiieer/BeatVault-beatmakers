# BeatVault BeatMakers Roadmap

**Status date:** 2026-10-27
**Purpose:** Current product and engineering memory for contributors and AI assistants.
**Authority:** This document describes the current intended state. When older phase reports or docs disagree, verify against the current code and the focused references linked below; do not repeat historical claims as current facts.

## Local PostgreSQL cutover - 2026-10-26

Native PostgreSQL 16.15 is active for Windows local startup. Migrations 001-030,
integration/concurrency QA and backup/restore passed; the 2026-10-27 recheck preserved
the original account hashes/roles and verified commercial approval across audit
retention and API restart. The original JSON data and six orphan records remain
preserved. See [POSTGRES_LOCAL.md](POSTGRES_LOCAL.md) and
[CONSOLIDATION_STAGES.md](CONSOLIDATION_STAGES.md).
Earlier pending-local-PostgreSQL statements below are superseded by this evidence;
hosted deployment, off-device recovery and Mercado Pago sandbox reconciliation remain pending.
Stems are explicitly deferred; new seller offers support MP3/WAV only.

## Product Direction

Work queue and ordering for the next stage: [PRIORITIES.md](PRIORITIES.md). The local
provider implementation is in place; the next commerce blocker is a complete Mercado
Pago sandbox round trip, followed by recovery and private-pilot operations.
For current system boundaries and evidence, see [ARCHITECTURE_CURRENT.md](ARCHITECTURE_CURRENT.md).

The [2026-10-26 functional audit](PRODUCT_AUDIT_2026-10-26.md) records the original
findings. Their local consolidation now includes login/profile continuity, One-shot
review, account-persisted favorites, independent commercial review state, and image
normalization with audio batches. See [CONSOLIDATION_STAGES.md](CONSOLIDATION_STAGES.md)
for verification scope. Next operational work covers Mercado Pago sandbox
reconciliation, email delivery, off-device recovery and remaining moderation controls.
Keep stems and additional modules deferred.

BeatVault is a creator platform for beatmakers and music artists: publish and discover
Beats and One-shots, build creator profiles, connect with other users, and eventually
sell beat licenses. It is not DJ software, an automatic music organizer, or a music
distribution service.

The current working target is a reliable local app on the owner's PC, followed by a
small private Oracle VPS pilot when its operational blockers are closed. Do not treat
the VPS configuration or test payment flow as public-launch readiness.

Product decisions to preserve:

- Keep creator uploads focused on Beats and One-shots.
- Keep one Marketplace entry point for discovery and future beat-license purchases.
- USD is the listing/base currency. USD, MXN, and EUR display conversion is indicative
  only; it is not seller settlement or tax conversion.
- English is the default product language. Spanish exists for selected navigation and
  Marketplace strings; full localization is not complete.
- Theme settings support dark, light, and custom RGB colors. Keep contrast and component
  readability under test when changing theme behavior.
- BeatVault-managed single beat purchases are the first commerce direction. Creator and
  Studio subscriptions, one-shot sales, and final prices remain unapproved/deferred.
- Music distribution to DSPs is a separate future service. Do not build or contract for
  it until demand, operations, and a provider business case are established.

## Status Legend

- **Implemented:** behavior exists in the repository and has automated coverage.
- **Local/test only:** available for development or provider test mode; not production.
- **Partial:** useful foundation exists, but important user or operational workflows
  remain incomplete.
- **Deferred:** intentionally outside the current milestone.
- **Blocked:** do not launch or enable until the named requirements are satisfied.

## Built

### Application and creator workflow — Implemented locally

- React/Vite frontend and local Node API, with routes for Home, Friends, Messages,
  My uploads, Library, Beats, Marketplace, Upload, Plans, Admin, profile, and settings.
- Registration/login, role-aware admin and Community Manager access, password change,
  and local password-recovery flow. Recovery email delivery is not configured.
- Creator profile metadata, privacy controls, profile menu, language preference, and
  dark/light/custom RGB theme settings. Custom avatar and cover uploads support
  persisted focal positioning and desktop/mobile previews.
- Authenticated audio upload, owned audio and cover references, account-scoped browser
  data, reload playback/download, metadata edits, archive/restore, and retry behavior.
  The original audio remains private; processed previews are served separately.
- Uploads are focused on Beats and One-shots. FFmpeg is an external dependency for
  processing previews; it is not bundled with the app.
- Beat upload moderation is open to either a Community Manager or an administrator:
  one approval publishes the Beat, so moderation does not bottleneck on the admin.
  Both review queues use the same private processed preview; approval is disabled if
  it is unavailable. CM/admin approvals and rejections are audited.
  Seller-listing review remains a separate CM recommendation followed by an admin
  decision because it controls commercial terms, not basic catalog publication.
- Admin catalog moderation, seller/admin storage views, configurable storage limits,
  local plan assignment, and audit history.

### Social foundation — Partial; backend persistence is in place, production readiness remains

- Authenticated Home posts and media use the API and support public/friends/private
  audiences; profile posts read the same server records. Comments/reactions, follows
  and bookmarks persist by account/post IDs. Migration 028 adds PostgreSQL follow and
  bookmark tables; clean-schema disposable PostgreSQL and backup/restore checks passed.
  An existing-volume upgrade rehearsal remains before hosted use.
- Home Stories are separate JSON/PostgreSQL records (migration 029), not feed posts.
  Text/photo/video stories support public/friends/private audiences, owner deletion,
  a 24-hour server expiry, at most 20 active stories per account, and the shared 512 MiB
  social-media quota. Photos are normalized (20 MB max); videos are MP4/H.264 (100 MB,
  30 seconds, 1920x1080 max). Media access rechecks visibility, generic SSE prompts
  connected sessions to refresh, and maintenance removes expired records/files.
  Automated unit/API/component and two-account mobile browser coverage exists. Story
  reporting/staff moderation and multi-instance realtime delivery remain incomplete;
  PostgreSQL migration 029 still needs a live disposable-database run. Labeled seed posts
  and the demo radar are limited to local development/guest preview; authenticated feeds
  contain account data only, and production bundles omit the demo radar.
- Connected authenticated Home sessions receive a data-free SSE signal for new public
  posts. Home shows a refresh prompt; it does not replace the current feed until the
  user chooses to refresh. Delivery is process-local and currently excludes
  friends-only/private posts and multi-instance delivery.
- A two-account Playwright test covers public post delivery, private-post isolation,
  and comment/reaction persistence after reload. The UI remains explicitly partial.
- Feed interaction reads use an authenticated batch endpoint (up to 30 posts per call),
  a weighted budget of 120 post IDs per account per minute, and at most 20 comments per
  post in a batch. This bounds per-account work in the single API process; it is not a
  shared limiter for multi-instance hosting.
- PostgreSQL public-feed queries now filter `published` rows in SQL to use the partial
  feed index; owner profile and moderation queries still retain their required scopes.
- Friend discovery is opt-in; requests and accepted connections are stored by the API.
- One-to-one text chat is limited to accepted friends. Messages persist through JSON or
  PostgreSQL repositories; connected clients receive updates over SSE.
- Published catalog Beats support persisted comments/reactions and in-app notifications. Home-post comments/reactions and friend request/acceptance notifications are persisted with recipient-scoped read state, cursor pagination, private-actor masking, post-persistence SSE signals, and polling fallback. PostgreSQL commits each action and notification together; local JSON recovers pending notification writes through a journal. OS/email push remains future work.
- Story reporting/staff moderation, automatic feed replacement, chat attachments/groups,
  operating-system push, and multi-instance shared rate limits/realtime service remain
  incomplete or deferred.
- Feed reads are rate-limited per client IP within one API process, use canonical UUID
  validation and cap each page scan. Interaction batch reads use canonical unique UUIDs
  and weighted per-account limits. Shared limits and load testing remain necessary for
  multi-instance/public deployment.

### Catalog and Marketplace — Partial

- Local unification: Marketplace is now the sole discovery navigation entry, with
  Explore, My library and My purchases. Legacy Beats/Library links resolve inside it;
  editing and seller tools live in My uploads. Public details load the published
  catalog by ID. See [local Marketplace scope](MARKETPLACE_LOCAL.md).
- MP3/WAV purchases snapshot the original and offer/license terms, retain sources,
  verify integrity and expose buyer-only full-length downloads by purchased format.
  Stems offers and legacy orders without snapshots fail closed. Local tests do not
  establish live payments or a hosted PostgreSQL deployment.

- Marketplace discovery returns published Beats and One-shots with bounded query,
  creator/tag/type filters, cursor pagination, and public preview access. Private
  originals and seller drafts are not exposed in public catalog responses.
- Sellers can save private Beat offer drafts with description, genre, optional BPM/key,
  explicit-content flag, USD reference offers, deliverables, collaborators, separate
  master/composition shares, sample declarations, and a versioned rights declaration.
- Sellers can attach private PDF/JPEG/PNG evidence. Community Managers can recommend or
  request changes; a different admin account can make a reasoned final intake decision
  only after a current positive recommendation. Sellers can see both decisions and when
  they became stale after edits.
- Approval is an intake decision only. It does not itself publish an offer or authorize
  a sale. Evidence is seller-provided and is not legal or forensic rights clearance.
- Admin can persist category-scoped promotional rules. They are not yet a complete,
  production pricing/discount engine.

### Mercado Pago marketplace slice — Local/test only

- Checkout Pro Split 1:1 with seller OAuth/PKCE, encrypted tokens, scoped refresh and
  durable preference idempotency.
- New orders freeze an explicit USD-to-MXN quote, platform fee and seller net; no
  default rate or fee is assumed. The checkout stays disabled until configuration,
  HTTPS callback and webhook URLs are present.
- HMAC webhook verification is followed by an authenticated payment lookup and checks
  for seller, application, mode, order, amount and currency before entitlement changes.
- Admin refund requests use a stable idempotency key and remain `refund_pending` until
  reconciled. Disputed or duplicate approved payments block downloads.
- Only Mercado Pago is active for new purchases. Stripe records remain historical data;
  production credentials and live payouts are disabled.
- See `docs/MERCADOPAGO_LOCAL_TESTING.md` for setup and the outstanding provider tests.

### Persistence, security, and operations — Partial

- JSON and PostgreSQL repository implementations exist. Database migrations 001-028 are
  present, including marketplace records, orders/refunds, and durable authentication
  sessions. The normal local app currently uses JSON unless configured otherwise.
- Beat uploads keep the square JPG/PNG master and generate a 640 px WebP derivative
  for catalog/studio/review cards when it reduces transfer size. Both files count
  against account quota; the master remains available for a future beat-detail view.
  Artwork is rejected if FFmpeg cannot decode it; valid images without a smaller
  derivative use the original. Audio and artwork uploads require CSRF, allow at most
  two concurrent upload jobs per account per API process, and check quota before
  expensive processing as well as at persistence. Existing artwork can be migrated
  with the dry-run-first `npm run artwork:backfill` command.
- Sessions persist hashed token/CSRF state and support revocation. Mutating routes use
  CSRF checks; API authorization is role- and ownership-checked; CORS is explicit;
  webhook signatures, bounded bodies, parameterized SQL, private media access, and
  regression security probes are implemented.
- Oracle single-VM Docker Compose/Caddy scaffolding, deployment and backup scripts,
  disposable PostgreSQL QA, and backup/restore rehearsal tooling exist.
- These controls are not a security certification or proof of production readiness.
  See `docs/SECURITY_AUDIT.md`, `docs/BUGS.md`, `docs/POSTGRES_QA.md`, and
  `docs/DEPLOY_ORACLE_VPS.md` for detailed evidence and limits.

### Diagnostics and verification — Implemented with limits

- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, Playwright route and
  workflow tests, security probes, diagnostic scripts, and GitHub workflow automation
  are available.
- On 2026-10-18, the full Vitest suite passed 316 tests across 63 files with two
  workers. The isolated Playwright workflow uploaded real WAVs and exercised CM
  approval, rejection with an owner-visible note, and independent admin approval;
  two-account Home publishing/privacy/interactions and public-post live refresh passed;
  the profile and mobile route suites also passed. Lint, typecheck, and production build
  passed. PostgreSQL integration/backup-restore QA passed in an earlier rehearsal;
  this is not a penetration test, OS-isolated media scan, or live Stripe validation.

## Known Gaps and Launch Blockers

1. **Local storage concurrency:** JSON read/modify/write is not safe for concurrent
   multi-user production writes. Use PostgreSQL for any hosted pilot and validate the
  complete migration/integration path through migration 028.
2. **Email:** no production email provider is configured for verification or account
   recovery. Development recovery tokens must never be exposed in a public deployment.
3. **Production admin provisioning:** establish a secure, documented first-admin
   provisioning and recovery procedure before hosting user accounts.
4. **Hosted PostgreSQL recovery:** local clean 001-029, upgrade 028 to 029 and restore
   passed. Rehearse the target hosted configuration and recovery of database plus media
   from a private off-device backup before deployment.
5. **Media validation:** header/MIME/signature checks do not prove full media validity.
   Run isolated decoding/transcoding and fail closed before public delivery; add malware
   scanning and robust parsing for seller evidence before operational use.
6. **Rate limits and scale:** rate-limit buckets are process-local. Keep the pilot to one
   API instance or move limits to shared storage before horizontal scaling.
7. **Commerce governance:** obtain legal review for seller/buyer terms and license
   templates; decide supported jurisdictions, tax/invoicing, final fees, settlement,
   refund policy, dispute process, and the Connect negative-balance exposure. Exercise
   test purchases, refunds, failed reversals, and disputes end to end before any live
   mode decision.
8. **Storage plans:** provisional package capacities are not measured production
   guarantees. Decide accounting for artwork/video, quotas, upgrades/downgrades, and
   retention before selling storage plans.

## Ordered Next Steps

### P0 — Keep local work reliable

- `npm run local:qa-accounts` now provisions separate creator, Community Manager and
  admin identities and checks their review/panel access boundaries. A disposable
  browser test now verifies real audio previews, private access, CM approve/reject,
  creator-only rejection notes, admin approval, audit events, and public delivery.
  Persistent local accounts were not modified during that test; exercising those
  accounts remains an explicit local QA operation.
- Run the full automated suite after each integrated milestone. Fix regressions before
  adding more modules; inspect desktop and mobile routes when UI changes.
- Keep this roadmap authoritative and synchronize status claims in
  `RELEASE_SCOPE.md`, `BUGS.md`, `SUBSCRIPTIONS_DISCOVERY.md`, `POSTGRES_QA.md`,
  and `src/app/modules.ts` when implementation changes. Older snapshots are labeled
  historical in `docs/README.md`.

### P1 — Make the private pilot operable

- Validate the full PostgreSQL 001-028 schema, data isolation, concurrent writes,
  account/session behavior, upload lifecycle, moderation, seller review, and order
  records against a disposable database.
- Add transactional email, secure production admin provisioning, safe migration/update
  procedures, and an off-host backup/restore drill for the Oracle pilot.
- Validate upload decoding, preview processing, and seller-document handling with
  fail-closed behavior and appropriate isolation.
- Keep pilot access private. Do not migrate local JSON data or real user media to the
  VPS without an explicit migration/backup plan.

### P2 — Approve marketplace commerce before enabling it

- Review license templates, seller/buyer policies, rights declarations, and takedown
  terms with qualified counsel.
- Decide final licensing products/prices, Mercado Pago fees, tax handling,
  settlement currency/timing, jurisdiction coverage, refunds, and dispute operations.
- Complete Mercado Pago sandbox two-account purchases, webhook retries, protected
  delivery, full/partial refunds, seller-balance failures and dispute scenarios;
  reconcile the admin ledger against Mercado Pago. Keep live mode disabled.
- Only after those gates should paid downloads and a public seller offer workflow move
  out of draft/test mode.

### P3 — Expand only after the core pilot proves useful

- Complete translations across all application routes.
- Consider friend/private live Home events, story reports/moderation, creator
  collaboration invitations, chat attachments/groups, push notifications, and richer moderation.
- Revisit Shorts, analytics, and AI only with validated creator needs and clear data,
  consent, cost, and operational plans.
- Revisit music distribution only as a separate B2B/provider-backed product after
  demand validation. It is deferred; no DSP integration is part of the current scope.

## Explicitly Deferred

- Music distribution to Spotify/Apple Music/other DSPs.
- Recurring Creator/Studio subscriptions and real plan billing.
- Individual One-shot checkout, final discount application, final tax calculation, and
  production seller payouts.
- Story reporting/staff moderation, story view receipts, shared multi-instance realtime
  delivery, video hosting for Shorts, AI services, and analytics.
- Multi-instance scaling and public launch.

## Working Rules for Future Contributors

- Read this file and the relevant focused reference before changing a subsystem.
- Preserve existing user changes; do not infer production readiness from a passing local
  test or from the presence of a UI route.
- Keep payment secrets server-side, use only test credentials in local workflows, and never
  commit `.env` files or credentials.
- Never enable a purchase, license, plan entitlement, or creator badge solely from a
  client-side success state; use authenticated, verified, idempotent server events.
- Keep deferred capabilities out of the critical path unless the product owner changes
  scope explicitly.
