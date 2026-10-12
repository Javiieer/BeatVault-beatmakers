# BeatVault site audit

## Snapshot: 2026-10-11

PostgreSQL 16 checks passed in a separate disposable container: migrations 001-013,
two-account HTTP friend authorization and CSRF, message/read-state persistence across
API restart, SSE reconnect and event delivery, valid WAV fixture upload and ranged preview playback,
preview access isolation and recovery across API restart, fail-closed moderation when
the processed derivative is unavailable, real FFmpeg AAC/M4A encoding/public playback,
concurrent review with
stale-decision conflict, persistent review audit events, and rejected-content privacy
against a normal creator account. Multi-instance event delivery was not tested. The
existing local `beatvault-postgres` container and its volume were not used or modified;
the temporary QA container and its anonymous volume were removed afterward. These
checks are now repeatable with `npm run test:postgres` and `docs/POSTGRES_QA.md`.

Storage and package verification passed with migrations 011-013: account usage survives API
restart, admin-assigned quotas override the global test fallback, concurrent uploads
near the account limit admit only one, deleting the accepted asset releases its bytes,
and usage remains isolated by owner. Commercial package caps remain unset; Admin can
assign manual test limits and the creator view identifies the source of its effective
limit.

Full local diagnostic completed with `npm run diagnose:full`.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed |
| Unit/integration tests | 166 passed, 8 skipped across 33 files |
| HTTP security probes | Passed |
| Production build | Passed |
| npm dependency audit | 0 known advisories |
| Playwright browser suite | 88 passed |

The route inventory contains 21 paths. Each was opened at desktop (1440 px), tablet
(768 px) and mobile (390 px); tests checked that the application surface rendered,
there was no horizontal overflow, and no uncaught page error. The additional browser
journeys cover mobile navigation, profile menus, settings/theme persistence, upload
validation and queue actions, account-isolated upload/reload/playback/download,
two-account friend chat with unread/live updates, and social feed/notification views.

The first sweep's Admin route used the offline fallback, so it did not verify the
authenticated moderation screen. A supplemental audit then passed three focused
checks: all 10 Home story/feed/rail images decoded to nonzero dimensions, and
separate creator/admin accounts submitted and approved a pending catalog item via
the disposable API on desktop and mobile. The persistent upload journey was also
re-run after preview retry was added: 2 browser tests passed, including desktop/mobile
retry UI and fail-closed behavior without FFmpeg. Four additional browser tests for
settings and mobile notification/feed views passed; the notification trigger now shows
only its icon and unread badge on mobile while keeping an accessible name. Those
captures are
`artifacts/site-audit/home-mobile-media-loaded.png`,
`artifacts/site-audit/desktop-admin-review.png`, and
`artifacts/site-audit/mobile-admin-review.png`.

## Module inventory

| Section | Route | Current state | Product decision |
| --- | --- | --- | --- |
| Home | `/home` | Partial | Keep; cross-device posts remain future work |
| Amigos | `/friends` | Partial | Keep; collaboration invitations are future work |
| Mensajes | `/chat` | Partial | Keep; text-only one-to-one chat works for accepted friends |
| Mis subidas | `/studio` | Partial | Keep; creator audio workflow is the core release path |
| Library | `/library` | Partial | Keep; owned items persist, real discovery needs catalog content |
| Beats | `/beats` | Partial | Keep; public listing is limited to approved Beats |
| Upload | `/upload` | Partial | Keep; media validation and production storage still need work |
| Beat Detail | `/beat-detail` | Partial | Keep; real catalog IDs and access rules remain incomplete |
| Admin | `/admin` | Partial | Keep; moderation works; broader PostgreSQL workflows need coverage |
| Shorts | `/shorts` | Prototype | Defer |
| Plans | `/plans` | Prototype | Defer until billing and entitlements exist |
| Community | `/community` | Placeholder | Defer |
| Store | `/store` | Placeholder | Merge into a future Marketplace flow |
| Marketplace | `/marketplace` | Placeholder | Defer until licensing and checkout are defined |
| AI Lab | `/ai` | Placeholder | Defer until a validated creator workflow exists |
| Releases | `/releases` | Placeholder | Defer |
| Analytics | `/analytics` | Placeholder | Defer until consent-aware events exist |
| Mi perfil | `/profile` | Partial | Keep; custom image uploads and public audio previews remain open |
| Ajustes | `/settings` | Partial | Keep; email verification and production email are open |
| Recuperar contraseña | `/forgot-password` | Partial | Keep; transactional email delivery is open |
| Cambiar contraseña olvidada | `/password-reset` | Partial | Keep; transactional email delivery is open |

## Release blockers and limits

- PostgreSQL migrations, chat authorization/persistence, SSE reconnect, upload/preview
  access, restart recovery, review concurrency, audit persistence, and rejected-content
  privacy have passed on a disposable instance. Multi-instance SSE remains outstanding.
- JSON storage is not a multi-process transaction system; do not use it for a
  multi-user hosted deployment.
- Sessions and rate limits are process-local. Multi-instance hosting needs shared
  session/rate-limit state and a deliberate trusted-proxy policy.
- Password reset and email verification have no transactional email provider.
- Uploaded-file signatures are not full media decoding. Public preview derivatives use
  an external FFmpeg installation; encoded-publication QA remains pending on hosts
  without FFmpeg. Owners can retry processing from Mis subidas; the endpoint is
  ownership-, CSRF- and rate-limit-protected. Retry UI passed desktop/mobile browser
  checks and retry authorization passed disposable-PostgreSQL integration checks.
- Browser tests use temporary local data and synthetic fixtures. They are regression
  checks, not a penetration test, production load test, or security certification.
- Payment, licensing, payout, public cross-device Home publishing, push notifications,
  chat attachments, groups, and block/report workflows are not implemented.

## Evidence

The full machine-readable report and per-check logs are generated at
`artifacts/diagnostics/latest.json` and `artifacts/diagnostics/latest.md` and are
ignored by Git. Browser screenshots and failure traces are under `artifacts/`.
The initial full sweep passed 88 browser tests; the three supplemental audit checks
also passed against the actual disposable API. The next full sweep will include them
in its browser count. Re-run
`npm run diagnose:full` to refresh the machine report; this document is a dated
summary and must be updated when the product inventory or test coverage changes.

## Next implementation

Use the repeatable PostgreSQL harness on future backend changes. Next, validate more
source codecs and malformed audio cases; defer multi-instance SSE until shared event
delivery is selected.
