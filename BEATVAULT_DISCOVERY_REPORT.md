# BEATVAULT DISCOVERY REPORT

**Phase:** 0 - Discovery / Blueprint
**Date:** 2026-08-26
**Assessment scope:** Workspace inspection and initial product/technical boundary

## 1. Current Project State

The workspace now contains the local React, TypeScript, and Vite frontend described in `PROGRESS.md`, with source, configuration, documentation, assets, package manifests, and tests.

Git has been initialized, but the project currently has no commits. The frontend is local-only; no backend or deferred integrations are implemented.

## 2. Detected Technologies

Confirmed technologies: React, TypeScript, Vite, Vitest, and CSS variables.

The following remain candidate technologies, not confirmed decisions:

- Frontend: React, TypeScript, Vite, modern CSS or SCSS
- Desktop shell: Tauri 2 with Rust
- Backend: Node.js and TypeScript
- Database: PostgreSQL
- Object storage: S3-compatible storage
- Search: start with database search; evaluate Meilisearch only when scale requires it
- Audio processing: FFmpeg plus focused open-source analysis libraries
- AI/ML: separate Python services or local ONNX workloads only after a concrete use case is validated

## 3. Existing Files

None. There are no existing files to preserve or integrate with.

## 4. Existing Architecture

No architecture exists yet. This is a greenfield project, so the main immediate risk is making infrastructure decisions before the product's first user loop is validated.

## 5. Problems and Constraints Discovered

- There is no repository history, so there is no established coding or branching convention.
- The product vision spans several large products: local production workspace, asset library, social network, collaboration suite, marketplace, cloud service, release workflow, and analytics.
- The local-first requirement conflicts with a purely web-first implementation and needs an explicit product decision before UI foundations are finalized.
- Audio analysis quality varies substantially by file type, genre, tuning, and recording conditions. Automatic key, instrument, mood, and timbre labels must be treated as probabilistic metadata.
- Marketplace licenses, ownership, revenue splits, takedowns, taxes, and refunds require domain and legal design before implementation.
- Social content moderation, copyright handling, privacy, abuse prevention, and storage costs are foundational concerns, not later polish.

## 6. Recommended Initial Stack

Use a deliberately small stack for the first product slice:

- TypeScript with strict mode
- React and Vite for the UI foundation
- CSS variables and component-scoped styles first; add Sass only if the design system demonstrates a real need
- A modular frontend monolith initially, with domain boundaries and typed interfaces
- Node.js/TypeScript API only when persistence or multi-user flows are defined
- PostgreSQL as the likely system of record
- S3-compatible object storage for audio and artwork, introduced with upload requirements
- FFmpeg for basic media inspection/transcoding

Do not add Redis, a dedicated search engine, Python ML services, or Tauri until a measured requirement justifies each one. The desktop/local-first direction should be validated with a thin prototype before committing to a full desktop architecture.

## 7. Proposed Module Map

### Initial foundation

- `core`: configuration, errors, identifiers, permissions, shared contracts
- `ui`: tokens, layout primitives, navigation, feedback states, audio preview primitives
- `projects`: projects, drafts, versions, metadata, notes, status
- `library`: imported assets, tags, collections, favorites, filtering, preview
- `audio`: file inspection, waveform generation, playback abstractions

### Later modules

- `identity`: accounts, creator profiles, authentication
- `social`: posts, follows, comments, saves, moderation
- `collaboration`: invitations, roles, project access, comments, credits
- `commerce`: products, licenses, checkout, entitlements, payouts
- `cloud`: sync, backup, conflict resolution, storage lifecycle
- `ai`: analysis jobs, classifiers, embeddings, recommendations
- `releases`: validation, release metadata, distribution integrations
- `analytics`: event collection and creator/business reporting

Keep commerce, social, and AI behind interfaces rather than coupling them to the Studio or Library domain.

## 8. Proposed MVP Boundary

The MVP should validate one high-value production loop:

1. A producer creates a project.
2. The producer imports or registers beats, samples, and versions.
3. The producer searches, tags, filters, and previews assets quickly.
4. The producer updates project metadata and status.
5. The producer can reopen the workspace and continue without losing organization.

