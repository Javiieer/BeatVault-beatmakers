# Decisions

## ADR-014 — Local interaction storage is defensive and unified

Decision:
Shorts likes, saves, and follows use one namespaced key per interaction, with guarded storage access and migration from the earlier like/save keys. A stored filename never represents a restorable `File`; review requires a newly selected file in the current session.

Reason:
The alpha must remain useful when browser storage is blocked while avoiding false publication of media that no longer exists.

Date:
2026-08-29

## ADR-013 — Shorts draft state uses local browser events

Decision:
Shorts draft writes continue to use `localStorage` and also emit a browser-local change event. Library, Upload, and Shorts listen to that event plus the native storage event so their serializable metadata and publication state stay current without a backend.

Reason:
The same-tab storage API does not emit its own storage event, while independent route components can otherwise show stale draft state. This improves local consistency without implying remote synchronization or persisting the selected video.

Date:
2026-08-29

## ADR-011 — Alpha scope is local and auditable

Decision:
The current alpha is evaluated as a browser-local product slice. Its supported capabilities are project organization, catalog exploration, local previews, draft metadata, and explicit JSON capture/handoff. Every persisted feature must declare its browser storage boundary, and demo content must remain distinguishable from user-owned or published content.

Reason:
This keeps the implementation testable without backend assumptions and makes the current product state reproducible while the Termux transport and service boundaries remain undecided.

Date:
2026-08-27

## ADR-010 — Projects are browser-local

Decision:
User-created projects are stored as a validated JSON array in browser `localStorage`. They are merged with read-only mock projects in Dashboard and Studio; edit and delete actions apply only to local projects.

Reason:
This delivers useful project creation without introducing backend, cloud, synchronization, or filesystem dependencies. Invalid or unavailable storage is contained and reported as a local limitation.

Date:
2026-08-27

## ADR-001 — BeatVault is not a personal file organizer

Decision:
BeatVault manages its own platform content catalog. Local files are touched only after an intentional user action such as upload, publish, share, collaboration, or product creation.

Reason:
This keeps the product focused on creators and prevents the core from becoming a personal filesystem manager.

Date:
2026-08-27

## ADR-007 — Capture is a local JSON handoff

Decision:
The shell exports a versioned JSON artifact containing current navigation context, app title, limited visible text, and draft storage availability. The artifact is downloaded with a temporary object URL and is manually transferred to Termux when needed.

Reason:
This provides a dependency-free internal handoff while respecting the browser/Android filesystem boundary. The capture must not claim direct Android writing or serialize the selected file Blob.

Date:
2026-08-27

## ADR-008 — Capture is an alpha utility

Decision:
The Capture JSON action is a useful alpha tool for recording the current BeatVault context, sharing reproducible state, and testing the Termux handoff workflow. It is part of the alpha product surface, not disposable debug output.

Reason:
It gives local testing a practical artifact while the project remains browser-first and backend-free. Its format can evolve through explicit versioning.

Date:
2026-08-27

## ADR-009 — Capture history stores references only

Decision:
Capture history uses browser localStorage with a maximum of 10 small entries containing only an id, timestamp, filename, route path, and handoff status. It is exposed at `/captures`, supports clearing, and never stores blobs or full capture content.

Reason:
This makes recent handoffs discoverable without turning browser storage into an artifact store. Since an older capture cannot be safely reconstructed from a reference alone, the UI states that history entries are not re-downloadable. Corrupt or unavailable storage is treated as a non-persistent optional capability.

Date:
2026-08-27

## ADR-006 — Objective file metadata is draft-safe

Decision:
The upload draft may persist objective metadata available from the selected File: name, formatted size, MIME type, and nullable audio duration. The Blob is never serialized or retained in localStorage.

Reason:
This improves upload transparency while preserving the intentional access boundary and the backend-free local draft model. Duration is best-effort and remains neutral when the browser cannot read it; temporary object URLs are released after inspection.

Date:
2026-08-27

## ADR-005 — Upload drafts are local and best-effort

Decision:
The `/upload` form persists title, content type, selected file name, and tags in browser localStorage. Reads validate the stored shape and writes are guarded; the UI reports local saving only and never represents it as synchronization.

Reason:
This protects work across page reloads while keeping the prototype backend-free and explicit about browser storage limits. The selected file is represented by its name only; the browser file itself is not copied or uploaded.

Date:
2026-08-27

## ADR-004 — Capture and Termux handoff are separate capabilities

Decision:
BeatVault may capture its own visible UI and prepare a local artifact for export. Delivery into Termux Android must use an explicit transport or handoff mechanism; the web UI must not assume direct access to the Android filesystem.

Reason:
This keeps capture reliable and testable while acknowledging the security boundary between a browser, the Windows project, and a remote Android terminal.

Date:
2026-08-27

## ADR-010 — Shorts interactions are browser-local during alpha

Decision:
Likes, saves, and follows in the Shorts prototype persist only in browser `localStorage`.

Reason:
This provides a real interaction loop without inventing accounts, server analytics, or social backend behavior before those domains are designed.

Date:
2026-08-27

## ADR-011 — Defer the database until the visual product is validated

Decision:
BeatVault remains browser-local with `localStorage` during the current visual/product validation stage. No Supabase, PostgreSQL, backend API, authentication, cloud storage, or remote synchronization will be introduced yet.

Reason:
The priority is to finish and validate the visual workflows before committing to infrastructure, account models, storage rules, and deployment decisions.

Date:
2026-08-28

## ADR-012 — Tags are a primary Shorts discovery mechanism

Decision:
Shorts discovery will use explicit tags as a first-class interaction. Users will browse quick tag chips and search by style, mood, sound, BPM, creator, or linked beat.

Reason:
Tags connect social discovery with the BeatVault music catalog without requiring recommendations in the visual-first phase.

Date:
2026-08-28

## ADR-002 — Shorts is an independent discovery domain

Decision:
Shorts will eventually provide short-form vertical multimedia discovery linked to creators and BeatVault content. It will not be implemented as a general social network or coupled to the catalog internals.

Reason:
Shorts can drive creator and music discovery while preserving clear boundaries for future media, moderation, analytics, and monetization work.

Date:
2026-08-27

## ADR-003 — Creator-defined metadata is authoritative

Decision:
Required tags and subjective metadata must be supplied or approved by the content owner or BeatVault administrator. Automated processing is limited to objective technical facts unless a future suggestion workflow is explicitly introduced.

Reason:
Consistent catalog quality requires intentional metadata ownership.

Date:
2026-08-27
