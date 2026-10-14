# BeatVault Marketplace: Seller Rules and Beat Listing Form

**Status:** Product and compliance draft, not a contract or legal advice
**Version:** 0.1 · 2026-10-12
**Scope:** Beats first. Sample libraries and one-shots require additional pack-specific rules before sale is enabled.

## 1. Product boundary

BeatVault currently supports audio uploads, moderation, and public discovery of approved Beats and One-shots. It does not yet sell downloads, issue licenses, collect payment, calculate tax, or pay creators. A listing marked `ready for review` is not a purchasable offer. Do not display a Buy button or imply that a customer has acquired rights until the offer, immutable license record, checkout, and delivery are implemented and tested.

USD is the marketplace reference currency. MXN/EUR display conversions are estimates, not checkout or seller-settlement quotes.

## 2. Seller rules

Creators submitting a commercial listing must:

1. Be authorized to act for the account and accept the current seller rules. Age, identity, tax, and payout requirements must be confirmed with the payment provider before collecting sensitive information.
2. Own or control, or have written permission for, every musical composition, sound recording, performance, sample, loop, vocal, artwork, and other element they submit or authorize BeatVault to use for preview, display, promotion, licensing, and delivery.
3. Disclose co-writers, producers, performers, publishers, labels, and other rightsholders whose permission, credit, or revenue share may apply. A seller must not offer more rights than they control.
4. Disclose all third-party samples and loops. Identify the source and license, and provide proof when requested. A library license may permit incorporating a sound into a new composition while prohibiting redistribution of the sound in isolation; sellers must check the actual terms. Uncleared commercial samples, copied beats, leaked material, and content that only claims “fair use” are not eligible for sale.
5. Keep rights evidence and collaborator split agreements. Upload evidence privately only through an approved secure workflow; BeatVault must not ask sellers to publish private contracts or expose personal data in listing descriptions.
6. Use accurate titles, genre/style tags, credits, explicit-content status, preview, artwork, deliverables, and license descriptions. Do not impersonate artists or use misleading “type beat” metadata that suggests endorsement.
7. Only promise deliverables that are uploaded, readable, and actually included. A preview is not the untagged master. Stems, track-outs, project files, or licenses must be described explicitly.
8. Respond to rights complaints and cooperate with review. BeatVault may pause a listing while a credible ownership or safety dispute is reviewed. Repeated or deliberate infringement can lead to removal or account action under final platform terms.

## 3. Beat listing form

The intended seller form is grouped into steps. Required fields are marked `Required`; optional production metadata must not block a listing.

### A. Public listing

- **Beat title** — Required; 3-100 characters; no deceptive artist impersonation.
- **Description** — Required; 20-2,000 characters; describe mood, instruments, and included deliverables without promising rights that are not in the selected license.
- **Primary genre and style tags** — Required; one genre and up to 8 tags.
- **Artwork** — Required; square JPG/PNG, recommended 3000 × 3000 px, sRGB; seller confirms they have display and promotional rights.
- **Explicit content** — Required yes/no.
- **BPM and musical key** — Optional; informational only, never required to publish.

### B. Audio and delivery

- **Watermarked/tagged preview** — Required for discovery; only the preview may be public before a purchase.
- **Un-tagged WAV master** — Required for an offer that includes WAV; WAV format, sample rate and bit depth are disclosed to the buyer.
- **MP3 file** — Optional offer deliverable; format/bitrate disclosed.
- **Stems/track-outs ZIP** — Optional; list what is included, total size, and file format. Do not promise DAW project files unless included and tested.
- **Version and replacement policy** — Required before commerce: buyers must know whether later file updates are included.

BeatVault must store public preview files separately from private paid deliverables. A seller cannot make a delivery file public by mistake. Archive validation, malware scanning, extraction limits, file-size limits, and download authorization are release blockers for paid bundles.

### C. Rights and provenance (private review data)

- Seller rights basis: `created by me`, `created with collaborators`, or `licensed/authorized third-party elements`.
- Composition ownership and sound-recording/master ownership, each as percentage shares totaling 100% where known.
- Contributors: legal/display name, role, contact handled privately, agreed share, and confirmation that permission/split evidence exists.
- Samples/loops: `none`, `original recording`, or `third-party licensed`; for third-party elements collect source/provider, license type, permitted commercial use, redistribution restrictions, and optional private evidence attachment.
- Interpolations, vocals, performances, AI-generated or AI-assisted elements: yes/no plus disclosure and confirmation of applicable permissions/terms. These answers flag review; they do not by themselves prove clearance.
- Rights declaration: seller confirms they have authority for the exact preview, artwork, files, and license grants they submit.

If rights are unclear, the listing remains a draft or is returned for clarification. A checkbox is not a substitute for a valid license or collaborator agreement.

### D. License offer(s) (USD)

Each offer must define, in plain language and in a versioned license document:

