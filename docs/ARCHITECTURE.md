# Architecture

## Current boundary (2026-10-09)

### Creator profiles (2026-10-09)

`GET/PUT /api/profile` use the authenticated account identity. Writes pass the global
CSRF check and an explicit metadata allowlist; email, role, ownership and verification
fields cannot be assigned. `GET /api/profiles/:id` exposes only opted-in public profile
metadata, or the requesting owner's private profile. Missing/private targets return 404.
The DTO never includes email or authorization data. Public profile project views filter
to published content; existing catalog authorization remains the server boundary.

JSON records use per-file serialized read-modify-write operations within the server
process and atomic file replacement. This prevents lost updates between concurrent
requests in one process, but is not a multi-process or production database guarantee.
PostgreSQL uses creator_profiles from migration 005 (apply after 001-004). SQL adapter
tests are mocked, not live database integration. Custom avatar and cover images are
uploaded through owner-scoped storage and served as thumbnails. Private profile
metadata and images are visible to the owner or to everyone only when the profile is
public; accepted friends can read eligible friend posts but currently cannot open
that private profile or its custom images. This is a known privacy/UX inconsistency
for a future access-matrix change.

### Home posts and friends (2026-10-18)

Authenticated Home and CreatorProfile use server-backed text/photo/video posts through
JSON and PostgreSQL repositories (migration 025); comments and reactions use migration
026, and follows/bookmarks use migration 028. Posts publish immediately. Public posts
require an opted-in public profile, friends-only posts require an accepted friendship,
and private posts are owner-only; media access is rechecked on each request. Existing
IndexedDB posts remain device-local and are not automatically imported. Stories are
independent records in `social_stories` (migration 029), not feed posts: status/photo/
video stories have an exact 24-hour server expiry, owner deletion, public/friends/private
audiences, a limit of 20 active stories per account, and a shared 512 MiB social-media
quota with posts. Photos are normalized and limited to 20 MB; MP4/H.264 story videos
are limited to 100 MB, 30 seconds and 1920x1080. Authenticated story and media reads
recheck audience visibility; media is private/no-store. A periodic cleanup removes
expired records and media, and connected Home sessions receive a data-free SSE signal
to refresh stories. Story reporting/staff moderation and multi-instance event delivery
are not implemented. Labeled seed examples exist only in the local development guest
preview; authenticated feeds and production bundles exclude them. Shorts remains a
separate demo/local flow. Friends uses authenticated API routes (`GET /api/creators`,
`GET /api/friends`, `POST/DELETE /api/friend-requests`,
`POST /api/friend-requests/:id/accept`, and `DELETE /api/friends/:id`). Creator search
and friend lists return an allowlisted profile DTO without email or credentials.
Search is limited to opted-in public profiles. Mutations require the existing session
and CSRF checks. Friend rows persist in `friendships.json`; Postgres uses migration
006. Feed/profile posts synchronize through the server, with persisted account-scoped
follows/bookmarks. Public feed reads filter to `published` in the PostgreSQL query so
the partial feed index can be used; owner profile and moderation reads retain their
needed visibility scope. Feed scans and IP limits remain process-local. Interaction
snapshots load in authenticated batches of up to 30 posts; work is charged by post ID
(120 per account per minute) and returns at most 20 comments per post. Authenticated
`GET /api/feed/events` streams a generic event for new public posts; no post content is
sent, and Home refetches through the visibility-checked API only after user action.
Delivery is process-local; friends/private events, shared multi-instance rate limits
and an existing-volume migration rehearsal remain open. Two-account browser and clean
disposable PostgreSQL backup/restore checks cover public/private posts and relationships.

### Direct chat (2026-10-10)

