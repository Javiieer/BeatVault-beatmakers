# Phase 5 Product Catalog and Monetization Plan

**Status:** Phase 5.3 complete; sales phases planned
**Rule:** Define the product model before implementing sales

## Immediate Product Cleanup

The current example projects should be removed from the creator workspace before the next product-facing pass. Development fixtures may remain isolated from user-visible data.

The FL Studio demo should no longer appear as ordinary individual user assets. It should be represented as a sound-pack bundle fixture:

- Bundle name: `FL Studio Demo Pack`
- Package type: `Sound Pack`
- Archive label: `RAR` or `ZIP`
- Contents summary: kicks, snares, hats, 808s, toms, and related sounds
- Tags: `bundle`, `sound-pack`, `demo`, `rar` or `zip`
- Individual sounds may be shown as bundle contents, not as unrelated creator uploads

The archive label is descriptive metadata for the prototype. BeatVault must not claim that a real RAR/ZIP file exists until one is actually stored.

## Library Navigation Taxonomy

The Library should be organized into explicit sub-sections:

```text
Library
├── Beats
├── Sound Packs
└── Sounds
```

### Beats

Finished or work-in-progress beat references, with tempo, key, genre, preview, creator, and license state.

### Sound Packs

Grouped products containing multiple sounds, loops, MIDI, presets, or stems. Packs need contents, archive format, size, version, creator, license, and availability metadata.

### Sounds

Individual one-shots, loops, vocals, FX, instruments, and other searchable assets, whether free, owned, or licensed.

Navigation categories must not imply that an item is downloadable or owned. Availability and entitlement are separate fields.

## Phase Sequence

### Phase 5.1: Catalog Cleanup and Taxonomy

- Remove user-visible example projects.
- Isolate development fixtures.
- Add Library sub-navigation.
- Normalize `beat`, `sound-pack`, and `sound` product/content types.
- Represent the FL Studio demo as a bundle fixture with explicit archive metadata.
- Preserve local fallback behavior.

**Exit:** Library categories are clear, demo content is not confused with user content, and no item claims ownership or download access incorrectly.

**Delivered (2026-09-03):** The visible creator workspace starts without example projects. The FL Studio fixture is one typed Sound Pack with descriptive archive metadata and grouped contents. Library sections use hash query state and preserve existing search, sort, favorites, status, previews, fallback, and local persistence.

### Phase 5.2: Ownership and Entitlement Model

**Status:** Complete (2026-09-06)

`src/domains/entitlements/` defines subscription lifecycle, feature entitlements, product ownership, product entitlements, licenses, preview/download access, quotas, usage, and typed decision reasons. Its pure decisions are intentionally not connected to the local Library or authorization endpoints. Public preview may be declared by a product; downloads require explicit product entitlement, active license, and remaining quota. Subscription states never grant the catalog automatically. Demo and included ownership are explicit and distinct. This is not production authorization.

### Phase 5.2: Ownership and Entitlement Model

Define these independently:

- Subscription status.
- Feature entitlement.
- Product entitlement.
- License entitlement.
- Download permission.
- Preview permission.
- Storage quota.
- Creator ownership.

Example:

```text
Subscription = Creator plan active
Feature access = Can use advanced filters
Product entitlement = Owns Pack A
Download permission = 3 remaining downloads
License = Personal commercial license
```

An active subscription must never automatically grant every BeatVault asset. Access may be limited to previews, included collections, quotas, or separately purchased products.

### Phase 5.3: Product and License Catalog

**Status:** Complete (2026-09-06) as a local typed catalog model

- `src/domains/products/` defines product kinds, lifecycle/visibility, versions, bundle contents, draft license terms, offers, preview/download policy, and non-sensitive purchase/license references.
- Pure publication and availability decisions reject incomplete metadata, preview policy, Sound Pack archive metadata, and implicit commercial/exclusive terms.
- Archive format is descriptive metadata only; preview remains separate from entitlement, purchase, and download authorization.
- Refunds, takedowns, ownership transfer, and creator revenue rules remain design inputs for later phases.

### Phase 5.4: Sales Planning

- Compare subscription-only, marketplace-only, and hybrid models.
- Define plan entitlements without bundling all content by default.
- Define product pricing and creator revenue split.
- Define promotion and discount interaction.
- Select billing provider.
- Design checkout, receipts, tax, refund, and audit flows.

No payments should be implemented before this phase is approved.

### Phase 5.5: Implementation

- Admin product catalog.
- Entitlement service.
- Checkout/billing adapter.
- Secure download authorization.
- Creator sales reporting.
- User purchase library.

All sensitive decisions must be server-side and auditable.

## Decisions Required

- Should Sound Packs be downloadable archives, streamed collections, or both?
- Is RAR required, or should ZIP be the default for browser compatibility?
- Are demo packs visible to all users or only development environments?
- Are Beats and Sounds separate top-level routes or Library sub-routes?
- Which content is included in each plan?
- Which content always requires a separate purchase?
- Can a subscription include monthly download credits?
- Are credits reset monthly or accumulated?
- What happens to downloads after cancellation?
- Which licenses can creators offer?
- What is the creator revenue split?
- Who handles refunds and copyright takedowns?

## Explicit Non-Goals For Now

- Real checkout.
- Billing provider integration.
- Real archive downloads.
- Subscription-based access to the entire catalog.
- Creator payouts.
- Copyright enforcement automation.
- Production admin actions.