- Offer label and license class: non-exclusive, exclusive, or custom. Do not offer exclusive licensing until the platform can prevent new sales and clearly explain the treatment of prior non-exclusive licensees.
- Price in USD cents; discounts must resolve to a visible final price before checkout.
- Included file formats and whether tagged/untagged.
- Permitted use: number of new songs/projects, commercial use, distribution platforms, monetization, live performance, synchronization, and advertising use.
- Limits, if any: streams, sales, term, territory, or other measurable caps. “Unlimited” must be explicit rather than assumed.
- Credit/attribution requirements; ownership and publishing treatment; collaborator credits/splits; Content ID and fingerprinting restrictions; transfer, sublicensing, resale, and sample-pack restrictions.
- Refund/cancellation and file-update terms, consistent with applicable law and the payment provider.
- Acceptance record: exact license version, offer ID, buyer, timestamp, and checkout/payment reference. Keep the receipt downloadable for both parties.

BeatVault should launch with a small set of lawyer-reviewed, clearly named templates rather than letting each seller publish contradictory legal language. Until then, save license terms as drafts and do not sell.

### E. Final confirmation

Required checkboxes should separately confirm:

- I control or have permission for all rights needed to submit and license these exact materials.
- I disclosed collaborators and third-party samples/loops and will not redistribute restricted sounds in isolation.
- My public description, offer, price, and deliverables are accurate.
- I reviewed the selected license and understand that BeatVault's preview/display permission is separate from the buyer's license.
- I accept seller rules version `X`; store acceptance timestamp, account, listing, and document version server-side.

The seller can save a draft or submit for review. Submission is not a sale or a guarantee of approval.

## 4. Review and complaint workflow

1. Automated checks: required fields, audio/artwork formats and limits, archive safety, duplicate hashes, declared rights fields, and absence of public delivery links.
2. Human review: clear preview, metadata, artwork, deliverables, rights flags, collaborator completeness, and license consistency.
3. Decision: approved for discovery, needs changes with a specific reason, or rejected/paused for a documented policy reason. Record reviewer, time, reason, and policy version in the audit log.
4. Rights report form: reporter identity/contact, listing URL/ID, exact allegedly infringing material, ownership/authority statement, good-faith statement, signature, and optional evidence. Restrict access to this information and define the response/counter-notice process with counsel before launch.
5. Preserve records relevant to a dispute; avoid publicly exposing private evidence. A removal does not automatically determine ownership or legal liability.

## 5. Sample-pack and one-shot extension

Before selling sample libraries, add pack manifest, number of files, formats, loop/one-shot classification, BPM/key only where reliable, source/licensing provenance per included third-party asset, redistribution-in-isolation restrictions, preview-vs-download separation, archive scan, and a clear end-user license. Do not reuse the beat form unchanged for sample packs.

## 6. Implementation gates

1. Product/legal review: choose launch countries, seller eligibility, standard license language, complaint/counter-notice rules, privacy and retention periods, tax responsibilities, refund rules, and payment-provider model.
2. Data/API: persist listing rights declarations, collaborators, offers, and immutable license versions server-side; add audit history and private evidence access controls.
3. Delivery: upload private master/stem bundles, validate and scan archives, issue purchase entitlements, and produce receipts/license copies only after verified payment.
4. Commerce: select payment provider, seller onboarding/payout flow, fees, currency settlement, taxes, refunds, disputes, and webhook/idempotency protections.
5. QA: test seller and buyer accounts end-to-end, including failed payments, repeated webhooks, refunds, exclusive offer races, revoked listings, and unauthorized download attempts.

## 7. Reference pattern and legal review

This draft borrows product patterns, not contract wording, from marketplace documentation: sellers retain responsibility for rights and delivery; previews and paid files are separate; sellers configure license offers; and prohibited/complaint processes are explicit. BeatStars documents multi-file track uploads and seller-configured license prices. Airbit requires sellers to own or be authorized to grant rights in all submitted elements. The U.S. Copyright Office distinguishes musical compositions from sound recordings. Mexico's current Federal Copyright Law separately defines phonograms and producer rights. These sources do not establish that one template is valid in every country.

Before public sales, have Mexican counsel review the platform rules and license templates, and review other target markets before enabling them. This document is an internal product draft only.

### Sources

- BeatStars, [How Do I Upload Tracks?](https://help.beatstars.com/hc/en-us/articles/1260802609630-How-Do-I-Upload-Tracks)
- BeatStars, [Terms of Service](https://www.beatstars.com/terms-of-service)
- Airbit, [Terms and Conditions](https://airbit.com/terms)
- U.S. Copyright Office, [Musical Compositions and Sound Recordings (Circular 56A)](https://www.copyright.gov/circs/circ56a.pdf)
- U.S. Copyright Office, [Fair Use FAQ](https://www.copyright.gov/help/faq/faq-fairuse.html)
- Mexico Chamber of Deputies, [Federal Copyright Law (current consolidated text)](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFDA.pdf)
