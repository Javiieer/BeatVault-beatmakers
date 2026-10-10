# Architecture

## Current boundary (2026-10-09)

### Creator profiles (2026-10-09)

`GET/PUT /api/profile` use the authenticated account identity. Writes pass the global
CSRF check and an explicit metadata allowlist; email, role, ownership and verification
fields cannot be assigned. `GET /api/profiles/:id` exposes only opted-in public profile
metadata, or the requesting owner's private profile. Missing/private targets return 404.
The DTO never includes email or authorization data. Public profile project views filter
to published content; existing catalog authorization remains the server boundary.

JSON profiles live separately in profiles.json with serialized writes within a single
repository instance. PostgreSQL uses creator_profiles from migration 005 (apply after
001-004). SQL adapter tests are mocked, not live database integration. Profile cover
presets are bundled images; avatar choices are presets or initials, not user uploads.

### Home posts and friends (2026-10-09)

Home text/photo/video posts live in account-scoped IndexedDB on one browser and are
read by the owner's Publications tab on their profile. They are not server posts,
public profile content, or cross-device sync. Friends uses authenticated local API
routes (`GET /api/creators`, `GET /api/friends`, `POST/DELETE /api/friend-requests`,
`POST /api/friend-requests/:id/accept`, and `DELETE /api/friends/:id`). Creator search
and friend lists return an allowlisted profile DTO without email or credentials.
Search is limited to opted-in public profiles. Mutations require the existing session
and CSRF checks. Friend rows persist in `friendships.json`; Postgres uses migration
006. These are local foundations, not a hosted social service; notifications, chat,
block/report tools, and public post delivery do not exist.

Password recovery reuses `/api/auth/password-reset/request` and
`/api/auth/password-reset/confirm`. Reset tokens are random, hashed before storage,
expire after 30 minutes and are cleared on use. Responses to requests are generic.
`BEATVAULT_DEV_AUTH_TOKENS=true` may return a development-only recovery token when
`NODE_ENV` is not production; never enable it on a public host. No transactional
email provider is configured yet, so deployed recovery requires email delivery.


The runtime includes React/Vite, a Node HTTP API, session auth, JSON/Postgres
adapters, private audio uploads and an admin review queue. Review mutations require
an authenticated admin session and CSRF token, transition only pending entries, and
record decisions in the audit log. Rejection notes are returned only to the owning
creator and admins; public catalog responses exclude rejected entries. Beats lists
only published Beat records. Original audio downloads remain owner-only. Migration
007 adds the bounded review note field. Historical sections
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

Original files may remain in a connected external provider. BeatVault should index searchable metadata without copying originals by default, create controlled temporary preview URLs or proxy streams with expiry, and persist durable file references separately from derived previews. This direction is architectural only: no backend, OAuth, provider integration, or cloud sync is implemented in the local frontend.

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
