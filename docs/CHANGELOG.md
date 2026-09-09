# Changelog

## 2026-08-29 - Phase 10 Backend readiness contracts

### Changes

- Added transport-independent TypeScript contracts for API results, errors, pagination, and request context.
- Added future authentication/session, catalog, project repository, and media-storage boundaries.
- Added `docs/BACKEND_CONTRACTS.md` and documented the adapter/migration rules in the architecture and technical decisions.
- Preserved browser-local storage, mock data, and all current alpha non-goals; no backend or provider was added.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Perform manual browser QA of local-storage and restored-file boundaries before selecting a backend implementation.

## 2026-08-29 - Phase 9 System states and resilience

### Changes

- Audited current loading, empty, error, unavailable-storage, reduced-motion, and action-feedback states across the existing surfaces.
- Added loading feedback and control protection to the global local audio player.
- Added visible session-only feedback when Library favorite persistence is unavailable and aligned the sidebar project-storage status with its actual write result.
- Stopped Dashboard announcement autoplay when `prefers-reduced-motion` is enabled, including live preference changes.
- Preserved synchronous browser-local behavior, mock data, visual scope, and all alpha non-goals.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 10 — Backend readiness contracts. Do not begin it in this phase.

## 2026-08-29 - Phase 8 Project workspace refinement

### Changes

- Added Studio project search, status filters, result counts, and recovery empty states without changing project records.
- Clarified project ownership in cards: local browser projects are editable, while mock references are read-only.
- Added Dashboard feedback for an empty local workspace and a direct first-project action.
- Preserved mock projects, defensive localStorage persistence, and the browser-local/session-only limitation when storage is unavailable.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 10 — Backend readiness contracts. Do not begin it in this phase.

## 2026-08-29 - Phase 7 Shorts lifecycle refinement

### Changes

- Kept the Shorts working editor isolated from incoming same-tab or cross-tab draft updates, while syncing the persisted status when the editor is closed.
- Required the currently selected session media reference, not only a restored filename, before saving a pending-review draft.
- Revoked replaced, rejected, cancelled, and unmounted video object URLs to avoid stale local media references.
- Shared local save feedback through the existing browser-local draft event without persisting media or expanding the storage boundary.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 8 — Project workspace refinement. Do not begin it in this phase.

## 2026-08-29 - Phase 6 Upload validation refinement

### Changes

- Added safe local checks for empty and oversized selected files, with clear error feedback.
- Distinguished the current-session `File` from restored serializable metadata; restored metadata no longer satisfies file selection validation.
- Kept persisted metadata aligned with its filename and guarded asynchronous audio duration updates against stale selections.
- Added explicit feedback when local catalog persistence fails, without adding upload, backend, cloud, processing, or dependency behavior.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 7 — Shorts lifecycle refinement.

## 2026-08-29 - Phase 5 Library discovery refinement

### Changes

- Added local sorting for the filtered Library result: curated order, name A-Z, asset type, and favorites first.
- Clarified publication-state controls and made the result count reflect the active filters and sort.
- Preserved browser-local favorites, collection/type filters, publication-state filters, the Shorts bridge, and the existing visual system.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 6 — Upload validation refinement.

## 2026-08-29 - Phase 4 Beat detail refinement

### Changes

- Updated Beats and Beat Detail links to use stable local beat IDs instead of names.
- Added direct return navigation to Beats, clearer Beat Detail catalog context, and a useful not-found state with alternate Shorts navigation.
- Distinguished playable bundled local previews from beats without a local audio file, with accessible status and explanatory copy.
- Preserved mock/local-only behavior with no backend, dependency, media processing, auth, cloud, payments, or new architecture.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 5 — Library discovery refinement.

## 2026-08-29 - Phase 3 local data boundary

### Changes

- Extracted defensive Upload draft, favorite, project, and catalog localStorage handling from `src/app/App.tsx` into small typed modules under `src/data`.
- Isolated local catalog validation, duplicate-name/type protection, and unique-ID preparation without changing the existing publication flow.
- Preserved all current storage fallbacks, error states, browser-local Shorts behavior, mock data, selected-file boundary, and UI.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

### Next

- Phase 4 — Beat detail refinement.

