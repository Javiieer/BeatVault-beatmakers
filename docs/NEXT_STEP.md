# Next step

## Current milestone

Home now replaces the old dashboard at /home, with /dashboard retained as an alias.
Its local feed combines demo statuses, photos, beat cards and Shorts links; likes,
saves and follows persist per local account. Own audio appears only after publication.
The demo creator posts are explicitly labeled and are not connected to a social API.
Home also has a local composer for text, photos and videos; posts and media persist in
account-scoped IndexedDB on this browser only. It is not cross-device/social publishing.

Creator profiles and metadata editing are implemented at /profile and /settings.
Profiles default to private; public links exclude private drafts and authentication
data. Own Home posts appear on the profile in this browser. Amigos supports opted-in
creator discovery and friend-request lifecycle through the local API, but the Home
composer does not publish cross-device. Chat and social notifications remain out of
scope. Custom image uploads remain deferred. PostgreSQL requires migrations 005-007
for current profile/friend/review schemas; actual database integration remains pending.

The authenticated creator loop now persists owned audio and covers across reloads,
supports downloads, isolates catalog/project/draft storage by account and recovers
from lost responses without duplicate records when the same file is reselected.
Desktop/mobile tests use two accounts and disposable JSON storage. Originals remain
private. Real Postgres migration/integration QA is still pending (apply migrations 001-007).
Legacy browser keys, project records and endpoints remain untouched.

Read docs/README.md, RELEASE_SCOPE.md, DIAGNOSTICS.md, BUGS.md and
SECURITY_FINDINGS.md before further work.

## Current milestone

Admin review now supports explicit approve/reject decisions through a CSRF-protected,
admin-only API. Rejections include a short note visible only to the creator and are
recorded in the audit log. Beats now queries only approved published Beat entries;
private projects are not presented as discoverable marketplace inventory.

## Single next implementation

Validate migrations 001-007 against a real PostgreSQL instance, then implement a
separate processed preview artifact with owner-safe access. Confirm concurrent review
behavior, audit persistence, preview playback and rejected-note visibility across two
accounts. Keep Oracle deployment deferred until the team agrees on ownership, domain
and hosting setup.

Acceptance criteria:

- Creator cannot change a catalog entry to published/rejected through generic APIs.
- Only admins can review pending entries; duplicate/stale decisions return conflict.
- Rejected content remains private and its review note is visible to its owner.
- Beats lists only approved published Beat entries, never private projects or drafts.
- No payments, chat, distribution or AI in this milestone.
The existing working tree includes changes made before this session. Preserve them.