`/chat` provides one-to-one text conversations between accepted friends. The API
rechecks the relationship for inbox, history, read-state, and send operations;
mutations use the session CSRF token, messages are limited to 2,000 characters, and
history reads return at most 100 messages. JSON messages are serialized in
`messages.json`; PostgreSQL uses migration 008. Server-sent events notify connected
clients of new messages, read state and online/offline presence, with at most three
streams per account. Presence is visible only to accepted friends and remains online
while at least one stream for the account is connected.
Events are process-local, so a multi-instance deployment needs a shared pub/sub
adapter. No attachments, group chats, blocking, reporting, or end-to-end encryption
are implemented. Apply migrations 001-028 and validate an existing-volume upgrade and
production deployment before hosting.

### Social activity and notifications (2026-10-15)

Published catalog Beats and One-shots expose authenticated comments and reactions.
Catalog activity is stored separately from the current reaction state so removing a
reaction does not erase its notification event. Home-post comments/reactions and friend
request/acceptance events now also create durable notification records. PostgreSQL
writes each domain action and notification in one data-modifying statement using
migration 027. The local JSON adapter uses a recoverable write-ahead notification
journal across its separate action and notification files. The center combines these
records with legacy catalog activity, unread chat messages and local catalog
review-state changes. Persistent notifications support recipient-scoped read state,
cursor pagination, and a sanitized actor identity for private profiles. The existing
process-local SSE stream sends post-persistence refresh signals; polling remains the
cross-process fallback. SSE is volatile; the database row or local journal is the
durable record. Notifications are in-app only, with no email or operating-system push.

### Marketplace discovery (2026-10-12)

`GET /api/marketplace` is a public, read-only projection over approved Beat and
One-shot catalog entries. It supports bounded query, creator, tag, type and cursor
filters. Search uses public creator display names only; private profiles resolve to a
generic creator label. Response projection removes original asset IDs and audio
metadata, and delegates playable media to the existing published-preview route.
Moderation remains exclusively in the admin catalog workflow. This endpoint does not
create offers, orders, entitlements or payment records.

Marketplace seller links open a public creator-store view (`#/store?id=...`) backed by
the same filtered marketplace endpoint. It lists only public offers and uses a generic
seller label when the seller's social profile is private; it does not expose that
profile's posts, avatar, cover, or private metadata.

### Themes and route QA (2026-10-11)

Account preferences in localStorage support only `dark`, `light` and `custom`. Custom
RGB-picker colors are allowlisted hex values for page background, cards, buttons and
links; invalid values fall back independently, derived text colors adapt to background
brightness, and preferences remain isolated by account. Legacy theme names map to
dark/light on read. Playwright captures all module routes in all three modes at mobile
and desktop sizes; this is a visual regression check, not exhaustive manual review.

### Audio source validation (2026-10-11)

Upload source MIME is canonicalized and checked against file signatures before the
original is stored. Tests generate WAV, MP3, FLAC, AAC, M4A, OGG and WEBM fixtures,
verify signatures and transcode each to a bounded AAC/M4A preview. Invalid WAV input
receives no derivative. The authenticated multipart and PostgreSQL request matrix
remains WAV-only; this unit matrix does not establish production limits for large or
adversarial files.

Password recovery reuses `/api/auth/password-reset/request` and
`/api/auth/password-reset/confirm`. Reset tokens are random, hashed before storage,
expire after 30 minutes and are cleared on use. Responses to requests are generic.
`BEATVAULT_DEV_AUTH_TOKENS=true` may return a development-only recovery token when
`NODE_ENV` is not production; never enable it on a public host. No transactional
email provider is configured yet, so deployed recovery requires email delivery.


The runtime includes React/Vite, a Node HTTP API, session auth, JSON/Postgres
adapters, private audio uploads and separate Community Manager/admin review queues.
Either role may approve or reject another creator's pending Beat; each mutation
requires CSRF, checks the processed preview before approval, and records the decision
in the audit log. Both queues expose only a private processed preview, never the
original download. Rejection notes are returned to the owning creator; public catalog
responses exclude rejected entries. Beats lists only published Beat records. Original
audio downloads remain owner-only. Migration 007 adds the bounded review note field;
008 adds direct messages; 009 adds catalog comments, reactions and activity. Historical sections
below describe earlier phases; "future backend" wording is not the current status.
See README.md in this directory for the authoritative handoff.