## 2026-08-29 - Phase 2 responsive layout hardening

### Changes

- Added deterministic width bounds and `min-width: 0` coverage to shell, topbar, filters, cards, panels, forms, and discovery surfaces.
- Prevented narrow mobile Library toolbar compression by moving filters to a full-width row at the smallest breakpoint.
- Added safe-area-aware fixed-player height and content clearance, plus scrollable modal backdrops and bounded modal panels.
- Preserved the existing desktop, tablet, and mobile announcement slider sizing and visual system.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Phase 1 shared accessibility hardening

### Changes

- Added explicit button types, accessible names, navigation `aria-current`, and pressed states for shared controls and filters.
- Added explicit labels for search, upload, metadata, and Shorts draft fields.
- Standardized Escape and backdrop-click behavior for the local project, Shorts upload, and Library draft dialogs.
- Extended `focus-visible` treatment to selects and textareas while preserving the existing visual system.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Stabilize slider across breakpoints

### Changes

- Added an explicit tablet breakpoint for the Dashboard announcement slider.
- Kept the fixed `220px` desktop/tablet height and `240px` mobile height.
- Tuned tablet columns, padding, artwork, text size, and controls to preserve the grid.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Responsive container hardening

### Changes

- Added defensive width constraints to shared layout containers, panels, cards, and toolbars.
- Preserved the mobile topbar and discovery controls without allowing long content to widen the page.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Stabilize Dashboard announcement layout

### Changes

- Fixed the announcement slider to `220px` on desktop and `240px` on mobile.
- Bounded announcement text and artwork heights to prevent grid shifts.
- Preserved the existing controls, autoplay, and responsive mobile composition.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Static discovery QA

### Changes

- Included browser-local catalog entries in global search results.
- Preserved global asset search when Library is already the active route.
- Corrected the search result container semantics from `listbox` to `list`.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Global local search

### Changes

- Activated the topbar search for local Beats and Library assets.
- Added result type, metadata, direct Beat Detail links, and filtered Library navigation.
- Added responsive result-panel styling and an explicit empty state.
- Kept search browser-local with mock data only.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Local Beats catalog

### Changes

- Replaced the `/beats` placeholder with a responsive local beat catalog.
- Added search by beat name, genre, and key, plus genre filters.
- Connected cards to Beat Detail and available local previews to the global player.
- Kept the catalog mock/local-only with no backend or publishing workflow.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Local status failure feedback

### Changes

- Archive and Restore for the local Shorts draft now keep the UI unchanged when localStorage is unavailable.
- Added visible error feedback in Library and Shorts instead of reporting a successful status transition.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Dashboard announcements

### Changes

- Added a local Dashboard announcement slider using bundled artwork and existing workspace routes.
- Added previous/next controls, slide indicators, six-second autoplay, pause on hover/focus, and responsive mobile layout.
- Kept announcements static and local; no remote campaign or content-management service was added.

## 2026-08-29 — Shared local Shorts draft editing

### Changes

- Added Library editing for local Shorts caption and tags.
- Added same-tab and cross-tab local draft notifications for Library, Upload, and Shorts.
- Shared pending-review validation across Shorts and Library; Upload now displays the Shorts draft publication state.
- Kept the selected video as a non-persisted filename reference and added no backend or remote synchronization.

## 2026-08-28 — Shorts contained vertical feed

### Changes

- Replaced the oversized Shorts presentation with a centered, contained 9:16 feed.
- Added one clip per scroll-snap slide, wheel navigation, tag search, quick filters, creator context, actions, and a dedicated upload draft modal.
- Kept the implementation mock/local-only; no video upload, processing, backend, or monetization was added.
- Changed the default view to a 3-column published Shorts grid with nine mock examples; the vertical viewer is now selection-only.
- Added `docs/PROJECT_OVERVIEW.md` covering product scope, planned systems, architecture evolution, versions, and desktop/mobile integration.
- Added local-first Shorts interaction behavior: swipe, keyboard navigation, persisted likes/saves, and a saved draft marker.
- Connected the Shorts upload form to the restored local draft metadata for caption, tags, file name, and save timestamp.
- Completed responsive/accessibility QA pass and added visible focus treatment for Shorts controls.
- Added upload validation and selected video metadata feedback without copying or processing the file.
- Added temporary local preview playback for the selected video and improved focused viewer keyboard semantics.
- Added local publication-state simulation with required video, caption, and tag validation.
- Fixed Storage visibility and sidebar clearance on narrow responsive layouts.
- Added a Shorts local draft panel with publication-state actions and tag metadata summary.
- Added a local Shorts-to-Library bridge showing draft metadata and publication status.
- Added the first shared local content action: archive a Shorts draft from Library.

