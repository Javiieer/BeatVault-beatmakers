# Architecture

## Project API integration (Phase 3.1)

`src/api/client.ts` owns HTTP, timeout, credentials/CSRF policy, and runtime `ApiResult` validation. `src/data/projectRepository.ts` and `src/data/catalogRepository.ts` own API-first reads/adapters and controlled localStorage fallback. Catalog metadata mutations are exposed by Library through the repository; binary previews remain browser-local.

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

## Phase 3 local API

`server/` is an isolated Node.js HTTP prototype. It reuses core project and catalog types, persists metadata and hashed local accounts as JSON under ignored `data/server-local/`, and keeps opaque sessions in memory. Project ownership is derived from the HttpOnly session cookie. The frontend remains on its local fallback boundary and this is not a Phase 4 VPS security boundary.

Phase 4.1 adds explicit CSRF, configurable cookie attributes, in-memory limits/audit, typed roles, and baseline headers. These controls reset with the process and must be replaced before VPS deployment.
Phase 4.2 centralizes validated environment configuration, CORS origin allowlisting, cookie/session policy, rate limits, demo settings, and the runtime data directory. It remains a local prototype and does not add a database.
