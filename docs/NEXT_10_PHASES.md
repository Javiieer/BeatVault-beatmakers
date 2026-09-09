# Next 10 Phases

This execution queue is local-first and sequential. Each phase must leave code, validation, and a Markdown handoff before the next agent starts.

## Phase 1 — Shared accessibility hardening

Audit and improve keyboard navigation, focus-visible states, dialog semantics, labels, pressed states, and Escape handling across shared surfaces.

## Phase 2 — Responsive layout hardening

Use the existing visual system to remove remaining narrow-screen overflow risks across Dashboard, Beats, Library, Upload, and Shorts.

## Phase 3 — Local data boundary

Extract defensive browser storage reads/writes and local catalog operations into small typed modules without adding a backend.

## Phase 4 — Beat detail refinement

Improve Beat Detail context, unavailable states, navigation back to Beats, and local preview affordances.

## Phase 5 — Library discovery refinement

Add useful local sorting, clearer collection/status controls, and preserve favorites and catalog filtering behavior.

## Phase 6 — Upload validation refinement

Clarify file validation, draft save feedback, metadata states, and the boundary between selected files and persisted metadata.

## Phase 7 — Shorts lifecycle refinement

Strengthen local draft editing, publication transitions, restored-file rules, media cleanup, and shared-state feedback.

## Phase 8 — Project workspace refinement

Improve local project empty states, editing feedback, project filtering, and browser persistence boundaries.

## Phase 9 — System states and resilience

Standardize loading, empty, error, unavailable-storage, and reduced-motion behavior across the app.

## Phase 10 — Backend readiness contracts

Document and type the future API/storage/auth boundaries without implementing a server, database, authentication, cloud media, payments, or synchronization.

## Execution Rules

- One agent at a time; agents share this workspace.
- Read `docs/PROJECT_OVERVIEW.md`, `PROGRESS.md`, `ERRORS.md`, `IMPROVEMENTS.md`, `DECISIONS.md`, `ROADMAP.md`, and `NEXT_STEP.md` before editing.
- Keep changes minimal and browser-local unless the phase explicitly says otherwise.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` after each phase.
- Update `PROGRESS.md`, `CHANGELOG.md`, `IMPROVEMENTS.md`, `ERRORS.md`, and `NEXT_STEP.md` when applicable.
- Do not start the next phase if validation fails or the handoff is incomplete.
