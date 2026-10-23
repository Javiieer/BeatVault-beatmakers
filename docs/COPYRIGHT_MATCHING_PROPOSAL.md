# Potential copyright-match analysis — technical proposal

**Status:** Discovery proposal only. No provider is selected or connected. No credentials have been requested or used, and no Beat audio or seller evidence has been sent to a third party.

## Goal and limits

Explore whether an opt-in or clearly disclosed external audio-fingerprinting service could flag possible overlaps between a seller's Beat and reference recordings available to that provider. The result would be a lead for a trained human reviewer to examine with the seller and supporting rights information.

A match is not a finding of infringement or proof of ownership. No match does not prove that a Beat is original, properly licensed, or free of infringement: a provider can have incomplete reference coverage, and systems can return false positives or miss altered, short, unpublished, or otherwise unindexed material. A result must never be described as a legal clearance or guarantee.

## Candidate providers to evaluate

These are research leads, not recommendations or selected vendors:

| Candidate | Publicly documented approach | Questions for vendor diligence |
| --- | --- | --- |
| ACRCloud | Its [Identification API](https://docs.acrcloud.com/reference/identification-api/identification-api) accepts audio or a generated fingerprint. Its [file-scanning API](https://docs.acrcloud.com/reference/console-api/file-scanning/file-scanning) documents fingerprint scanning, callbacks, and EU, US, and APAC container regions. | Which reference databases are covered and licensed for this use? Can BeatVault use only extracted fingerprints? What are retention/deletion rules for source files, fingerprints, results, and logs? Is regional processing/storage guaranteed by contract? What are minimum commitments, per-minute/per-file charges, quotas, and false-match review tools? |
| Pex / Vobile | Pex's [Attribution Engine](https://pex.com/products/attribution-engine/) describes an SDK that sends fingerprint hashes for matching. Its [Discovery API documentation](https://docs.api.pex.com/) describes asset upload and match results. | Confirm current contracting entity after Pex's integration into Vobile, registry scope and geographic rights, whether fingerprints or media can be retained or used to improve services, deletion and data location terms, supported matching use cases for unpublished beats, pricing, minimums, and support SLAs. |
| Audible Magic | Its [AudioMagic Toolkit documentation](https://support.audiblemagic.com/audible-magic-toolkit) describes local fingerprint generation followed by an identification request to its service; configuration is supplied by Audible Magic. | What current SDK/API is available for a small creator marketplace? What source audio or fingerprint material leaves BeatVault? Which reference works and territories are covered? Obtain current security, privacy, retention/deletion, pricing, volume minimum, and support documentation directly from the vendor. |

Public documentation does not establish the commercial terms, reference coverage for BeatVault's needs, or legal basis to submit creator audio. Pricing is unknown and should be requested in writing. Product names and capabilities may change; revalidate before a vendor decision.

## Proposed flow if approved later

1. Add a clear seller-facing disclosure and obtain explicit consent before any fingerprint leaves BeatVault. Explain the purpose, provider, fields sent, processing region, retention, deletion request path, and whether opting out affects listing review.
2. For a first pilot, process only the submitted Beat master or a seller-selected excerpt after upload. Generate the provider's fingerprint locally when supported. Do not send private rights documents, buyer data, account credentials, or full audio where a fingerprint-only path meets the use case.
3. Keep provider credentials server-side in a secret manager. Send an asynchronous, idempotent job with an opaque internal ID. Do not expose raw provider keys, private storage URLs, or provider credentials to the browser.
4. Persist the source asset's local cryptographic hash, provider/job identifier, submission time, fingerprint version, status, limited match metadata, and reviewer outcome. Avoid duplicating the audio or evidence in the result store. Define deletion and expiry with the provider before launch.
5. Show results to authorized staff as “possible match — human review required.” Present provider references and matched segments only when contractually permitted. Do not auto-reject, hide, publish, monetize, issue a strike, or accuse a seller solely because a provider returned a match.
6. Let a reviewer compare the result with the submitted work, seller explanation, collaborator information, and license evidence. Escalation, takedown, appeals, notices, and counter-notices need a counsel-reviewed process and decision log.
7. Measure false positives, false negatives, latency, coverage gaps, provider errors, and appeals during a limited pilot. Keep a manual review path and a clear opt-out/appeal policy.

## Integration boundary

If the project proceeds, isolate provider-specific code behind an interface such as `AudioMatchProvider.submitFingerprint`, `getJob`, and `deleteReference`. A background queue should retry safely, cap uploads, enforce consent, and mark the result stale when the seller replaces the Beat or changes relevant listing evidence. Store only the minimum provider response fields needed for an auditable manual review. Keep commercial listing approval and public catalog publication as separate workflow states.

## Required approval before implementation

Before selecting or connecting any provider, confirm the provider and product, privacy notice and consent language, data-processing terms, reference catalog and permitted uses, processing/storage region, retention and deletion commitments, current pricing and minimums, operational owner, and legal review. No credentials, integration, or audio submission should be used until those decisions are explicit.
