# Error Log

## ERR-20260828-001 — Shorts viewer over-expanded

Status: Fixed

Area: UI

Observed:
The selected Short occupied almost the full desktop viewport and disrupted surrounding layout.

Expected:
The feed should reserve a narrow 9:16 stage, similar to a TikTok desktop composition.

Resolution:
Moved Shorts to a dedicated contained feed with fixed responsive bounds, scroll-snap slides, and a centered clip card.

## ERR-20260828-002 — Storage hidden on narrow sidebar

Status: Fixed

Area: UI / Responsive

Observed:
On narrow screens, the sidebar navigation pushed the Storage block below the visible area and the fixed player reduced usable space.

Resolution:
Kept the mobile sidebar scrollable, restored its bottom section, and added bottom clearance for the player.

Use this file for reproducible errors.

## Entry template

### ERR-YYYYMMDD-001 — Short title

Status: Open / Fixed / Deferred

Area: UI / Data / Audio / Build / Architecture

Observed:

Expected:

Steps to reproduce:

Resolution:

## Current entries

No active blocking errors recorded.

## Phase 10 notes

No implementation errors recorded. The new contracts are compile-time boundaries only and have no runtime adapter or automated integration coverage yet.

## Resolved in Phase 7

- Shorts no longer retains replaced or cancelled preview object URLs, and restored filenames cannot satisfy current-session media validation for review.
- External local draft events no longer overwrite unsaved Shorts editor fields; save feedback remains visible when a local draft event is received.

## Resolved in Phase 8

- Studio now recovers from empty search/status results with a clear action instead of presenting a blank project area.
- Project cards make the ownership boundary explicit: mock references are read-only and browser-local projects are editable.

## Resolved in Phase 9

- The global player now exposes local preview loading and does not offer playback or seeking controls while media is loading.
- Library favorite persistence failures now remain visible as session-only changes instead of silently implying durable storage.
- The sidebar project status no longer reports saved changes after a failed local project write.
- Dashboard announcement autoplay now stops when reduced motion is requested.

## Resolved in Phase 6

- Restored upload metadata is intentionally not treated as a selected `File`; the file must be selected again after reload before review.
- Empty and oversized selected files are rejected locally, and a failed local catalog write remains visible instead of being reported as published.

## Known limits

- The Library editor changes caption and tags only. The selected video remains a filename reference because the File/Blob is never persisted.
- Same-tab updates use a browser event and cross-tab updates use the native storage event; this is not cloud or server synchronization.
- Automated browser coverage is still absent, so the complete Library to Upload to Shorts lifecycle needs manual verification.
- Responsive validation in this phase is static CSS/JSX auditing plus build checks. Exact overflow, safe-area inset behavior, font metrics, and browser-specific viewport rendering still require manual browser/device inspection and are not visually verified here.
- The existing announcement slider has explicit desktop, tablet, and mobile bounds, but autoplay timing and artwork/text composition across real viewport sizes remain outside automated validation.
- Phase 3 keeps storage feature-specific rather than adding a generic persistence layer, so browser-disabled storage, corrupt values, quota exhaustion, and same-tab event behavior retain their existing per-feature semantics. These boundaries still need manual browser verification.
- Phase 4 Beat Detail states, stable hash navigation, local preview playback, and keyboard/screen-reader affordances were validated statically plus by build checks; real browser/device visual and assistive-technology verification remains pending. Missing local audio is an intentional alpha state, not a media-loading fallback.
- Phase 5 sorting is session-local and curated order follows the local source array because the alpha has no persisted recency metadata. Automated browser coverage is still absent, so combined sorting, favorites, collection/type, and publication-state controls need manual verification.
- Phase 6 file-size validation uses a 500 MB client-side limit, accepts browser MIME values that may be empty for some file types, and does not inspect or process file contents. Automated browser coverage is still absent, so storage-disabled, reload, and real-file selection behavior need manual verification.
- Phase 7 still has no automated browser coverage; storage-disabled behavior, real file selection, and visual modal cleanup require manual browser verification. Selected Shorts media remains session-only and is never persisted.
- Phase 8 has no automated browser coverage for combined project search/status filters, localStorage failure feedback, or responsive card rendering; these remain manual browser checks. Filters are intentionally session-local and do not persist.
- Phase 9 has no automated browser coverage for blocked localStorage, audio loading/error events, live reduced-motion preference changes, or screen-reader announcements; these remain manual browser checks. Existing synchronous local boundaries are intentional.
