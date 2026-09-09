# BeatVault

BeatVault is a dark-first frontend foundation for a future music-production ecosystem.

## Development

```bash
npm install
npm run dev
```

The current alpha uses local mock data and bundled demo assets. It includes local upload drafts, objective file metadata, library filters, local audio preview playback, and a browser-local Shorts flow. Capture/Termux transport is not implemented. Local development authentication is available only through the Phase 3 API; it is not production authentication.

### Local API prototype

Library attempts `GET /api/catalog` first and falls back to validated browser-local metadata on API, timeout, or validation errors. Catalog mutations and uploads remain local-only. See `docs/PHASE_3_5_REPORT.md`.

Phase 3.1 adds gradual project integration with the isolated Node API on `http://localhost:4174`:

```bash
npm run server
# in another terminal
npm run dev
```

It exposes public `/api/health` and `/api/catalog`, local session auth at `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and owned project CRUD. Copy `.env.example` for documented local configuration; production values must be supplied by the environment, never committed. JSON remains the default. For local PostgreSQL run `docker compose up -d postgres`, use the migration mounted by Compose, set `BEATVAULT_STORAGE_BACKEND=postgres` and `DATABASE_URL`, then verify `/api/ready`. Roll back by setting the backend to `json`; JSON files are not modified by PostgreSQL mode. See `docs/PHASE_4_4_REPORT.md`.

## Audit Corrections

Shorts links to Beat Detail through encoded hash routes, Beat Detail uses the global player when a local preview exists, and Share uses the Web Share API with a clipboard fallback. Mobile navigation has a scrim and keyboard/outside-click close behavior. Local Shorts interaction keys are unified and migrated defensively; restored drafts require the original file to be selected again before review.

These are local frontend behaviors only. Files, likes, saves, follows, drafts, and catalog records remain browser-scoped and may be unavailable when storage is blocked or cleared.

## Structure

- `src/app`: application shell and lightweight hash navigation
- `src/components`: reusable UI and audio primitives
- `src/data`: mock projects, assets, and statistics
- `src/styles`: centralized tokens and responsive styles
- `src/types`: domain contracts
- `docs`: product and technical decisions
- `docs/PROGRESS.md`: consolidated alpha progress and next steps

Plans (`#/plans`, alias `#/subscription`) and Admin Control Center (`#/admin`) are local mock-only screens. They contain no payments, billing, real admin authorization, promotions, or backend mutations; entitlements and admin permissions must be enforced server-side in a future VPS phase.
