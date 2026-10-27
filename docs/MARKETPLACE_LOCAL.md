# Unified Marketplace: local scope

The application has one discovery entry in the main navigation: Marketplace.
Its sections are Explore, My library and My purchases. Legacy `/beats` links open
Explore filtered to Beats; `/library` links open My library. Creator stores and
published catalog details remain public subpages. Hash searches, type/tag filters,
tab changes and browser history are retained.

## Local behavior

- Explore queries the published Beat/One-shot API with search, type, tag and cursor
  pagination. Private drafts are excluded. Errors are explicit and retryable.
- Public detail resolves a real catalog ID, not an unrelated project/demo reference.
  Anonymous visitors can read published details and play public previews. They must
  sign in for private sections and purchase actions.
- My library holds saved public IDs scoped to the signed-in account in this browser,
  plus paid orders from the protected API. Saved items outside the first catalog page
  resolve through bounded public-detail requests. Unavailable saved items can be
  removed explicitly; failed/unqueried items are retained. This does not implement
  cross-device synchronization of favorites.
- My purchases shows actual server order states and snapshotted offer/license terms.
  Only paid orders expose protected per-format downloads. A client success URL never
  grants a purchase or download permission.
- My uploads retains editing, archive/restore, original-owner downloads, preview retry,
  seller listing preparation and Mercado Pago seller setup. Catalog-entry deletion requires
  an explicit confirmation; the original remains private and is not deleted by that
  action. Audio referenced by active purchase orders cannot be deleted.

## Delivery and boundaries

Checkout snapshots the source asset ID, SHA-256, size, MIME type, original name,
selected MP3/WAV deliverables, offer label and license text/version. Later changes
to a listing/catalog record do not substitute a buyer's file. Each protected download
checks buyer identity, current paid state, purchased format and actual source integrity.
MP3/WAV conversions use FFmpeg without a shell, with a protocol allowlist, bounded
processing, output size limits, audio signature/duration checks and temporary cleanup.
Full-length purchase files are separate from the public 30-second preview.

Stems are excluded from the current project scope and seller form. New offers containing
stems are rejected by the API. Legacy records remain readable, with sales disabled;
adding a real stems upload/delivery workflow is deferred.
Historical paid orders without a verifiable source/offer snapshot fail closed rather
than guessing which file to deliver. They require an explicit data recovery procedure.

Mercado Pago webhooks validate their signed manifest, then reconcile the payment resource
against the recorded order, seller, amount and MXN currency. Refund/dispute states remove
download access. Checkout retries preserve the frozen quote and preference idempotency;
responses arriving after logout/account changes cannot redirect an old session.
Public creator names respect profile privacy. Strings render as React text; IDs are
encoded; download links accept only the current origin and the matching order route.

## Verification and remaining external work

Meaningful coverage includes public/private catalog boundaries, real MP3 conversion,
native WAV delivery, incorrect-format and other-buyer denials, file integrity, source
retention, listing changes, signed-event mismatch, refunds and UI account isolation.
`tests/marketplace-unified.spec.ts` exercises the real local API in desktop/mobile;
`tests/creator-store.spec.ts` covers guest discovery/player/detail and the sign-in gate.
See [the exact verification record](MARKETPLACE_VERIFICATION.md), the diagnostic
report and dated changelog for run results, including the corrected upload fixture.

Local operation now uses native PostgreSQL 16.15 with the verified JSON import.
Fresh migrations 001-029, upgrade 028 to 029, source-retention races and backup/restore
passed; see [PostgreSQL local](POSTGRES_LOCAL.md). Mercado Pago sandbox end-to-end
seller/buyer checkout and webhook reconciliation, legal license review,
transactional email, shared process throttling and public deployment remain separate
work. Mercado Pago external account setup remains a sandbox prerequisite; live billing is disabled.
