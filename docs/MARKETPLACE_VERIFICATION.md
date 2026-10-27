# Marketplace local verification — historical snapshot, 2026-10-26

This verification record predates the provider switch to Mercado Pago on 2026-10-27.
Its Stripe-specific checkout assertions describe the previous implementation and do
not verify the current Mercado Pago checkout. Current payment coverage is tracked in
`server/mercadopago.test.ts`, the API fail-closed test, and `MERCADOPAGO_LOCAL_TESTING.md`.

Scope: Windows 11, one local JSON API process, FFmpeg/FFprobe installed, localhost
only. No live payment or production environment was exercised.

## Results

| Check | Observed result |
| --- | --- |
| TypeScript, ESLint, production build | Passed |
| Functional/unit/API/component suite | 374/374 passed in 72 files |
| Isolated HTTP security probes | 14/14 passed |
| npm audit | Zero reported advisories |
| Complete serial browser run | 107/108 passed; the desktop lost-response upload fixture exceeded its 5-second assertion budget while processing |
| Corrected upload fixture follow-up | 2/2 passed in desktop/mobile (43.7 seconds total) |

The upload fixture now waits for the actual server commit and the deliberately lost
browser response before checking its error state. It still verifies that retry does
not duplicate a record, audio/artwork survive reload, originals stay private, and
other accounts cannot read them. No application permission or assertion was removed.

The complete run is preserved at
`artifacts/diagnostics/2026-10-26T13-52-26-942Z/`. Its browser result remains **failed**;
it is not rewritten to hide the fixture failure. A complete clean single browser
run was not repeated after that test-only correction. The follow-up Playwright run
passed both affected cases. These combined results cover the 108 unique scenarios;
they do not claim stability under parallel workers or an external security audit.

The historical purchase HTTP composition test was included in the 374 passing tests.
It used the local API, real audio upload/preview, seller/CM/admin review, CSRF, and the
previous Stripe test adapter. It did not contact a Stripe account. It is not evidence
of Mercado Pago provider reconciliation.

## Corrections verified during integration

- Explore, My library and My purchases share one navigation entry. Legacy routes,
  back/forward state, saved audio after reload, public real-ID detail and private
  upload management passed desktop/mobile journeys.
- Guest stores have working public previews/details and an explicit sign-in boundary.
- Saved public details resolve independently of a failed bulk catalog read; unverified
  browser caches cannot supply them. Searches respect the API's 80-character limit.
- My uploads distinguishes loading, an API failure and an empty collection, with retry.
- Late initial Home reads preserve newly published own posts. Catalog interaction
  reads are cached/bounded; media posts/stories have a bounded upload-specific budget.
- Paid formats, source hash, license snapshot, source retention, refund states, strict
  download URLs and stale checkout/account-boundary responses have regression coverage.

## Remaining boundaries

Stems need real uploaded stems and a dedicated delivery workflow. Historical orders
without a verifiable snapshot cannot safely deliver files. Real Mercado Pago sandbox
checkout/onboarding/reconciliation, real PostgreSQL migration/restore QA, production
email/admin operations, shared throttling and public launch remain separate work.
See [local behavior and limits](MARKETPLACE_LOCAL.md).