`src/app/modules.ts` is the shared module inventory for navigation, browser coverage
and diagnostics. `scripts/diagnose.ts` coordinates checks and writes timestamped
reports under ignored `artifacts/diagnostics`. Security probes start the API only
on a disposable loopback listener with temporary JSON data.

JSON request bodies have a 64 KiB limit. Private catalog entries are visible only
to their owner or an admin; public reads expose published entries. Generic catalog
mutations cannot assign moderation-only states. Media reads remain owner-only,
support validated byte ranges and return private cache/security headers.

Catalog records persist assetId and a stable coverId. Owner responses derive file
metadata from asset records. Other viewers receive neither original asset references
nor storage keys. Repeated owned uploads and catalog creates reuse the existing
file/record. Edits cannot replace the original. Postgres requires migration 004
after 001-003; real database integration remains unverified.

Catalog/project caches and drafts use account/demo namespaces. Authenticated errors
never fall back to cached lists or pretend writes succeeded. Legacy unscoped browser
data remains untouched and is not auto-assigned. The default API URL is same-origin;
Vite proxies /api to 127.0.0.1:4174 (override with BEATVAULT_API_PROXY). Production
needs an equivalent reverse proxy. VITE_API_BASE_URL overrides require compatible
cookie/CSRF deployment.

Postgres QA, JSON concurrency, stronger media validation and production sessions
remain release blockers. Passing diagnostics does not remove them.

## Project API integration (Phase 3.1)

`src/api/client.ts` owns HTTP, timeout, credentials/CSRF policy, and runtime `ApiResult` validation. It also sends upload `FormData` without forcing a JSON content type. `src/data/projectRepository.ts` and `src/data/catalogRepository.ts` own API-first reads/adapters and controlled localStorage fallback. Persistent binary uploads are owned by `server/uploads.ts`; the frontend keeps local drafts separate and reports remote failure instead of simulating success.

The server selects `LocalRepository` or `PostgresRepository` centrally in `server/repository.ts` using `BEATVAULT_STORAGE_BACKEND` (JSON by default). PostgreSQL uses a bounded `pg.Pool`, parameterized queries, and stores only account/project/catalog metadata. `GET /api/health` remains process health; `GET /api/ready` checks the selected database backend.

BeatVault is a creator platform, not a personal music-file organizer. The current frontend is a Vite React TypeScript application with mock data isolated from components, shared UI primitives kept free of business rules, and hash navigation during the foundation phase.

## Domain map

- `core`: identifiers, configuration, contracts, errors, and shared foundations only.
- `content`: platform-owned content records and intentional upload concepts.
- `catalog`: searchable BeatVault content catalog.
- `tags`: creator- or administrator-defined metadata and validation rules.
- `preview`: derived audio, waveform, thumbnail, and technical preview concepts.
- `creators`: producer identity and profiles.
- `projects`: creator production context.
- `beats`: beat-specific product and preview rules.
- `shorts`: future short-form music and creator discovery.
- `streaming`: future listening and track discovery.
- `marketplace`: future products, licensing, checkout, and payouts.
- `community`, `collaboration`, `releases`, `analytics`, and `ai`: future independent domains.

The future service seams are typed in `src/domains/core/contracts.ts`: `AuthService`, catalog/project repositories, `MediaStorage`, and the shared `ApiResult` envelope. These contracts are adapters' boundaries, not active backend functionality.

These domains must remain independently evolvable. Future relationships should use stable IDs and contracts rather than placing all rules in `core`.

## Ownership and uploads

