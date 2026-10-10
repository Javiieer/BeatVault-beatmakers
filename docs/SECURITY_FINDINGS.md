# Security findings

Reviewed 2026-10-09 against the local working tree. Resolved entries below have
regression coverage in targeted HTTP or unit tests. This register is
not a penetration-test certification.

| Finding | Severity | State | Evidence / action |
| --- | --- | --- | --- |
| SEC-004: rejected origins were echoed in CORS headers | Medium | Fixed | Denied responses omit allow-origin; probe asserts 403 and absent CORS grant. |
| SEC-005: JSON request bodies had no size bound | High | Fixed | 64 KiB byte limit for declared and chunked bodies; 413 regression checks. |
| SEC-007: public catalog exposed private drafts and review entries | High | Fixed | Visibility limited to published entries, owner or admin; two-account probes. |
| SEC-008: creator could request published/rejected status | High | Fixed | Generic catalog mutations reject moderation states; a separate admin-only, CSRF-protected review route accepts pending records and records the decision. |
| SEC-010: suffix/oversized media ranges produced invalid lengths | Medium | Fixed | Suffix calculation, end clamping and 416 errors verified against returned bytes. |
| SEC-011: media responses missed defensive headers and CORS | Medium | Fixed | Shared response headers, private cache policy and HEAD/CORS assertions. |
| DEP-001: three vulnerable transitive packages | High | Fixed in current lockfile | brace-expansion 5.0.12, source-map-js 1.2.2, undici 8.11.2; fresh npm audit returned zero known advisories. |
| OPEN-001: browser catalog/project caches are shared across accounts | High | Fixed in active creator workflow | Account/demo namespaces for catalog, projects and upload drafts. Keyed app state clears playback on logout; authenticated failures do not show cached lists. Two-account desktop/mobile coverage. Legacy unscoped data is untouched and not auto-imported. |
| SEC-013: catalog/audio ownership | High | Covered | Foreign original references rejected; edits cannot replace the original; private storage paths omitted from catalog. Preview/download still require the owner session. |
| OPEN-002: JSON mutations are read/modify/write without transaction isolation | High for multi-user use | Open | `server/store.ts`; concurrent writes can lose data. Use validated Postgres transactions/constraints or serialize JSON mutations before multi-user deployment. |
| OPEN-003: sessions and rate limits live only in process memory | Medium | Open | `server/auth.ts`, `server/security.ts`; restarts and multiple instances change their guarantees. Rate limits use the socket address; behind a reverse proxy, client-IP trust must be explicitly designed before scaling or opening registration broadly. |
| OPEN-004: file signatures are not full media validation | Medium | Open | `server/uploads.ts`; malformed files with accepted magic bytes need isolated decoding/processing before public media distribution. |
| OPEN-005: upload MIME policy permits unknown MIME types through fallback signature checks | Medium | Fixed locally | `server/uploads.ts` normalizes an explicit audio MIME allowlist, stores canonical MIME values and rejects unknown MIME types or mismatched container signatures. Regression coverage has not yet been run for this change. |
| SEC-014: stored media keys could resolve outside the upload directory if metadata was corrupted | Medium | Fixed locally | `assetPath` resolves and bounds each key to the configured upload root; regression assertion added to `server/uploads.test.ts`. Test suite not run in this cleanup pass. |
| SEC-015: public registration could trigger unbounded password hashing | Medium | Fixed locally | Registration is limited per socket address before scrypt; a security probe checks the configured threshold. |
| SEC-016: production could start with demo credentials or local storage defaults | High | Fixed locally | Production now requires explicit HTTPS CORS origins, Secure cookies, Postgres plus `DATABASE_URL`, and demo auth disabled. Oracle Compose supplies these settings. |

Authenticated originals remain owner-only. Approved catalog metadata is discoverable;
cross-account audio previews, payment processing and production deployment remain open.
Dependency vulnerabilities are recorded by each npm audit run, not copied here as
a permanent claim about a moving advisory database.