## 2026-08-27 — Local projects

### Changes

- Added functional `New project` actions in Dashboard and Studio.
- Added a responsive modal for name, genre, BPM, key, and status with basic validation.
- Persisted user-created projects defensively in browser `localStorage` and restored them on load.
- Added local project edit and delete actions; mock projects remain read-only references.
- Added visible local saved/error states without backend, cloud, or synchronization.

## 2026-08-27 — Phase 2

### Changes

- Refined BeatVault as a platform for beatmakers and independent creators.
- Removed the personal music-library organizer concept from the product foundation.
- Defined Library as a curated BeatVault content catalog.
- Defined intentional uploads, explicit metadata, tags, and preview boundaries.
- Added Shorts, Streaming, Marketplace, Community, and related future domains conceptually.

### UI

- No visual changes.

## 2026-08-27 — Phase 3 foundation

### Changes

- Added initial TypeScript contracts for core identifiers, creators, content, catalog entries, tags, previews, publication validation, and Shorts references.
- Kept domain contracts independent and separate from the existing UI mock types.

### UI

- No visual changes.

## 2026-08-27 — Phase 4 upload UI

### Changes

- Added the intentional content submission interface at `/upload`.
- Added local validation for file selection, title, content type, and required tags.
- Added draft and review states without backend submission or media processing.
- Added a preview-output placeholder for future technical processing.

### UI

- Preserved the existing BeatVault visual system and responsive behavior.

## 2026-08-27 — Phase 4 closeout

- Closed the visual upload and validation scope.
- Defined the next phase for local automation, internal capture, and Termux handoff.
- Recorded the browser/Android filesystem boundary as an architectural constraint.

## 2026-08-27 — Phase 5 local upload drafts

### Changes

- Added localStorage persistence for the `/upload` draft fields: title, content type, selected file name, and tags.
- Restored valid draft data on load and contained corrupt JSON or unavailable storage without breaking the app.
- Added visible local save states without claiming cloud synchronization.
- Preserved the client-side publication validation and did not add backend, cloud, or Android filesystem access.

## 2026-08-27 — Phase 5 objective file metadata

### Changes

- Added selected-file name, formatted size, MIME type, and browser-readable audio duration to `/upload`.
- Persisted and restored serializable file metadata with the local draft, without storing the file Blob.
- Kept unavailable duration neutral and released temporary audio object URLs.

## 2026-08-27 — Phase 5 internal capture handoff

### Changes

- Added a visible topbar action that downloads `beatvault-capture-YYYYMMDD-HHmmss.json`.
- Capture includes format version, ISO timestamp, current path/hash, app title, limited visible main content, and best-effort draft storage state.
- Added accessible download status text describing the manual Termux handoff.
- Managed capture object URLs with `URL.createObjectURL` and `URL.revokeObjectURL`.
- Classified Capture JSON as an intentional alpha utility for reproducible local testing and handoff preparation.

### Limits

- The browser downloads locally only; no direct Android or Termux filesystem writing, transfer automation, capture history, or backend storage is implemented.

## 2026-08-27 — Phase 5 local capture history

## 2026-08-27 — Markdown handoff adopted

- Removed the in-app Capture JSON action and Capture History route.
- Added `ERRORS.md` and `IMPROVEMENTS.md` as durable project logs.
- Established Markdown files as the handoff workflow for OpenCode, Termux, and GPT mobile.

## 2026-08-27 — Phase 6 local catalog connection

- Connected the Upload flow to a browser-local BeatVault catalog.
- Published-for-review items now appear in Library with tags, metadata, preview placeholder, and status data.
- Kept mock demo assets separate from creator-created local catalog entries.
- Preserved the backend-free and intentional-upload boundary.

