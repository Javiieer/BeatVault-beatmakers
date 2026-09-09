# BeatVault Development Phases

This document is the execution map for BeatVault. Complete and validate one phase before starting the next. Do not pull future infrastructure into an earlier phase without a documented decision.

## Phase 3.5/4.4: Library API-first catalog read

**Status:** Complete

Library reads the local API catalog through the existing timeout-enabled client, validates and deduplicates remote/local metadata, and falls back silently to localStorage while preserving demo assets and session previews.

Authenticated catalog metadata mutations (`POST`/`PUT`/`DELETE`) are now included. Binary files remain session-local.

## Phase 3.7: Library catalog metadata mutations

**Status:** Complete

Library exposes accessible edit and archive actions only for catalog assets. Metadata uses `CatalogRepository` API-first; localStorage is used only for network/timeout fallback, while authorization, conflict, validation, and other API errors remain visible. Session previews are revoked when their catalog asset is removed.

## Phase 0: Discovery and Blueprint

**Status:** Complete

### Completed

- Product vision and scope boundaries.
- Initial MVP definition.
- Technical risks and architecture candidates.
- Storage/provider and admin panel discovery.
- Documentation baseline.

### Source documents

- `BEATVAULT_DISCOVERY_REPORT.md`
- `docs/ARCHITECTURE.md`
- `docs/ADMIN_PANEL_DISCOVERY.md`
- `docs/decisions/0001-storage-provider-abstraction.md`

## Phase 1: UI Foundation

**Status:** Complete

### Delivered

- React + TypeScript + Vite application.
- App shell, navigation, responsive layout, global player.
- Dashboard, Studio, Library, Beats, Beat Detail, Upload, Shorts, and placeholders.
- Mock data separated from presentation.
- Shared UI, audio, layout, and domain types.
- Dark-first BeatVault visual system.

## Phase 1.1: Visual Identity

**Status:** Complete

### Delivered

- Central CSS token system.
- Lucide icon system.
- Four selectable themes:
  - Classic
  - Ember Forge
  - Ivory Studio
  - Verdant Signal
- Theme persistence and safe fallback.
- Refined cards, panels, player, sidebar, slider, scrollbar, focus, hover, and motion states.

## Phase 1.2: Responsive and Stability

**Status:** Complete with ongoing manual QA

### Delivered

- Desktop sidebar preserved.
- Tablet/mobile drawer with overlay and Escape support.
- Responsive player and volume control.
- Mobile overflow fixes.
- Modular extraction from `App.tsx`.
- ESLint and Vitest setup.
- Local persistence protections.
- Routing utility and tests.
- Session-only preview map.
- Local upload validation and object URL cleanup.

### Current validation

- 35 tests passing.
- Typecheck passing.
- ESLint passing.
- Production build passing.
- Full automated Chrome matrix remains environment-dependent.

## Phase 1.3: QA and Foundation Hardening

**Status:** Complete

### Goal

Close the foundation before introducing server-backed behavior.

### Tasks

- Manual Chrome review of all four themes and target viewports.
- Test drawer, theme selector, player volume, and hash navigation in DOM/browser where available.
- Review contrast and keyboard focus.
- Review error, loading, empty, unavailable-preview, and storage-failure states.
- Remove remaining safe dead code and consolidate CSS carefully.
- Keep `PROGRESS.md` current.

### Exit criteria

- No known reproducible UI or responsive defects.
- No lint warnings.
- Tests, typecheck, and build passing.
- All local-only limitations visible and documented.

### Validation completed

- Playwright Chromium coverage for synthetic multi-file Upload queue, unsupported-file accessibility error, individual queue removal, all four themes, theme persistence after reload, Library navigation, and mobile overflow.
- Existing responsive overflow matrix covers Dashboard, Studio, Library, Beats, Shorts, and Upload at desktop, tablet, and mobile viewports.
- Synthetic files are used intentionally; browser audio decoding and real media playback remain outside this phase.

## Phase 2: Local Library Engine

**Status:** Complete

### Goal

Make the core producer workflow useful locally: import, organize, preview, and inspect assets.

### Scope

- File and folder selection research.
- Supported audio formats and size policies.
- Local reference versus copy decision.
- Real browser preview.
- Basic technical metadata.
- Session preview lifecycle.
- Missing/unavailable asset states.
- Local catalog management.

### Explicit exclusions

- MediaFire integration.
- OAuth.
- Cloud sync.
- Backend uploads.
- Audio AI and stem separation.
- Marketplace and payments.

### Exit criteria

- A producer can import and preview representative files reliably.
- File ownership and persistence behavior is explicit.
- Performance is measured against a representative library.

## Phase 2.1: Local Import Queue Performance and UX

**Status:** Complete within browser-local scope

### Delivered

- Multi-file queue with name, size, stage, validation errors, and individual removal.
- Duplicate filtering, ready-only publication, and per-asset failure reporting.
- Stage-based progress without unmeasurable percentages.
- Session preview cleanup on removal, replacement, publication failure, and unmount.

