# BeatVault BeatMakers

## Product overview

BeatVault BeatMakers is a creator-first platform for discovering, organizing, previewing, and eventually publishing beats, samples, projects, and short-form music content. It is designed for beatmakers, producers, artists, and listeners who want one focused place for musical ideas and creator discovery.

The current product is a browser-local visual alpha. The interface and workflows are being completed before introducing accounts, a server, cloud storage, payments, or real media processing.

## What will be built

### Dashboard

The operational home for projects, recent activity, quick actions, and creator progress. It will later connect to account data, notifications, publishing status, and analytics.

### Studio and projects

A workspace for creating and organizing beatmaking projects. Projects will contain metadata such as genre, BPM, key, status, collaborators, stems, and versions. The local prototype uses browser storage; the future version will sync projects through an API and cloud file storage.

### Library

A curated catalog of beats, loops, samples, presets, and other musical assets. Search, filters, favorites, collections, previews, tags, and publication states are core features. Library content is platform content, not only a personal file folder.

### Beat detail

A focused page for a beat with creator, artwork, tags, BPM, key, genre, description, preview, related content, and future licensing or purchase actions. Preview playback remains separate from the future transaction system.

### Upload and publishing

Upload is intentional and metadata-driven. Each content type will have its own preparation flow, validation, draft state, preview, and publication status. Audio, beats, and Shorts should not be forced through one generic form.

### Shorts

Shorts is the social discovery layer for musical ideas. The default view is a grid of published examples with tag discovery. Selecting one opens a narrow 9:16 focused viewer inspired by vertical-video products, with creator context, actions, related beat, and previous/next navigation.

Future Shorts systems include real video upload, transcoding, moderation, follows, comments, recommendations, analytics, creator profiles, and monetization. None of those are part of the current local alpha.

## Shared product principles

- Tags are a primary discovery and organization system.
- Creator-defined metadata is authoritative.
- Every content item has a clear draft, review, published, or archived state.
- Audio previews are lightweight and separate from full downloadable files.
- Shorts and Library have distinct workflows while sharing creators, tags, beats, and references.
- Local-first prototypes must declare what is persisted and where.
- Visual polish and responsive behavior come before backend expansion.

## Architecture evolution

### Current alpha

React, TypeScript, Vite, CSS, mock content, bundled demo assets, and browser `localStorage`. Routes and components model the future product without pretending that uploads, accounts, or publishing are already real.

### First real web platform

The future web application will add:

1. Authentication and creator profiles.
2. An API for projects, catalog items, tags, Shorts, interactions, and publication states.
3. A relational database for metadata and relationships.
4. Object storage for audio, images, and video.
5. Background jobs for validation, waveform generation, transcoding, thumbnails, and moderation.
6. CDN delivery for previews and published media.
7. Event and analytics infrastructure for plays, views, saves, follows, and creator reporting.

The frontend should keep using domain-shaped models and service boundaries so local mock repositories can later be replaced by API repositories without rebuilding every screen.

## Planned domain systems

### Identity and creators

Accounts, profiles, roles, creator verification, preferences, follows, and permissions.

### Catalog and metadata

Assets, beats, collections, tags, genres, BPM, key, licenses, ownership, visibility, and review state.

### Media

Original files, previews, thumbnails, waveforms, duration, encoding status, storage keys, and delivery URLs. Media processing will be asynchronous and will never block the main UI.

### Discovery

Search, tag pages, related beats, creator pages, curated collections, and eventually recommendation signals. Tags remain understandable and user-visible even after recommendations exist.

### Social interaction

Likes, saves, follows, comments, sharing, reports, moderation queues, notifications, and creator analytics.

### Commerce

Licenses, pricing, checkout, orders, payouts, receipts, and rights records. Commerce will be introduced only after ownership and publication rules are stable.

## Desktop and mobile integration

### Desktop web and desktop app

Desktop is the deep-work experience: larger Library views, Studio editing, project management, keyboard shortcuts, multi-column discovery, detailed beat pages, and creator administration. A future desktop app can package the same domain layer and UI primitives using a desktop shell while preserving the web API and authentication model.

### Mobile web and mobile app

Mobile is the discovery and capture experience: Shorts feed, quick preview, tag browsing, saves, follows, notifications, profile, and intentional mobile upload. A future native or cross-platform app should consume the same API, media CDN, authentication, and event system rather than maintaining a second data model.

### Shared contract

Desktop and mobile will share:

- User and creator identity.
- Projects and catalog metadata.
- Tags and relationships.
- Publication and moderation states.
- Media URLs and preview contracts.
- Interaction events.
- Notification and analytics semantics.

They may use different layouts and navigation, but they must not create incompatible copies of the same content.

## Version plan

### Version 0: visual local alpha

Finish responsive UI, local workflows, Shorts grid and focused viewer, local previews, draft metadata, and Markdown handoff. No backend.

### Version 1: private creator workspace

Add authentication, synced projects, creator profiles, real uploads, catalog records, media processing, and private drafts.

### Version 2: publishing and discovery

Add review queues, public Library content, creator pages, tags, search, Shorts publishing, follows, saves, and reporting.

### Version 3: marketplace and ecosystem

Add licensing, purchases, payouts, collaboration, recommendation tools, creator analytics, and carefully scoped monetization.

### Version 4: platform clients

Ship desktop and mobile clients using the shared API and domain contracts, with experiences optimized for deep work on desktop and discovery/capture on mobile.

## Current status

The project is in the visual product completion stage. Shorts has a single grid-to-focused-viewer implementation, encoded related-beat navigation, local interaction persistence, and a guarded draft lifecycle. Beat Detail and the global local-preview player are connected. The next implementation slice is manual browser QA for storage-blocked and restored-file boundaries.

## Non-goals for the current alpha

Do not add a database, backend, authentication, cloud storage, real video processing, moderation, recommendations, payments, monetization, or direct Termux transport yet.

## Handoff rule

Before significant work, read this file together with `PROGRESS.md`, `ERRORS.md`, `IMPROVEMENTS.md`, `DECISIONS.md`, `ROADMAP.md`, and `NEXT_STEP.md`. After significant work, update the Markdown records, run typecheck/lint/build, and leave one concrete next step.
