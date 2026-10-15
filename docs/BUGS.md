# Known issues

Current record: 2026-10-14. Older claims that BeatVault has no backend,
authentication, ESLint or automated tests are obsolete.

## Confirmed release blockers

- JSON storage has no transactional read/modify/write protection for concurrent
  mutations. Multi-user production use is blocked until addressed.
- There is no configured production email provider, so password recovery and
  verification messages cannot reach users.
- Production admin provisioning and real Postgres migration/restore behavior are
  not yet established. The Oracle Compose profile is a private-pilot scaffold only.

## Implemented corrections in this milestone

- Catalog entries retain owned audio and stable cover IDs. File name, format and size come from server records after reload; duration is not decoded server-side.
- Owner playback/download survives reload, including after clearing browser caches.
- Retrying the same owned file reuses its audio/catalog record after a lost response. Reselecting the file after reload is still required.
- Catalog/project caches and upload drafts use account/demo namespaces. Legacy unscoped browser data is preserved but not silently assigned to an account.
- Authenticated API failures do not expose cached lists or simulate successful local writes.
- Fixed the browser fetch receiver that silently forced demo mode; a same-origin development proxy keeps cookies and CSRF on the frontend host.
- Studio is now Mis subidas; new content is restricted to Beats and One-shots.
- Catalog success is awaited, duplicate submissions are blocked and partially failed queues can be retried in the same session.
- Home posts now appear in the owner's Publications tab from the same account-scoped IndexedDB store; no cross-device or public post delivery is implied.
- Friends discovery exposes only opted-in public profile fields; request actions are session/CSRF protected and distinguish pending requests from accepted connections.
- Friends now has an explicit API-offline state and retry action instead of presenting a misleading empty directory.
- Marketplace includes private seller offer drafts, evidence upload, separate Community Manager/admin decisions, seller-visible current/stale review state, and a test-mode one-time Stripe checkout/order/refund slice. This is not live commerce or legal rights clearance.
- Authentication sessions persist hashed tokens/CSRF values, expiry, and revocation in JSON/PostgreSQL repositories; password changes revoke other sessions. Rate limits remain process-local.
- Removing the selected file selects the next available file correctly.
- Temporary blob URLs are never written to the persistent catalog and stale legacy blob URLs are stripped on read.
- Upload actions remain visible and usable on mobile.
- Upload MIME values are normalized through an audio-only allowlist; the declared
  format must match its container signature, and unknown MIME values are rejected.

- Public catalog no longer returns other creators' private drafts/review entries.
- Generic catalog writes cannot assign published/rejected moderation states.
- JSON bodies are limited to 64 KiB, including requests without Content-Length.
- Rejected origins are not echoed as permitted CORS origins.
- Suffix and oversized media ranges now return valid byte bounds.
- Private media responses receive defensive headers and consistent CORS handling.
- API command entry detection accepts Windows filesystem paths.
- Audio and artwork uploads require CSRF, cap concurrent upload work at two jobs per
  account per API process, and check storage quota before costly processing. Artwork
  is retained only after successful FFmpeg decoding; decode failures reject the upload.

Security regression assertions are in server/security-probes.test.ts.
See SECURITY_FINDINGS.md for severity and unresolved security work.

## Remaining limitations

- Creator profiles support bundled cover/avatar presets, not custom image uploads.
- Public profiles display published project metadata; public audio previews and cross-device Home posts are not implemented. Catalog moderation is implemented.
- The profile editor warns before page unload and explicit cancellation; in-app navigation can still discard unsaved changes.
- Profile JSON writes are serialized within one repository instance only; this does not resolve global or multi-process JSON concurrency.
- Password recovery has no email delivery provider yet. Local development can expose the one-time link only when `BEATVAULT_DEV_AUTH_TOKENS=true`; never enable this on a public deployment.

- Disposable PostgreSQL 16 QA has verified the earlier core schema and workflows, including social/chat authorization, moderation, quota concurrency, admin package overrides, audit persistence, restart recovery and FFmpeg previews. Migration 023 adds persistent catalog artwork and a clean PostgreSQL QA run through it plus an existing-volume upgrade and production VPS restore drill remain to be rerun.
- Storage usage accounts for original audio and Beat artwork; processed previews remain separately reported and outside the upload quota. Video uploads and package downgrade behavior are intentionally unsupported/undecided.
- Session records are durable, but rate-limit buckets are process-local and therefore not shared across API instances. Oracle Caddy proxy IP forwarding is configured for the single-VM profile; do not trust forwarded client-IP headers on a directly reachable API. Email verification/reset has no delivery provider.
- Admin reads and publication review actions are protected by server-side role/CSRF checks and passed disposable-PostgreSQL integration; the running local app still uses JSON.
- Audio header checks are not full media decoding; malformed files with valid headers
  still need isolated media validation before public delivery.
- Home includes explicitly labeled demo posts alongside locally published catalog content; it is not cross-device Home publishing or a complete marketplace.
- Desktop/mobile browser tests cover two accounts and the authenticated JSON-backed upload/reload/retry/playback workflow; real media conversion has passed with an external FFmpeg executable.
- Browser storage can be unavailable or cleared; draft metadata is not an audio backup.
- Shorts remains a local prototype. Selected video files cannot be restored after reload.
- Home composer media remains local to the browser. Direct chat is limited to text between accepted friends; attachments, groups, OS push notifications and block/report workflow remain unimplemented. Home-post comments/reactions and friend requests/acceptances now persist their notifications atomically in PostgreSQL and recoverably in local JSON. Notifications are in-app and have no email or OS push delivery; a lost reaction response can still be toggled off by a client retry.
- Stripe Connect onboarding, one-time Beat checkout, buyer-scoped paid download, refund requests and dispute flags exist in test mode only. No live payments/payouts, recurring billing, final license service, cloud sync or music distribution exists.
