# First release scope

Decision date: 2026-10-08. Goal: a creator can sign in, upload their audio,
find it in Library after reloading, play it, manage metadata and submit it for review.
This loop takes priority over adding more top-level modules.

| Section | Decision | Reason and remaining work |
| --- | --- | --- |
| Home | Keep and reshape | Inspiration and discovery feed for statuses, photos, Shorts and beats. Composer saves text, photos and videos locally in account-scoped IndexedDB; posts also appear on the author's own profile in this browser, but are not public or cross-device. Feed interactions are browser-persisted and sample posts are marked DEMO. |
| Amigos and Mensajes | Keep as a small social foundation | Discover creators who opted into public profiles, manage friend requests and use one-to-one text chat with accepted friends. Messages persist in the local API (JSON; PostgreSQL requires migrations 008-009) and connected clients receive updates over SSE. Published catalog Beats support persisted comments/reactions and in-app notifications. No attachments, groups, push notifications, block/report tools or multi-instance realtime service. This does not replace the first-release audio workflow. |
| Mis subidas (formerly Studio) | Keep | Own Beats and One-shots with search, filters, preview, edit, archive and restore. Legacy project records remain untouched. |
| Library | Keep | Restores owned audio after reload; discovery still needs real published content. |
| Beats / Beat Detail | Keep | Beats shows only approved, published catalog entries. Legacy project detail links remain local references. |
| Upload | Keep | Beats and One-shots, durable audio/cover references and retries after reload with file reselection. Stronger media validation remains pending. |
| Admin | Keep for admins | Admins can approve/reject pending entries; the server enforces role and CSRF, saves rejection notes for owners and audits decisions. Category-scoped discount rules persist locally or in PostgreSQL but are not yet applied to product prices or checkout. |
| Marketplace intake review | Private seller intake and least-privilege staff review | Community managers can recommend or request changes; admins can make a reasoned final intake decision after a current positive manager recommendation. This does not publish offers or enable sales. Evidence is private seller-provided material and is not legal clearance. |
| Shorts | Defer | Promising discovery feature; video infrastructure would delay the audio release. |
| Plans / Subscription | Partial | Local Free/Creator/Studio assignment and server-side configurable storage enforcement; price proposal remains inactive. Stripe is not wired for subscriptions. |
| Community | Defer | Placeholder; validate demand after creators can publish audio. |
| Store | Merge with Marketplace | One market entry point; purchase flow remains deferred. |
| Marketplace | Partial | Published Beats and One-shots use a public server-side discovery endpoint with query, creator/tag/type filters and cursor pagination. Sellers can privately persist Beat offer drafts and start Stripe Connect Express onboarding in test mode. USD is the listing base; display conversion is indicative. Drafts are not buyer-visible offers; charges, license prices, tax, commissions, marketplace transfers, checkout, private delivery and BeatVault-managed payouts remain deferred. |
| AI Lab | Defer | No defined, validated creator workflow. |
| Releases | Defer | Music distribution is a separate product capability. |
| Analytics | Defer | Real events and consent rules must precede dashboards. |
| Mi perfil | Keep | Creator identity and public/private visibility. Own Home posts appear in a separate Publications tab only on the local device; beats/one-shots remain in Projects. Public audio previews and server-published Home posts are not implemented. |
| Settings | Keep as Editar perfil | Persisted creator metadata, cover/avatar presets and links; local account email/password changes and client-side preferences are available. Email verification and transactional recovery delivery are not configured. Role is never user-editable. |

Navigation now shows Home, Friends, Messages, My uploads, Library, Beats, Marketplace, Upload and Plans in English by default; Spanish translations currently cover navigation and Marketplace. Translation coverage for the remaining screens is still in progress. Admin is shown
only to authenticated admins. Existing prototype routes and files remain available
for evaluation and existing links; they are not release commitments.
Commerce, public creator publishing and collaboration requests remain separate
future work; legacy `/dashboard` links continue to resolve to Home.

The executable inventory is `src/app/modules.ts`. Navigation, browser route coverage
and diagnostic reports read that inventory. Its state is an explicit assessment,
not a claim that source scanning can determine whether a feature is complete.

## Release blockers

- The authenticated upload/reload/playback workflow and account cache isolation are covered locally; validate production storage and recovery separately.
- Disposable PostgreSQL 16 migrations 001-014, package assignment, account quota overrides, concurrency, restart recovery and (with an explicitly labeled test container) database/audio restore have passed; production backup/restore and deployment behavior still need a separate drill.
- The running local app uses JSON. Apply all current migrations, including 013, only if switching it to PostgreSQL.
- Define production session storage, email delivery and storage backups.

Payments, social expansion beyond the small local friend foundation, AI, distribution
and cloud-provider integrations do not block the first private creator pilot.