BeatVault manages its own catalog. Local files are only accessed when a user intentionally selects content to upload, publish, share, collaborate on, or turn into a product. The application must not scan, reorganize, copy, or synchronize the user's personal filesystem.

## Processing boundary

Technical processing may validate files and generate previews, waveforms, thumbnails, and technical metadata. Subjective metadata such as genre, mood, style, character, usage, and creator tags must be explicitly supplied or approved; future AI may suggest values but may not silently author them.

## Local catalog persistence

The current Library catalog adapter persists catalog metadata in browser `localStorage` under `beatvault:local-catalog`. Reads validate entries and safely return an empty catalog when storage is unavailable, malformed, or throws; writes report failure without throwing.

Library edit/archive controls are deliberately derived from catalog membership, so demo assets from `src/data/mock.ts` remain read-only. A successful removal updates the in-memory catalog and removes/revokes only the matching session preview; favorites are stored independently and are not rewritten.

`File` and `Blob` values are not persistent across browser sessions, so the local catalog stores metadata and references such as URLs only. A future storage design should separate the catalog provider, the file reference, and the preview representation. This separation is intentionally not implemented yet.

## Future cloud boundary

BeatVault Cloud will own authentication, metadata/index records, permissions, and sync orchestration. External cloud providers will be integrations behind an adapter/provider boundary; domain code must not depend on Dropbox, Google Drive, S3, or another vendor SDK. Provider adapters will translate stable BeatVault file references and capabilities into provider operations.

OAuth must be handled server-side. Provider credentials and refresh tokens must never be exposed to the browser. The frontend will receive authenticated API results, file references, preview references, and explicit sync states such as `queued`, `syncing`, `synced`, `conflict`, and `error`.

Original files may remain in a connected external provider. BeatVault should index searchable metadata without copying originals by default, create controlled temporary preview URLs or proxy streams with expiry, and persist durable file references separately from derived previews. This direction is architectural only: external cloud-provider OAuth and sync are not implemented. The existing local API handles account, catalog, social, and marketplace persistence separately.

The initial typed boundary is defined in `src/domains/storage/types.ts`. It separates provider accounts, file references, derived previews, provider capabilities, and sync states so future VPS adapters can support MediaFire, BeatVault Cloud, or S3-compatible storage without coupling provider response shapes to Library components.

## Local file storage boundary

Private user uploads must use `BEATVAULT_UPLOAD_DIR`, outside `public/` and outside the repository. Demo fixtures under `assets/demo/` are intentionally versioned. Database backups and upload backups are separate operational artifacts and must never be committed.

## Phase 3 local API

`server/` is an isolated Node.js HTTP prototype. It reuses core project and catalog types, persists metadata and hashed local accounts as JSON under ignored `data/server-local/`, and keeps opaque sessions in memory. Project ownership is derived from the HttpOnly session cookie. The frontend remains on its local fallback boundary and this is not a Phase 4 VPS security boundary.

Phase 4.1 adds explicit CSRF, configurable cookie attributes, in-memory limits, typed roles, and baseline headers. Phase 4.7 persists the redacted audit log in `audit.json` or PostgreSQL. Rate limits and sessions still reset with the process.

Local registration stores only a scrypt password hash, normalized email, creator role, and explicit unverified/pending state. Public clients cannot assign roles or ownership. Google and WhatsApp are provider interfaces only; no credentials or integrations are active.
Phase 4.2 centralizes validated environment configuration, CORS origin allowlisting, cookie/session policy, rate limits, demo settings, and the runtime data directory. It remains a local prototype and does not add a database.
Phase 3.9 mantiene tokens de verificación/reset como hashes efímeros en el repositorio, con consumo único, expiración, rate limit y CSRF para cambio de contraseña. No hay delivery de email.

## Admin Control Center (Phase 4.6)

