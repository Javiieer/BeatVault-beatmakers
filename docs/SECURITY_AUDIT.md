# Security audit and remediation

Original review: 2026-10-14; source status checked: 2026-10-23

This is a defensive code/configuration review of the local BeatVault repository. It
was not an external penetration test, a live Stripe test, or a production
PostgreSQL deployment. Findings distinguish verified code defects from launch
readiness gaps; a green test suite is not a security certification.

## Current status checked - 2026-10-23

The supplied audit summary said it had not run tests or dynamic probes. This follow-up
checked current source and ran PostgreSQL 16 QA, targeted tests and typecheck. Results
are limited to a disposable local environment; they are not a hosted migration rehearsal,
penetration test or security certification.

| Finding | Verified status | Evidence | Next action |
|---|---|---|---|
| P0 - PostgreSQL and recovery | Confirmed and partly verified. Production config requires PostgreSQL; local mode defaults to JSON, whose file writes are not transactional across processes. QA waits for and asserts migration 030. | server/config.ts, server/repository.ts, scripts/postgres-qa.ts, migrations 001-030. Clean PostgreSQL 16 migration and database/upload backup-restore passed on 2026-10-23. | Rehearse an existing-volume upgrade and an off-host restore. Verify the hosted pilot runs production mode and PostgreSQL. |
| P0 - Transactional email | Pending and deferred. Tokens are hashed, random, one-time and expire after 30 minutes; request responses are generic. There is no delivery provider. Development tokens are gated to non-production. | server/auth.ts, server/config.ts, server/index.ts, docs/ADMIN_PROVISIONING.md. | Revisit provider, privacy, retention and cost before implementing delivery. Never expose development tokens publicly. |
| P0 - First administrator | Partially implemented. A production-only PostgreSQL maintenance command and procedure create/recover an admin transactionally; current tests use a mocked Pool. | server/production-admin.ts, server/admin-bootstrap.ts, server/production-admin.test.ts, docs/ADMIN_PROVISIONING.md. Targeted tests passed; no real database or hosted rehearsal was done. | Exercise provisioning and recovery against disposable PostgreSQL with secrets injected through a controlled secret store. |
| P0 - Media processing | Partially mitigated. MIME/signature checks precede upload; FFmpeg preview processing has a 60-second timeout and 4 MiB output cap. There is no OS CPU/memory isolation, and signatures do not validate the whole source. | server/uploads.ts, server/media-preview.ts, docs/POSTGRES_QA.md. PostgreSQL QA covers preview-gated review and backup/restore. | Add isolated decoding with resource limits and robust parsing or malware scanning for seller evidence. |
| P0 - Payments | Safeguards confirmed. Only Stripe test keys are accepted; production rejects Stripe configuration, and the account-plan API reports billing disabled. Full test-mode purchase/refund/dispute reconciliation is not proven. | server/config.ts, server/config.test.ts, server/index.ts. | Keep real-money operations disabled; complete test-mode scenarios and commercial/legal decisions before commerce. |
| P1 - Evidence, headers and monitoring | Partially mitigated. Seller evidence is private, sent as an attachment with nosniff; no document scanner/parser was found. Caddy sets nosniff, Referrer-Policy and Permissions-Policy. API defaults set nosniff, X-Frame-Options and Referrer-Policy; global CSP and operational error/disk monitoring need review. | server/index.ts, server/seller-evidence-upload.ts, Caddyfile. | Scan evidence before staff use and verify browser CSP plus error, abuse and disk alerts. |
| P1 - Multiple API instances | Confirmed limitation. Rate limits and realtime events are process-local; this is acceptable only for a single API instance. | server/security.ts, docs/ARCHITECTURE.md. | Keep a pilot on one API instance; add shared storage/pub-sub only if deployment grows beyond one. |
| P2 - Commerce, plans and copyright matching | Deferred / incomplete. Policies remain drafts, recurring billing is disabled, and no audio-matching provider is integrated or selected. | server/index.ts, docs/MARKETPLACE_POLICY_DRAFT.md, docs/COPYRIGHT_MATCHING_PROPOSAL.md. | Revisit after the core pilot. Review terms, licenses, taxes, refunds, disputes, quotas and provider privacy/cost before enabling sales or submitting audio. |

## Findings

### SEC-01: shared reverse-proxy address exhausted authentication limits

**Severity:** High availability risk in the Oracle Compose deployment.
**Status:** Fixed.

Authentication throttles previously keyed on Node's socket peer address. In the
documented Caddy-to-API topology, the peer is Caddy, so all visitors could share
the same five-per-minute login bucket. The same source-key pattern affected
registration and recovery requests.

The API now accepts `X-BeatVault-Client-IP` only when
`BEATVAULT_TRUST_PROXY_HEADERS=true`; Caddy overwrites that header with the
connecting client's address, and the production Compose profile enables this
only for its private API. Invalid header values fall back to the socket peer.
Never expose the API directly while trusting proxy headers. Regression tests
cover trusted/untrusted headers, invalid values, and separate rate-limit buckets
for visitors behind one proxy.

### SEC-02: startup reconciliation deleted marketplace rights evidence

**Severity:** High data-integrity risk for seller evidence.
**Status:** Fixed.

