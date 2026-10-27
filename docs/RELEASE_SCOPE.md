# First release scope

> Consolidation 2026-10-27: migration 030, account favorites, independent commercial
> review state, One-shot moderation and expanded image/batch upload support are
> integrated locally. See CONSOLIDATION_STAGES.md for verification and limits.

> Local update 2026-10-26: native PostgreSQL 16.15 is active with the verified import;
> fresh migrations 001-029, upgrade 028 to 029 and native integration/restore QA passed.
> Stems are excluded from current scope and new offers; MP3/WAV remain supported.
> See POSTGRES_LOCAL.md for exact evidence and remaining hosted work.

Decision date: 2026-10-08. Status reviewed: 2026-10-26. Goal: a creator can sign in, upload their audio,
find it in My uploads after reloading, play it, manage metadata and submit it for review.
This loop takes priority over adding more top-level modules.

| Section | Decision | Reason and remaining work |
| --- | --- | --- |
| Home | Keep as supporting discovery/community | Posts, comments, reactions, follows and bookmarks persist by account. Stories are independent records with a 24-hour expiry. Public/friends/private audiences and profile privacy are enforced by the API. In-app notifications, public-post refresh prompts and local PostgreSQL persistence are verified; story moderation and multi-instance delivery remain open. |
| Amigos and Mensajes | Keep as a small social foundation | Discover creators who opted into public profiles, manage friend requests and use one-to-one text chat with accepted friends. Messages persist in the local API (JSON; PostgreSQL requires migrations 008-009) and connected clients receive updates over SSE. Published catalog Beats support persisted comments/reactions and in-app notifications. No attachments, groups, push notifications, block/report tools or multi-instance realtime service. This does not replace the first-release audio workflow. |
| Mis subidas (formerly Studio) | Keep | Own Beats and One-shots with search, filters, preview, edit, archive and restore. Legacy project records remain untouched. |
| Library | Merge into Marketplace | My library holds account-scoped saved public audio and confirmed purchases. Editing remains in My uploads. |
| Beats / Beat Detail | Merge discovery; keep real public detail | Legacy Beats opens Marketplace filtered to Beats. Detail reads published catalog IDs and public previews, without private originals. |
| Upload | Keep | Beats and One-shots, durable audio/cover references and retries after reload with file reselection. Stronger media validation remains pending. |
| Admin | Keep for admins | Admins and Community Managers can independently approve/reject pending Beats after listening to a private processed preview; the server enforces role, ownership and CSRF, saves rejection notes for owners and audits decisions. Category-scoped discount rules persist locally or in PostgreSQL but are not yet applied to product prices or checkout. |
| Marketplace intake review | Private seller intake and least-privilege staff review | Implemented: community managers can recommend/request changes, and a different admin can make a reasoned final decision after a current positive recommendation. Sellers can see current/stale status. Approval does not itself publish offers or authorize a sale; evidence is not legal clearance. |
| Shorts | Defer | Promising discovery feature; video infrastructure would delay the audio release. |
| Plans / Subscription | Partial | Local Free/Creator/Studio assignment and configurable storage enforcement; displayed prices and feature bundles are proposals only. Recurring Stripe subscriptions and paid entitlement changes are not implemented. |
| Community | Defer | Placeholder; validate demand after creators can publish audio. |
| Store | Creator subpage of Marketplace | `/store?id=...` shows only a creator's public offers. A Store link without a creator resolves to Marketplace. |
| Marketplace | Partial; Mercado Pago local/test only | Published Beats and One-shots use server-side discovery, bounded filters, pagination and previews. Sellers can persist private Beat offer drafts and rights evidence; Community Manager and admin review are separate, audited steps. Mercado Pago Checkout Pro Split 1:1 includes seller OAuth, frozen MXN quotes, webhook-reconciled orders, buyer-scoped downloads, refund requests and dispute flags. The checkout stays disabled until server credentials, HTTPS callback, FX and fee are configured. Seller offers remain unavailable until approval and operational checks. Legal terms, taxes, settlement policy, live payouts and public commerce remain blocked. See `docs/MERCADOPAGO_LOCAL_TESTING.md` for the current local setup guide. |
| AI Lab | Defer | No defined, validated creator workflow. |
| Releases | Defer | Music distribution is a separate product capability. |
| Analytics | Defer | Real events and consent rules must precede dashboards. |
| Mi perfil | Keep | Creator identity and public/private visibility. Home posts synchronize with the author's profile through the API; beats/one-shots remain in Projects. Public audio previews and live Home updates remain separate work. |
| Settings | Keep as Editar perfil | Persisted creator metadata, cover/avatar presets and links; local account email/password changes and client-side preferences are available. Email verification and transactional recovery delivery are not configured. Role is never user-editable. |

Navigation now shows Home, Friends, Messages, My uploads, Marketplace, Upload and Plans in English by default. Library and Beats are legacy aliases within Marketplace. Spanish translations cover selected navigation, Marketplace and settings text; the remaining screens are only partially translated. Admin is shown
only to authenticated admins. Existing prototype routes and files remain available
for evaluation and existing links; they are not release commitments.
Production commerce, public creator publishing and collaboration requests remain
separate future work; legacy `/dashboard` links continue to resolve to Home.

The executable inventory is `src/app/modules.ts`. Navigation, browser route coverage
and diagnostic reports read that inventory. Its state is an explicit assessment,
not a claim that source scanning can determine whether a feature is complete.

## Release blockers

- The authenticated upload/reload/playback workflow and account cache isolation are covered locally; validate production storage and recovery separately.
- PostgreSQL clean migrations 001-029, upgrade 028 to 029, integration and local restore passed. Verify the target hosted configuration and an off-device database+audio recovery before hosting real users.
- Social video decoding is validated, but original MP4 container/stream metadata is not stripped yet; disable public video posts or sanitize metadata before the hosted pilot.
- The default verified local launcher uses PostgreSQL. The explicit JSON fallback is the retained pre-migration state and is not a synchronized alternative for concurrent multi-user writes.
- Sessions have durable JSON/PostgreSQL repository support; rate limits remain process-local. Email delivery and a secure production admin-provisioning procedure are still required.
- Oracle Compose/Caddy is a private-pilot scaffold. A real VPS deployment, migration procedure, and off-host backup/restore drill are not yet proven.

Live payments, subscriptions, distribution, AI, cloud-provider integrations, and
social expansion beyond the small local foundation are not first-pilot commitments.

The current functional gaps, evidence levels and acceptance criteria are recorded in
[PRODUCT_AUDIT_2026-10-26.md](PRODUCT_AUDIT_2026-10-26.md). Commercial approval must
be persisted independently of audit retention before enabling sales.
