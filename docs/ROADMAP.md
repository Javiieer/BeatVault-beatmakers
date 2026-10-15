# BeatVault BeatMakers Roadmap

**Status date:** 2026-10-14
**Purpose:** Current product and engineering memory for contributors and AI assistants.
**Authority:** This document describes the current intended state. When older phase reports or docs disagree, verify against the current code and the focused references linked below; do not repeat historical claims as current facts.

## Product Direction

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
  dark/light/custom RGB theme settings.
- Authenticated audio upload, owned audio and cover references, account-scoped browser
  data, reload playback/download, metadata edits, archive/restore, and retry behavior.
  The original audio remains private; processed previews are served separately.
- Uploads are focused on Beats and One-shots. FFmpeg is an external dependency for
  processing previews; it is not bundled with the app.
- Beat upload moderation is open to either a Community Manager or an administrator:
  one approval publishes the Beat, so moderation does not bottleneck on the admin.
  CM reviews use a private processed preview; both roles' decisions are audited.
  Seller-listing review remains a separate CM recommendation followed by an admin
  decision because it controls commercial terms, not basic catalog publication.
- Admin catalog moderation, seller/admin storage views, configurable storage limits,
  local plan assignment, and audit history.

### Social foundation — Partial/local scope

- Home composer supports account-scoped browser-local posts and mirrors the owner's
  posts to their profile on that browser. It is not public or cross-device publishing.
- Friend discovery is opt-in; requests and accepted connections are stored by the API.
- One-to-one text chat is limited to accepted friends. Messages persist through JSON or
  PostgreSQL repositories; connected clients receive updates over SSE.
- Published catalog Beats support persisted comments/reactions and in-app notifications. Home-post comments/reactions and friend request/acceptance notifications are persisted with recipient-scoped read state, cursor pagination, private-actor masking, post-persistence SSE signals, and polling fallback. PostgreSQL commits each action and notification together; local JSON recovers pending notification writes through a journal. OS/email push remains future work.
- No chat attachments/groups, operating-system push, block/report workflow, public Home
  post distribution/moderation, or multi-instance realtime service.

### Catalog and Marketplace — Partial

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

### Stripe marketplace slice — Local/test only

- Stripe Connect Express onboarding for Mexican sellers, server-side test keys,
  signed/replay-safe account webhooks, and capability status tracking.
- One-time Stripe Checkout for an eligible approved Beat, buyer-specific order state,
  webhook-confirmed payment, and protected original download for the buyer.
- Admin order view, full refund request with idempotency and transfer reversal attempt,
  webhook-confirmed refund state, and dispute flagging. Dispute evidence remains manual
  in Stripe; BeatVault does not automatically resolve disputes.
- A provisional 5% platform commission plus configurable processing estimate exists for
  evaluation only. It is not a final price, guaranteed margin, or approved tax policy.
- Live Stripe keys and production payouts are not enabled. Do not test with real money.
- See `docs/STRIPE_CONNECT_TESTING.md` for setup, events, behavior, and remaining gates.

### Persistence, security, and operations — Partial

- JSON and PostgreSQL repository implementations exist. Database migrations 001-024 are
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
- On 2026-10-14, the full Vitest suite passed 250 tests across 51 files with two
  workers; targeted authenticated artwork upload passed in desktop and mobile
  Playwright runs. Lint, typecheck, production build, and `npm audit --audit-level=high`
  passed. PostgreSQL integration/backup-restore QA passed in an earlier rehearsal;
  this is not a penetration test, OS-isolated media scan, or live Stripe validation.

## Known Gaps and Launch Blockers

1. **Local storage concurrency:** JSON read/modify/write is not safe for concurrent
   multi-user production writes. Use PostgreSQL for any hosted pilot and validate the
  complete migration/integration path through migration 024.
2. **Email:** no production email provider is configured for verification or account
   recovery. Development recovery tokens must never be exposed in a public deployment.
3. **Production admin provisioning:** establish a secure, documented first-admin
   provisioning and recovery procedure before hosting user accounts.
4. **PostgreSQL migration and restore:** run the current disposable QA against a clean
  database with migrations 001-024, test upgrade procedures for an existing volume,
   and rehearse restoring database plus uploaded media from an off-host backup.
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

- Continue testing with separate creator and admin accounts; add a Community Manager
  account for the review workflow.
- Run the full automated suite after each integrated milestone. Fix regressions before
  adding more modules; inspect desktop and mobile routes when UI changes.
- Keep this roadmap authoritative and synchronize status claims in
  `RELEASE_SCOPE.md`, `BUGS.md`, `SUBSCRIPTIONS_DISCOVERY.md`, `POSTGRES_QA.md`,
  and `src/app/modules.ts` when implementation changes. Older snapshots are labeled
  historical in `docs/README.md`.

### P1 — Make the private pilot operable

- Validate the full PostgreSQL 001-024 schema, data isolation, concurrent writes,
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
- Decide final licensing products/prices, commission and Stripe fees, tax handling,
  settlement currency/timing, jurisdiction coverage, refunds, and dispute operations.
- Complete Stripe test-mode two-account purchases, webhook retries, protected delivery,
  full/partial refunds, failed transfer reversals, and dispute scenarios; reconcile the
  admin ledger against Stripe. Keep live mode disabled until reviewed and approved.
- Only after those gates should paid downloads and a public seller offer workflow move
  out of draft/test mode.

### P3 — Expand only after the core pilot proves useful

- Complete translations across all application routes.
- Consider custom profile artwork, public/cross-device Home posts, creator collaboration
  invitations, chat attachments/groups, push notifications, and richer moderation.
- Revisit Shorts, analytics, and AI only with validated creator needs and clear data,
  consent, cost, and operational plans.
- Revisit music distribution only as a separate B2B/provider-backed product after
  demand validation. It is deferred; no DSP integration is part of the current scope.

## Explicitly Deferred

- Music distribution to Spotify/Apple Music/other DSPs.
- Recurring Creator/Studio subscriptions and real plan billing.
- Individual One-shot checkout, final discount application, final tax calculation, and
  production seller payouts.
- Public cross-device social feed, video hosting for Shorts, AI services, and analytics.
- Multi-instance scaling and public launch.

## Working Rules for Future Contributors

- Read this file and the relevant focused reference before changing a subsystem.
- Preserve existing user changes; do not infer production readiness from a passing local
  test or from the presence of a UI route.
- Keep Stripe secrets server-side, use only test keys in local workflows, and never
  commit `.env` files or credentials.
- Never enable a purchase, license, plan entitlement, or creator badge solely from a
  client-side success state; use authenticated, verified, idempotent server events.
- Keep deferred capabilities out of the critical path unless the product owner changes
  scope explicitly.