`reconcileUploads` retained known audio and preview paths but did not add
seller-rights evidence paths to its known set. Its orphan cleanup therefore
treated `private-marketplace-evidence` files as unreferenced and deleted them on
API startup. Reconciliation now loads evidence for saved listing drafts and marks
those paths as retained. A regression test uploads a PDF, runs reconciliation,
and verifies the file survives.

### SEC-03: throttles are process-local

**Severity:** Medium operational/security limitation.
**Status:** Sessions fixed; shared throttling remains open.

Authentication sessions now persist token and CSRF-token hashes, expiry, and
revocation state through the local JSON and PostgreSQL repositories. Restarting the
API no longer logs users out. Password changes revoke other sessions across service
instances. Rate-limit buckets still live in process memory (`server/security.ts`),
so multiple API instances do not share throttle state; move throttles to a shared
store before horizontal scaling.

### SEC-04: seller evidence validation is not malware/content scanning

**Severity:** Medium defense-in-depth gap.
**Status:** Open; documented go-live hardening.

Evidence upload checks size, declared MIME and a short file signature, then stores
the original PDF/JPEG/PNG. Downloads are owner/staff scoped and forced as
attachments, which reduces browser exposure, but does not prove a document is
well-formed or benign. Add malware scanning and robust format parsing/sanitization
before staff download or any future inline display. Existing tests check valid
signatures and MIME mismatch, not polyglots or malicious documents.

### SEC-05: public launch services are intentionally incomplete

**Severity:** Release blocker, not a confirmed exploit.
**Status:** Maintenance command implemented; hosted rehearsal remains open.

Production email delivery for account verification and password recovery is not
configured. A production-only maintenance command now provisions the first admin
or recovers an existing admin password through PostgreSQL; it has not been
rehearsed on a hosted deployment. Stripe live keys are rejected: Connect and
checkout are test-mode slices, and a live payment/tax/refund/dispute operation has
not been validated. Keep sales and public launch disabled until these workflows,
legal terms, and an off-host PostgreSQL migration/restore rehearsal are complete.

### SEC-06: upload resource and image-validation controls

**Severity:** Medium availability/data-integrity risk.
**Status:** Partially mitigated; deployment hardening remains open.

Audio and artwork uploads require the session CSRF token, share a per-account
two-job concurrency cap within one API process, and perform an early quota check
before FFmpeg plus the existing persistence-time quota check. Artwork is only retained
after FFmpeg successfully decodes it; a valid image whose WebP derivative is not
smaller or exceeds the derivative budget falls back to the master. These controls
reduce accidental load and malformed-image exposure, but the concurrency cap is not
shared across API replicas, FFmpeg is not OS-sandboxed here, and deployment still
needs isolated media processing, monitoring and abuse controls.

### DEP-01: deployment guide lagged behind database migrations

**Severity:** Medium deployment-readiness risk.
**Status:** Fixed in documentation.

The Oracle guide now reflects migration 023 for fresh database initialization.
Initialization scripts do not run again on an
existing PostgreSQL volume; updates still need a deliberate, backed-up schema
migration procedure.

## Existing controls observed

- Passwords use salted scrypt hashes; session and recovery tokens are random,
  recovery tokens are stored hashed and expire.
- Session cookies are HttpOnly; production requires Secure cookies, HTTPS CORS
  origins, PostgreSQL and demo accounts disabled.
- Mutating authenticated routes require CSRF; CORS uses an explicit origin list.
- Admin/community-manager authorization is enforced server-side; object access
  checks ownership, and buyer downloads require a paid order for that buyer.
- JSON, multipart upload, media range and Stripe webhook bodies have bounds;
  audio/evidence paths reject traversal; webhook signatures are verified and event
  IDs are persisted/deduplicated.
- Audio/artwork uploads require CSRF, enforce a bounded per-account in-process
  concurrency count, and avoid expensive conversion when known quota is exhausted.
- Artwork originals remain private until the associated catalog entry is published;
  file storage keys are resolved beneath the configured upload root.
- SQL values use parameters. No unsafe HTML injection sink was found in the
  frontend scan performed for this review.

## Verification - original review, 2026-10-14

- `npm test -- --pool forks --maxWorkers=2`: 51 files and 250 tests passed. The
  default high-parallel Windows run had hit one test timeout and two transient JSON
  temporary-file rename `EPERM` errors; the bounded-worker full run passed.
- `npx vitest run server/artwork.test.ts server/security.test.ts server/uploads.test.ts
  server/api.test.ts --pool forks --maxWorkers=1`: 4 files and 31 tests passed.
- `npx playwright test tests/persistent-uploads.spec.ts --project=chromium`: 2 tests
  passed, desktop and mobile, including upload of 4K artwork and WebP card delivery.
- `npm run build`, `npm run lint`, `npm run typecheck`, and
  `npm audit --audit-level=high`: passed; zero reported dependency vulnerabilities.
- `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities.
- `npm audit --audit-level=high`: zero reported vulnerabilities.

Dependency audit results reflect the lockfile and registry data available during
this review. Re-run them before deployment. The earlier 99-case browser suite was
not rerun after these backend-only remediations.
