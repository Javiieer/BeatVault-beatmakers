# Next step

> Historical milestone snapshot. Its single-next-implementation and no-payments
> statements predate marketplace review and Stripe test-mode checkout. For current
> status and priorities, use `docs/ROADMAP.md`.

## Current milestone

Home replaces the old dashboard at /home, with /dashboard retained as an alias. Signed-in
posts and media use the API, support public/friends/private audiences, and synchronize
with the creator's profile. Comments, reactions, follows and bookmarks persist server-side.
Labeled seed posts are available only in local development guest preview; authenticated
feeds and production builds exclude them. A recent-stories rail displays published
posts from the last 24 hours; it is not yet an independent story lifecycle. Authenticated
interaction reads are batched and bounded. A two-account browser test covers public
delivery, private isolation, and interaction persistence.

Creator profiles and metadata editing are implemented at /profile and /settings.
Profiles default to private; public links exclude private drafts and authentication
data. Own Home posts appear on the profile in this browser. Amigos supports opted-in
creator discovery and friend requests through the local API. The direct chat at /chat
supports persistent one-to-one text messages between accepted friends, unread/read
state, and live updates over SSE. Chat attachments, groups, and multi-instance event
delivery are deferred. PostgreSQL
migrations 001-013 and live PostgreSQL checks have passed on a disposable PostgreSQL
16 instance: two-account friend authorization, CSRF enforcement, message/read-state
persistence across API restart, SSE reconnect/event delivery, WAV upload and ranged
preview playback/privacy, preview recovery across API restart, concurrent review
conflict handling, durable audit events, rejected-content privacy, plus real AAC/M4A
conversion and public playback while keeping originals private. The repeatable
`npm run test:postgres` harness is documented in `docs/POSTGRES_QA.md`; it requires an
explicit local disposable database.

The authenticated creator loop now persists owned audio and covers across reloads,
supports downloads, isolates catalog/project/draft storage by account and recovers
from lost responses without duplicate records when the same file is reselected.
Desktop/mobile tests use two accounts and disposable JSON storage. Originals remain
private. The media unit matrix generates WAV, MP3, FLAC, AAC, M4A, OGG and WEBM,
checks MIME/signatures, converts each to AAC/M4A, and rejects malformed media. The
disposable PostgreSQL harness uploads all seven through authenticated multipart,
checks MIME/signatures, original-byte privacy, M4A preview publication and forged
signature rejection when FFmpeg is available. It also verifies malformed WAVs cannot
pass moderation without a processed preview and that per-file and aggregate request
limits return `413`, including chunked requests without `Content-Length`. The aggregate
byte counter is enforced while streaming, not only from the declared header.
Account preferences now offer dark, light and custom RGB colors for background,
cards, buttons and links. A route audit captures all menu destinations in all three
modes on desktop and mobile. Legacy browser keys, project records and endpoints remain
untouched.

Read docs/README.md, RELEASE_SCOPE.md, DIAGNOSTICS.md, BUGS.md and
SECURITY_FINDINGS.md before further work.

## Current milestone

Admin review now supports explicit approve/reject decisions through a CSRF-protected,
admin-only API. Rejections include a short note visible only to the creator and are
recorded in the audit log. Beats now queries only approved published Beat entries;
private projects are not presented as discoverable marketplace inventory.

## Single next implementation

The authenticated PostgreSQL harness, including all seven audio formats and declared
and chunked upload-limit probes, passed against disposable PostgreSQL 16. Unit
conversion tests pass for WAV, MP3, FLAC, AAC, M4A, OGG and WEBM with FFmpeg 8.1; the
browser audit covers every route and extreme custom palettes. The owner can retry a
missing preview from Mis subidas; the endpoint enforces ownership, CSRF and rate
limits. Originals remain private, and moderation fails closed without a valid
derivative. Per-account original-audio usage is now measured in JSON and PostgreSQL;
Mis subidas shows the measured usage. An optional server quota is enforced atomically
with asset creation, concurrent uploads cannot overrun it, and deletion frees usage.
`GET /api/account/storage` reports usage and effective capacity. Admin can assign
manual per-account test quotas and Free/Creator/Studio packages; package assignment is
audited and defaults to Free. Effective limits use account test override, configured
package capacity, then optional global technical fallback. Package capacities have no
defaults; set `BEATVAULT_PLAN_FREE_STORAGE_BYTES`, `BEATVAULT_PLAN_CREATOR_STORAGE_BYTES`,
or `BEATVAULT_PLAN_STUDIO_STORAGE_BYTES` only after the team chooses values. The local
packages page displays account state and actual original-audio usage, without pricing
or payment. Next, define actual package capacities and remaining features with the
team before exposing commercial upgrades or billing.
The Admin panel separates original and preview metadata bytes/counts and reports the
registered total; this is not a physical disk scan. User quota still counts available
originals only. Keep Oracle deployment deferred until the team agrees on ownership,
domain and hosting setup.

Acceptance criteria:

- Creator cannot change a catalog entry to published/rejected through generic APIs.
- Only admins can review pending entries; duplicate/stale decisions return conflict.
- Rejected content remains private and its review note is visible to its owner.
- Beats lists only approved published Beat entries, never private projects or drafts.
- Chat history is visible only to accepted friends; sending requires CSRF and messages
  survive server restart with JSON or PostgreSQL storage.
- Live chat events reach connected participants without exposing session credentials.
- Storage usage is owner-scoped; quota enforcement is atomic across concurrent uploads.
- Existing uploads are counted when migration 011 is applied; deleting an upload releases its bytes.
- No payments, music distribution or AI in this milestone.
- Manual test quota changes require an admin session and CSRF; upload rejection remains atomic with asset creation.
The existing working tree includes changes made before this session. Preserve them.
