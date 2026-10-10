# First release scope

Decision date: 2026-10-08. Goal: a creator can sign in, upload their audio,
find it in Library after reloading, play it, manage metadata and submit it for review.
This loop takes priority over adding more top-level modules.

| Section | Decision | Reason and remaining work |
| --- | --- | --- |
| Home | Keep and reshape | Inspiration and discovery feed for statuses, photos, Shorts and beats. Composer saves text, photos and videos locally in account-scoped IndexedDB; posts also appear on the author's own profile in this browser, but are not public or cross-device. Feed interactions are browser-persisted and sample posts are marked DEMO. |
| Amigos | Keep as a small social foundation | Discover creators who opted into public profiles, send/accept/reject/cancel requests and remove connections. Relations persist in the local API (JSON; PostgreSQL requires migration 006). No chat, push notifications, block/report tools or cross-host social service. This does not replace the first-release audio workflow. |
| Mis subidas (formerly Studio) | Keep | Own Beats and One-shots with search, filters, preview, edit, archive and restore. Legacy project records remain untouched. |
| Library | Keep | Restores owned audio after reload; discovery still needs real published content. |
| Beats / Beat Detail | Keep | Beats shows only approved, published catalog entries. Legacy project detail links remain local references. |
| Upload | Keep | Beats and One-shots, durable audio/cover references and retries after reload with file reselection. Stronger media validation remains pending. |
| Admin | Keep for admins | Admins can approve/reject pending entries; the server enforces role and CSRF, saves rejection notes for owners and audits decisions. |
| Shorts | Defer | Promising discovery feature; video infrastructure would delay the audio release. |
| Plans / Subscription | Defer | Pricing prototype without checkout, billing or enforced entitlements. |
| Community | Defer | Placeholder; validate demand after creators can publish audio. |
| Store | Merge with future Marketplace | Two purchase sections would duplicate scope. |
| Marketplace | Defer | Requires licensing, publication, checkout and payouts. |
| AI Lab | Defer | No defined, validated creator workflow. |
| Releases | Defer | Music distribution is a separate product capability. |
| Analytics | Defer | Real events and consent rules must precede dashboards. |
| Mi perfil | Keep | Creator identity and public/private visibility. Own Home posts appear in a separate Publications tab only on the local device; beats/one-shots remain in Projects. Public audio previews and server-published social posts are not implemented. |
| Settings | Keep as Editar perfil | Persisted creator metadata, cover/avatar presets and links. Email, password and role are not editable here. |

Navigation now shows Home, Amigos, Mis subidas, Library, Beats and Upload. Admin is shown
only to authenticated admins. Existing prototype routes and files remain available
for evaluation and existing links; they are not release commitments.
Marketplace, public creator publishing and collaboration requests remain separate
future work; legacy `/dashboard` links continue to resolve to Home.

The executable inventory is `src/app/modules.ts`. Navigation, browser route coverage
and diagnostic reports read that inventory. Its state is an explicit assessment,
not a claim that source scanning can determine whether a feature is complete.

## Release blockers

- The authenticated upload/reload/playback workflow and account cache isolation are covered locally; validate production storage and recovery separately.
- Verify real Postgres migrations, concurrency and recovery before multi-user deployment.
- Apply Postgres migration 007 and verify real database persistence before multi-user release.
- Define production session storage, email delivery and storage backups.

Payments, social expansion beyond the small local friend foundation, AI, distribution
and cloud-provider integrations do not block the first private creator pilot.