`server/admin.ts` contiene los tipos de lectura y la redacción de cuentas. Las rutas `/api/admin/*` requieren la sesión HttpOnly existente y comprueban el rol recuperado server-side; el navegador no puede elevar permisos enviando `role` o `adminId`. Accounts, projects, catalog y audit se leen desde el backend seleccionado. Audit usa una cola serializada, metadata allowlist-by-redaction y retención configurable (`BEATVAULT_AUDIT_MAX_ENTRIES`, `BEATVAULT_AUDIT_RETENTION_DAYS`).

Marketplace promotion rules are managed through admin-only, CSRF-protected routes and persist in local JSON or PostgreSQL (`015_marketplace_promotions.sql`). Rules support a global or product-category scope, 1-75% off, optional date bounds, and an enabled flag. They are configuration only: no catalog price, licensing, discount calculation, or checkout is wired to them yet.

USD is the marketplace base/listing currency. Account display currency (`USD`, `MXN`, `EUR`) is a local preference; `/api/currency-rates` serves a validated European Central Bank daily reference snapshot with a six-hour process cache, and MXN/EUR conversions are informational only. Do not use this reference rate as a payment settlement quote. Stripe Connect Express is selected for a test-only Mexican seller-onboarding slice: `/api/connect/*` creates Express accounts and Stripe-hosted onboarding links, while a raw-body signature-verified webhook persists `account.updated` capabilities and deduplicates event IDs. Both test secrets are required, live keys are rejected, and Stripe is disabled in production. This does not create buyer charges, marketplace transfers, subscription billing, tax calculation, seller withholding or payouts from BeatVault. The checkout ledger must distinguish discounted subtotal, applicable tax, provider cost, platform fee, and seller net.

Beat seller intake is private and separate from public catalog metadata. `GET /api/seller/beat-listings` and owner-scoped `PUT /api/seller/beat-listings/:contentId` save per-beat commercial-preparation drafts; the server checks session, CSRF, catalog ownership and beat type, validates composition/master shares independently, and fixes offer currency/status/version to USD/draft-only. PostgreSQL uses migration `016_marketplace_beat_listing_drafts`; local mode uses `beat-listing-drafts.json`. Rights evidence is a separate private record: PDF/JPEG/PNG, at most 10 MB each and three per listing, signature-checked, and stored under a non-public path. Only the owning seller or admin/community-manager review endpoints can retrieve it, with no-store, nosniff and forced attachment headers. Migration `018_marketplace_seller_evidence.sql` adds the Postgres table; local mode uses `seller-evidence.json`. Sample-proof readiness is derived from uploaded records, never the client checkbox. Evidence remains seller-provided and is not legal or forensic verification. The rights-intake confirmation records its server timestamp/version, but is explicitly not a buyer license or sale. Commercial approval does not activate an offer. A separate one-time Stripe Checkout and protected delivery path exists in test mode and stays gated on approval, current public catalog publication, an available source file, a connected seller with enabled payouts, and configured Stripe payments. Legal license terms, private master/stem bundles, entitlements, live payment and payout operations remain future work.

Community managers are a separate least-privilege role. Admins may assign an existing non-admin account to `community_manager` through the CSRF-protected account-role route; public registration cannot assign it, and the route cannot grant or alter administrator accounts. `/api/staff/marketplace-review` exposes private beat-intake drafts and private rights evidence only to admins and community managers. Either role can independently approve a complete commercial listing or request changes; Admin does not depend on a Community Manager decision and vice versa. The latest decision for each role is audited separately, and one current approval satisfies commercial review. Seller changes to the listing or evidence make the earlier review stale. Staff review does not publish catalog content, activate an offer, or grant access to `/api/admin/*`; Community Managers retain no payment, refund, pricing, payout, or account-administration capability. Sale eligibility remains gated on a complete listing, an independently published catalog Beat, an available source file, a connected seller with enabled payouts, and configured Stripe payments. Migration `017_community_manager_role.sql` extends the PostgreSQL role constraint. Evidence is seller-provided and is never treated as legal clearance.
