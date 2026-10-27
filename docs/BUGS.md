# Known issues

Current record: 2026-10-18. Older claims that BeatVault has no backend,
authentication, ESLint or automated tests are obsolete.

## Confirmed release blockers

- JSON updates and source-retention/order creation are serialized within a single
  Node process. Cross-process transactions are not provided; hosted multi-user use
  still requires PostgreSQL and live migration/concurrency verification.
- There is no configured production email provider, so password recovery and
  verification messages cannot reach users.
- Production admin provisioning and target hosted database recovery remain open.
  Native local PostgreSQL 16.15 migrations 001-030, integration concurrency and
  backup/restore passed on 2026-10-27; see POSTGRES_LOCAL.md and CONSOLIDATION_STAGES.md.
  The Oracle Compose profile is a private-pilot scaffold only.
- Social video metadata stripping was implemented after the original audit: MP4/H.264
  is recoded, output tags/side-data are validated, and an authenticated HTTP test checks
  the bytes served to another account. 31 focused tests, targeted lint/typecheck and
  independent code audit passed. See PRIORITIES.md.

## Implemented corrections in this milestone

- Audit finding A1 is resolved locally: migration 030 stores current commercial
  review independently of audit retention. Native PostgreSQL QA verifies approval
  after historical-event retention and API restart. See CONSOLIDATION_STAGES.md.

- Marketplace now consolidates discovery, personal saved audio and purchases. Legacy
  routes remain aliases; personal library contains no demo inventory or upload edits.
- Beat detail resolves published catalog IDs, including guest preview playback.
- Purchase delivery snapshots MP3/WAV formats, original SHA-256 and license terms;
  original deletion is blocked while referenced, and protected downloads revalidate
  buyer/payment/format/integrity. Stems and unverifiable legacy orders remain unavailable.
- Checkout events now match order/session/amount/currency and customer metadata before
  fulfillment; pending refunds and disputes remove download access. See MARKETPLACE_LOCAL.md
  for test scope and the remaining external integration requirements.

- Catalog entries retain owned audio and stable cover IDs. File name, format and size come from server records after reload; duration is not decoded server-side.
- Owner playback/download survives reload, including after clearing browser caches.
- Retrying the same owned file reuses its audio/catalog record after a lost response. Reselecting the file after reload is still required.
- Catalog/project caches and upload drafts use account/demo namespaces. Legacy unscoped browser data is preserved but not silently assigned to an account.
- Authenticated API failures do not expose cached lists or simulate successful local writes.
- Fixed the browser fetch receiver that silently forced demo mode; a same-origin development proxy keeps cookies and CSRF on the frontend host.
- Studio is now Mis subidas; new content is restricted to Beats and One-shots.
- Beat publication review is independently available to Community Managers and admins.
  Both queues use a private processed preview, approvals fail closed when it is missing,
  and disposable browser coverage verifies approval/rejection, note privacy and audit events.
- Catalog success is awaited, duplicate submissions are blocked and partially failed queues can be retried in the same session.
- Authenticated Home posts/media, comments, reactions, follows and bookmarks now use the API; profile publications read the same server records. A two-account browser test covers public delivery and private isolation. Unauthenticated demo content remains local and labeled.
- Signed-in Home sessions receive a generic SSE prompt for new public posts; refreshing is user-controlled and the event carries no post content.
- Friends discovery exposes only opted-in public profile fields; request actions are session/CSRF protected and distinguish pending requests from accepted connections.
- Friends now has an explicit API-offline state and retry action instead of presenting a misleading empty directory.
- Home stories are independent server-backed status/photo/video records with audience-
  checked reads, owner deletion, 24-hour expiry, generic SSE refresh signals and a shared
  social-media quota. Story reporting/staff review are still missing.
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

## Home Status Update: 2026-10-18

Authenticated Home media is now server-backed, and posts, comments, reactions, follows
and bookmarks persist through the API. The older bullet below that calls Home composer
media browser-local is superseded; local-only behavior applies to unauthenticated demo
content. Stories are now separate expiring records; see the limitations below for
missing story reports/moderation and the pending PostgreSQL migration rehearsal.
Interaction reads are batched for the feed, charged by post ID (120 IDs per account per
minute in one process), and return at most 20 comments per post. A two-account browser
test covers publishing, privacy, comments, reactions and the mobile composer layout.
The PostgreSQL public feed query now filters to published rows before scanning, allowing
the partial feed index to serve it; profile and moderation reads retain their wider scope.
Connected sessions now receive a generic event for new public posts and can refresh on
demand. The stream is process-local; friends-only/private changes and multi-instance
delivery do not signal other sessions.

## Remaining limitations

- Profile images accept custom avatar and cover uploads with a persisted responsive crop/focal point. Face detection is not provided; users can adjust framing in the editor.
- Public profiles display published project metadata and permitted Home posts. Home stories
  are independent expiring records, but story report submission/staff moderation and
  multi-instance realtime delivery remain unimplemented. Catalog moderation is implemented.
- The profile editor warns before page unload and explicit cancellation; in-app navigation can still discard unsaved changes.
- Profile JSON writes are serialized within one repository instance only; this does not resolve global or multi-process JSON concurrency.
- Password recovery has no email delivery provider yet. Local development can expose the one-time link only when `BEATVAULT_DEV_AUTH_TOKENS=true`; never enable this on a public deployment.

- Disposable PostgreSQL 16 QA has verified earlier core workflows, including social/chat authorization, moderation, quota concurrency, admin package overrides, audit persistence, restart recovery and FFmpeg previews. Migration 028 adds follows/bookmarks and migration 029 adds stories; run a clean-schema PostgreSQL QA including 029, an existing-volume upgrade and production VPS restore drill before hosting.
- Storage usage accounts for original audio and Beat artwork; processed previews remain separately reported and outside the upload quota. Video uploads and package downgrade behavior are intentionally unsupported/undecided.
- Session records are durable, but rate-limit buckets are process-local and therefore not shared across API instances. Oracle Caddy proxy IP forwarding is configured for the single-VM profile; do not trust forwarded client-IP headers on a directly reachable API. Email verification/reset has no delivery provider.
- Admin reads and publication review actions are protected by server-side role/CSRF checks and passed disposable-PostgreSQL integration; the running local app still uses JSON.
- Audio header checks are not full media decoding; malformed files with valid headers
  still need isolated media validation before public delivery.
- Labeled seed posts and radar content are limited to the local development guest preview; authenticated feeds and production bundles do not include them. Home is not a complete marketplace. Stories are separate and expire after 24 hours; report/moderation workflow and a live PostgreSQL 029 rehearsal remain required before public pilot.
- Desktop/mobile browser tests cover two accounts and the authenticated JSON-backed upload/reload/retry/playback workflow; real media conversion has passed with an external FFmpeg executable.
- Browser storage can be unavailable or cleared; draft metadata is not an audio backup.
- Shorts remains a local prototype. Selected video files cannot be restored after reload.
- Unauthenticated demo composer media remains local to the browser; authenticated Home photo/video posts persist through the API. Direct chat is limited to text between accepted friends; attachments, groups, OS push notifications and block/report workflow remain unimplemented. Home-post comments/reactions and friend requests/acceptances now persist their notifications atomically in PostgreSQL and recoverably in local JSON. Notifications are in-app and have no email or OS push delivery; a lost reaction response can still be toggled off by a client retry.
- Stripe Connect onboarding, one-time Beat checkout, buyer-scoped paid download, refund requests and dispute flags exist in test mode only. No live payments/payouts, recurring billing, final license service, cloud sync or music distribution exists.
