# BeatVault

BeatVault is a creator audio-platform prototype with a React frontend and a local Node API.

For the Oracle VPS deployment scaffold, prerequisites, first boot, backups and current
go-live blockers, see [Oracle VPS deployment](docs/DEPLOY_ORACLE_VPS.md). The existing
`docker-compose.yml` is for local PostgreSQL development only.

Start with [the current handoff](docs/README.md) and [first-release scope](docs/RELEASE_SCOPE.md).
The current navigation is Home, Amigos, Mis subidas, Library, Beats and Upload.
The first-release priority remains the reliable creator audio workflow; Home and
Amigos support discovery/community with browser-local and local-API boundaries.

Mis subidas replaces Studio project management. New submissions are limited to Beats
and One-shots, with tags, bundled cover choices, draft recovery and archive/restore.
Existing project records are preserved. Authenticated uploads retain their audio,
cover and file metadata after reload, with owner-only playback/download. Offline
demo audio still uses temporary previews; it is not a persistent file backup.

The account menu opens Mi perfil and Editar perfil. Creator metadata is stored on
the server, with optional public visibility, local-only post mirror, project grid/list
and cover/avatar presets. Amigos searches opted-in profiles and stores requests in the
local API. Public profile responses do not expose email, permissions or private drafts.
Custom image uploads are not implemented. PostgreSQL profile storage requires
migrations 005 and 006 after 001-004; the local JSON backend needs no migration.

## Automated diagnosis

Run `npm run diagnose:full` for code checks, tests, isolated local security probes,
dependency advisories and browser coverage of all sections. Reports are saved to
`artifacts/diagnostics/latest.md` and `latest.json`. For the security suite alone,
run `npm run test:security`. See [DIAGNOSTICS.md](docs/DIAGNOSTICS.md).

## Development

```bash
npm install
npm run dev
```

The current alpha uses local mock data and bundled demo assets. It includes local upload drafts, objective file metadata, library filters, local audio preview playback, and a browser-local Shorts flow. Capture/Termux transport is not implemented. Local development authentication is available only through the Phase 3 API; it is not production authentication.

### Local API prototype

Library reads `GET /api/catalog`. Authenticated failures do not expose cached lists
or simulate successful local writes. Catalog/project caches and upload drafts are
namespaced by account, separately from demo data. Unscoped legacy browser keys are
preserved but not auto-assigned to a user. Uploaded audio and stable cover IDs persist
on the server. Retrying after reload requires reselecting the file and reuses the
existing owned audio/catalog record. See `docs/BUGS.md` for remaining limits.

Local email/password registration creates unverified creator accounts; no email is sent yet. Passwords are hashed. Google and WhatsApp integrations remain deferred. Development admin bootstrap is described below.

Password recovery uses expiring, one-time hashed tokens and clears sessions when a
password is changed. For local development only, set `BEATVAULT_DEV_AUTH_TOKENS=true`
to return a recovery link to the app. Do not enable this for any public deployment;
production recovery needs a configured transactional email provider.

Phase 4.5 adds an explicit development-only admin bootstrap. Set `BEATVAULT_ADMIN_EMAIL`, `BEATVAULT_ADMIN_PASSWORD`, and `BEATVAULT_ADMIN_BOOTSTRAP_TOKEN` (at least 32 characters) in the process environment, then run `npm run admin:bootstrap`. It is blocked in production, never accepts admin data from registration, and never prints secrets. See `docs/PHASE_4_5_REPORT.md`.

Phase 4.6 introduced protected admin reads; the current admin panel also reviews pending catalog items with server-side role/CSRF checks, creator-visible rejection notes and audit events. Phase 4.7 persists redacted audit events in JSON or PostgreSQL. Apply all SQL migrations 001-007 before using the PostgreSQL review workflow.

The Node API listens on `http://127.0.0.1:4174`. Vite proxies same-origin `/api`
requests there so sessions and CSRF cookies work on the frontend host:

```bash
npm run server
# in another terminal
npm run dev
```

For the current preview use `npm run dev -- --host 127.0.0.1 --port 5188`.
For other frontend origins set `BEATVAULT_CORS_ORIGINS` explicitly in the API
process environment. `BEATVAULT_API_PROXY` overrides Vite's API target. Production
requires equivalent reverse-proxy routing. Apply all SQL migrations 001-007 for
Postgres; existing databases do not acquire new migrations just by restarting Compose.

It exposes public `/api/health` and `/api/catalog`, local session auth at `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and owned project CRUD. Copy `.env.example` for documented local configuration; production values must be supplied by the environment, never committed. JSON remains the default. For local PostgreSQL run `docker compose up -d postgres`, use the migration mounted by Compose, set `BEATVAULT_STORAGE_BACKEND=postgres` and `DATABASE_URL`, then verify `/api/ready`. Roll back by setting the backend to `json`; JSON files are not modified by PostgreSQL mode. See `docs/PHASE_4_4_REPORT.md`.

## Audit Corrections

Shorts links to Beat Detail through encoded hash routes, Beat Detail uses the global player when a local preview exists, and Share uses the Web Share API with a clipboard fallback. Mobile navigation has a scrim and keyboard/outside-click close behavior. Local Shorts interaction keys are unified and migrated defensively; restored drafts require the original file to be selected again before review.

Shorts likes, saves, follows and drafts remain browser-local prototypes. Authenticated
creator audio/catalog records are server-backed; local upload drafts are not file backups.

## Structure

- `src/app`: application shell and lightweight hash navigation
- `src/components`: reusable UI and audio primitives
- `src/data`: mock projects, assets, and statistics
- `src/styles`: centralized tokens and responsive styles
- `src/types`: domain contracts
- `docs`: product and technical decisions
- `docs/PROGRESS.md`: consolidated alpha progress and next steps

Plans (`#/plans`, alias `#/subscription`) remains a pricing prototype without payments.
Admin (`#/admin`) provides a pending-review queue for authenticated admins, and Beats
lists only published Beat catalog entries. Approved audio originals remain private to
their owners; a dedicated preview derivative is still needed for cross-account playback.
Deferred routes are absent from the main menu.
La autenticación local incluye verificación y recuperación sin proveedor de email. Para pruebas de desarrollo puede habilitarse explícitamente `BEATVAULT_DEV_AUTH_TOKENS=true`; nunca se devuelve un token en producción.

## Local Uploads and Backups

Private user uploads live outside `public/` and outside Git. `BEATVAULT_UPLOAD_DIR`
defaults to ignored `data/uploads`; deployment should use a private external storage
directory. Demo fixtures under `assets/demo/` remain versioned for the interface and tests.

Back up database and uploads separately:

```powershell
docker exec beatvault-postgres pg_dump -U beatvault -d beatvault -Fc > backups\beatvault.dump
robocopy "data\uploads" "D:\Backups\BeatVault\uploads" /E
```

Never place passwords, API keys, OAuth secrets, or bootstrap tokens in `.env.example` or GitHub.

### Persistent local uploads

The first persistent upload flow accepts exactly one multipart file at `POST /api/assets/upload`. It requires an authenticated session and CSRF token, stores binary data under `BEATVAULT_UPLOAD_DIR` (default `data/uploads`), and persists only metadata plus a SHA-256 content hash. Limits are 500 MiB/file, 510 MiB/request, one file and eight fields. Preview supports `HEAD` and byte ranges; download and delete enforce ownership. See `docs/PHASE_UPLOADS_REPORT.md`.