### Limitations

- Selected files exist only for the current browser session; reload cannot restore them.
- Duration, playback, and localStorage capacity remain browser-dependent.

### Exit criteria

- Queue, unit tests, E2E, typecheck, lint, and production build pass.

## Phase 2.2: Honest Local Availability

**Status:** Complete within browser-local scope

### Delivered

- Explicit local availability states for published assets.
- Memory-only preview mapping remains separate from catalog localStorage.
- Reloaded session previews are shown as missing, not durable.
- Preview controls are disabled when no session URL exists and explain the safe recovery path through Upload.
- Publication uses the current catalog reference for duplicate and multi-file handling.
- Metadata remains null/unavailable when browser media APIs do not provide it.

### Limitations

- Re-linking requires selecting the source file again in Upload; no File, Blob, object URL, IndexedDB, or backend is used.
- A browser reload cannot recover a local file automatically.

## Phase 3: Local API Prototype

**Status:** Complete

## Phase 3.1: Gradual project frontend integration

**Status:** Complete

### Delivered

- Typed API client with configurable origin, timeout, and envelope validation.
- API-first project load/create with localStorage fallback.
- API-first project update/delete with unavailable-API fallback and explicit remote errors.
- Source status exposed in the application shell.
- Dashboard and Studio integrated; Library remains local-only.
- Local-only edit/delete documented until server support exists.

**Status:** Complete as local prototype

### Goal

Replace selected browser-only orchestration with a small local Node.js/TypeScript API without deploying it publicly.

### Scope

- API contracts for projects and catalog metadata.
- Repository interfaces and local implementation.
- Request validation and structured errors.
- Basic logs.
- Optional SQLite or file-backed persistence after evaluation.

### Delivered

- Native Node HTTP API with versioned `/api` routes, validation, structured errors, local CORS, request IDs, and graceful shutdown.
- File-backed repositories in ignored `data/server-local/`.
- Vitest coverage for validation and principal routes.

### Limitations

- No frontend connection, authentication, uploads, database, cloud, or durable catalog seed.

### Explicit exclusions

- Public authentication.
- Payments.
- Production cloud storage.
- External provider credentials.

## Phase 3.3: Local authentication and server-side ownership

**Status:** Complete as development-only prototype

- Configurable local demo account with scrypt password hash.
- HttpOnly opaque cookie sessions and auth endpoints.
- Project reads and mutations scoped to the authenticated account.
- Runtime account data and in-memory sessions are not production storage.

## Phase 3.4: Frontend authentication integration

**Status:** Complete as development-only prototype

- Login, logout, startup `/api/auth/me`, and credentialed cookies are integrated.
- A live API without a session shows Login; an unavailable API preserves demo local mode.
- Project creation does not send a client-selected `ownerId`; Library remains local-only.

## Phase 4: VPS Platform Core

**Status:** Planned

### Phase 4.1: Local API security hardening
**Status:** Complete as local-only hardening; not production-ready

Rate limiting, explicit CSRF, secure-cookie configuration, expiring sessions, typed roles, minimal audit events, and baseline headers are implemented. See `docs/PHASE_4_1_REPORT.md`.

### Phase 4.2: Portable server configuration
**Status:** Complete as local-only configuration; not production-ready

Typed environment parsing, validation, CORS allowlisting, centralized cookie/session/rate-limit/data-directory settings, and `.env.example` are implemented. See `docs/PHASE_4_2_REPORT.md`.

### Goal

Deploy the platform control plane to the VPS.

### Scope

- Node.js API.
- PostgreSQL.
- Account identity and server-side authorization.
- Projects, catalog metadata, plans, and entitlements.
- Admin API foundation.
- Backups, monitoring, environment separation, and secrets management.

### Exit criteria

- Secure deployment and rollback process.
- Database backups tested.
- Authorization and audit logging tested.
- No provider tokens exposed to browsers.

## Phase 5: Provider and Cloud Integrations

**Status:** Planned

### Goal

Allow BeatVault Cloud and external providers to back file references and previews.

### Scope

- Provider adapter interface.
- OAuth server-side.
- MediaFire proof of concept.
- Folder/file selection.
- Metadata indexing.
- Expiring preview access.
- Sync states and disconnect handling.
- Object storage for derived previews and waveforms.

### Exit criteria

- Provider credentials remain server-side.
- Revoked/moved files are represented correctly.
- Preview and download permissions are separate.
- Integration can be removed without corrupting catalog metadata.

## Phase 6: Plans, Subscriptions, and Admin Operations

**Status:** Planned

### Goal

Introduce controlled monetization and internal operations.

### Scope

- Plans and entitlements.
- Subscription control panel.
- Billing provider integration.
- Admin roles and permissions.
- Account review.
- Moderation.
- Promotion codes and discounts.
- Audit logs.

### Explicit exclusions until designed

- Trusting frontend admin IDs.
- Client-side promotion validation.
- Refunds without audit.
- Unscoped destructive actions.