Recommended MVP screens:

- App shell and navigation
- Dashboard with recent projects and library activity
- Studio project list and project detail
- Sample/library browser with search, filters, collections, favorites, and audio preview
- Settings for local storage and basic preferences

For the first slice, use user-entered metadata plus reliable technical metadata such as duration, format, sample rate, channels, and waveform. Defer cloud sync and public sharing until the local workflow is useful on its own.

## 9. Features to Postpone

- Full DAW editing, mixing, recording, and plugin hosting
- Marketplace and beat-store licensing
- Payments, payouts, ownership, and revenue splits
- Public social feed and large-scale creator discovery
- Real-time collaboration
- Automatic genre, mood, timbre, and instrument intelligence
- Embeddings and semantic recommendations
- Cloud sync with conflict resolution
- Distribution integrations and release delivery
- Advanced analytics
- Custom audio engine and custom plugins

## 10. Major Technical Risks

- **Local-first synchronization:** offline edits, identity, conflict resolution, and large binary files can dominate architecture.
- **Audio performance:** waveform generation, previewing, indexing, and large libraries require background jobs and incremental processing.
- **Metadata correctness:** key/BPM detection can be wrong; the UI must expose confidence and allow correction.
- **Storage economics:** audio derivatives, waveform data, backups, and previews can grow rapidly.
- **Copyright and licensing:** user uploads and marketplace assets need provenance, takedown, and entitlement models.
- **Security:** private projects, share links, file access, and future creator payouts require strict authorization boundaries.
- **Scope expansion:** social, commerce, and AI can each become a separate product and obscure the core workflow.

## 11. Recommended UI Architecture

Use a desktop-oriented responsive app shell with a persistent primary navigation and context-aware secondary navigation.

- `AppShell`: navigation, workspace context, command/search entry, global player status
- `PageFrame`: title, actions, breadcrumbs, responsive content regions
- `DataView`: list/grid/table variants with loading, empty, error, and selection states
- `MediaPreview`: playback controls, waveform, metadata, queue behavior
- `ProjectCard`, `AssetRow`, `Tag`, `FilterBar`, `InspectorPanel`
- Feature folders own their screens and feature-specific components.
- Shared UI contains primitives and patterns, not product-domain rules.
- Define design tokens before screen-level styling: colors, typography, spacing, radii, elevation, motion, and focus states.

The visual direction should be dark-first and technical, but contrast, keyboard navigation, reduced motion, and readable density must be treated as requirements rather than optional polish.

## 12. Recommended Next Steps

1. Confirm the first target user and the single workflow the MVP must improve.
2. Decide whether the first deliverable is web, desktop, or a local-first desktop prototype.
3. Write the initial user flows for project creation, asset import, search, preview, and metadata editing.
4. Define the design system and screen map before implementing screens.
5. Create the repository and documentation baseline: `PRODUCT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `MODULES.md`, and `TECH_DECISIONS.md`.
6. Prototype library performance using representative audio collections and file sizes.
7. Implement the smallest UI foundation with mocked data and test the workflow with producers.
8. Select persistence, audio processing, and desktop/cloud boundaries based on prototype findings.

## Decisions Required Before Implementation

- Who is the primary MVP user: beatmaker, sample creator, vocalist, or another persona?
- Is offline use a day-one acceptance criterion, or a later product milestone?
- Is BeatVault initially a desktop app, web app, or paired desktop/web product?
- What is the minimum supported operating system and target hardware?
- Must imported files remain in their original folders, or may BeatVault manage/copy them?
- What is the expected initial library size and maximum practical library size?
- Is authentication needed in the first slice?
- Which metadata fields are mandatory, editable, or inferred?
- What are the first success metrics for the MVP?
- Should the first release remain private/local, or include public creator identity?

## Assessment Conclusion

BeatVault has a strong product direction, but the current scope is too broad for a first implementation. The safest starting point is a focused production-organization workflow: Projects plus a fast local asset library with reliable preview and metadata. Establish the UI and domain boundaries around that loop, then validate local-first behavior and user demand before adding cloud, social, commerce, or AI systems.