## 2026-08-27 — Catalog states

- Added local filters for draft, pending review, published, and archived records.
- New Upload entries are persisted as pending-review items and appear in Library.

## 2026-08-27 — Shorts discovery UI

- Added the `/shorts` route and navigation entry.
- Added a mobile-first visual surface for creator clips, tags, metrics, and linked beats.
- Kept clips as local mock content with no video processing, recommendation engine, comments, moderation, or monetization.
- Added a fullscreen viewer when selecting a Short, with close, play, creator, tags, metrics, and linked-beat affordances.

## 2026-08-27 — Shorts local interactions

- Added browser-local likes, saves, and creator follows.
- Added active visual states in the feed and fullscreen viewer.
- Kept interaction data local and separate from future server analytics.

## 2026-08-28 — Database deferred

- Confirmed that BeatVault remains local-first while the visual product is completed.
- Deferred database, backend, authentication, cloud storage, and synchronization work.

## 2026-08-28 — Shorts discovery direction

- Defined Shorts as a social-style vertical feed with its own upload flow.
- Made explicit tags the primary discovery mechanism for Shorts.
- Planned quick filters, tag search, and creator/beat context links.

## 2026-08-28 — Shorts social feed prototype

- Added a dedicated vertical feed component for Shorts.
- Added tag search, quick filters, wheel navigation, and a Shorts-specific upload draft modal.

### Changes

- Added `/captures` to the shell for consulting the 10 most recent Capture JSON references.
- Persisted only a bounded entry with id, timestamp, filename, route path, and handoff status in localStorage.
- Added a clear-history action and defensive handling for corrupt, unavailable, or quota-limited localStorage.
- Explicitly communicate that history does not retain blobs or full JSON content, so an old artifact cannot be safely downloaded again.

### Limits

- Capture remains a manual browser download and does not write to Termux or Android directly.

## 2026-08-27 — Library UI

### UI

- Added accessible sample cover thumbnails to `/library` with color fallbacks.
- Added library search by name, type, and tags, type/favorites filters, accessible empty results state, and list/grid view switching.
- Favorites are stored defensively in browser localStorage, independently from upload draft persistence.

## 2026-08-27 — Local audio previews

### Changes

- Connected the library preview buttons to a functional global audio player.
- Added static previews for the local 808 kick and basic snare WAV files.
- Added play/pause, duration and progress updates, accessible range seeking, active asset details, clear, and defensive media error states.
- Stops and resets the previous audio source when selecting another asset; static URLs require no object URL lifecycle.

### Limits

- Only the two bundled demo assets have previews; the remaining mock assets report that no preview is available.
- Playback remains browser-local and does not add uploads, backend storage, or localStorage audio persistence.

## 2026-08-27 — FL Studio demo pack

### Changes

- Added four local WAV demo assets to `/library` as the `FL Studio Demo Pack` / `Free Sample Pack` collection.
- Added optional `collection` and `licenseLabel` metadata to `AudioAsset` and displayed `Demo / local test` in each matching row.
- Added a collection filter for the pack while preserving search, favorites, type filters, list/grid views, and previews.

### Limits

- The WAVs are static local test references only. They are not uploaded, synchronized, persisted in localStorage, or presented as commercially licensed content.

## 2026-08-27 — Local demo downloads

### Changes

- Added direct browser downloads for the four `FL Studio Demo Pack` samples marked `Free Sample Pack`, reusing each local preview URL and a safe filename.
- Limited download controls to assets with the exact `Demo / local test` label or an explicit `downloadUrl`.
- Clarified in Library that local demos can be downloaded for testing only, without making a commercial licensing claim.

## 2026-08-27 — Alpha audit

### Documentation and validation

- Consolidated created/modified files, implemented functionality, routes, persistence boundaries, Capture JSON, Capture History, limitations, known gaps, roadmap status, and the recommended next step in `docs/PROGRESS.md`.
- Synchronized `README.md`, `BUGS.md`, `DECISIONS.md`, `ROADMAP.md`, and `NEXT_STEP.md` with the implemented alpha without adding product functionality.
- Validation commands: `npm run typecheck`, `npm run lint`, and `npm run build`.