## Phase 4.3: Local Plans and Admin UI
**Status:** Complete as mock-only UI

- Added local `Plans & Subscription` and `Admin Control Center` routes with separated mock data.
- No payment, billing, backend, real authorization, promotion redemption, or destructive operation is implemented.
- See `docs/PHASE_4_3_REPORT.md`.

## Phase 7: Community and Collaboration

**Status:** Future

### Scope candidates

- Creator profiles.
- Production-focused posts.
- Show Your Process.
- Reports and moderation.
- Collaboration roles and project access.
- Credits and version comments.

Do not copy generic social networks without validating a production-specific use case.

## Phase 8: Audio Intelligence and Stem Processing

**Status:** Future research

### Scope candidates

- Reliable technical analysis.
- Optional tagging assistance.
- Audio similarity.
- Stem separation workers.
- Local, CPU queue, GPU-on-demand, or external API evaluation.

The current VPS is not assumed to be a permanent GPU/audio worker.

## Phase 9: Marketplace and Release Center

**Status:** Future

### Scope candidates

- Digital products.
- License and entitlement model.
- Payments and payouts.
- Copyright/takedowns.
- Release validation and distribution.
- Analytics.

These modules require legal, financial, and operational design before implementation.

## Execution Rules

- Finish the current phase's exit criteria before moving forward.
- Prefer a small vertical slice over broad placeholder infrastructure.
- Keep local, server, and provider concerns behind interfaces.
- Do not add dependencies without a measured requirement.
- Update `PROGRESS.md` after meaningful changes.
- Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` before closing a coding block.
- Never commit secrets, provider tokens, or billing credentials.

## Phase 5 Product Catalog and Monetization

**Status:** Phase 5.3 complete; 5.4+ planned

The detailed plan is in `docs/PHASE_5_PRODUCT_CATALOG_PLAN.md`. The required order is catalog cleanup and Library taxonomy, then ownership/entitlements, then product/licensing rules, then sales planning, and only afterward payment or marketplace implementation.

An active subscription must not grant unrestricted access to all Beats, Sound Packs, or Sounds. Subscription features, product ownership, licenses, previews, and download permissions must remain separate concepts.

### Phase 5.1: Catalog Cleanup and Taxonomy

**Status:** Complete (2026-09-03)

- Removed example projects from the visible creator workspace while retaining demo assets as isolated development fixtures.
- Normalized typed `beat`, `sound-pack`, and `sound` classification and explicit non-entitlement availability labels.
- Represented FL Studio Demo Pack as a single Sound Pack with grouped contents and descriptive RAR metadata only.
- Added `#/library?section=beats|sound-packs|sounds` navigation without new top-level product routes.
- Added unit and browser coverage for taxonomy, bundle mapping, section navigation, and responsive overflow.

### Phase 5.2: Ownership and Entitlement Model

**Status:** Complete (2026-09-06)

- Added typed independent models for subscriptions, features, product ownership/entitlements, licenses, previews, downloads, quotas, and usage.
- Added pure conservative preview/download decisions with explicit reasons, expiration and quota checks.
- Added Vitest coverage for public previews, missing entitlements, active licenses, exhausted quota, expiration, cancellation, grace, and subscription non-escalation.
- Kept the local Library unblocked and added no payments, billing, protected downloads, or client-side authorization.

See `docs/PHASE_5_2_REPORT.md`.

### Phase 5.3: Product and License Catalog

**Status:** Complete (2026-09-06) as a local typed, testable model

- Added `src/domains/products/` for product kinds, versions, bundle contents, offers, draft license terms, preview/download policy, and purchase/license references without sensitive data.
- Added pure publication and availability decisions with explicit reasons. Commercial and exclusive offers require explicit terms; Sound Packs require descriptive archive metadata and contents declarations.
- Preview does not imply purchase, entitlement, or download. No checkout, payment, real download authorization, refund, payout, or admin action was added.

See `docs/PHASE_5_3_REPORT.md`.

### Phase 5.4: Commercial Discovery

**Status:** Complete as draft proposal (2026-09-06)

- Compared subscription-only, marketplace-only, and hybrid models.
- Defined draft contracts for entitlements, credits, included products, individual purchases, cancellation, refunds, licenses, and revenue split.
- No prices, billing, checkout, refunds, payouts, or protected downloads were implemented.

See `docs/PHASE_5_4_REPORT.md`.

## Phase 4.4: PostgreSQL Persistence Contract

**Status:** Prepared; JSON remains active (2026-09-06)

- Added a shared server repository contract and an injected SQL PostgreSQL adapter.
- Added explicit `BEATVAULT_STORAGE_BACKEND=json|postgres`, defaulting to JSON.

- Phase 4.4 runtime wiring now creates the selected repository centrally, uses `pg` only for PostgreSQL mode, exposes `/api/ready`, and keeps JSON as the rollback backend.
- No driver, connection, automatic frontend switch, destructive migration, or secret was added.

See `docs/PHASE_4_4_REPORT.md`.
