# Automated diagnostics

Run from the repository root:

```sh
npm run diagnose
npm run diagnose:full
npm run test:security
```

`diagnose` checks TypeScript, ESLint, unit/integration tests, isolated HTTP security
probes, production bundling and npm dependency advisories. `diagnose:full` also
checks every inventory route on desktop, tablet and mobile with Playwright.
Install the browser once with `npx playwright install chromium` if needed.

Results are written to ignored `artifacts/diagnostics/latest.md` and `latest.json`.
Every run also retains timestamped logs, machine-readable test assertions and the
dependency advisory payload. A running report stays `complete: false` until all
checks finish. Failure does not stop later checks from collecting evidence.
Playwright saves screenshots and its HTML report under `artifacts/`.

Broken checks, timeouts, unavailable dependency audits and high/critical dependency
advisories produce a nonzero exit code. Lower-severity advisories produce a warning.
A normal run explicitly marks browser coverage as skipped; it does not pretend it ran.
No automatic dependency upgrades or source repairs are performed by the diagnostic.

## Security scope

The security probes start the actual API on a random port bound to `127.0.0.1`.
Vitest setup forces disposable JSON storage and temporary upload directories.
Accounts, projects and audio fixtures belong to those tests. There is no target URL
option, no production scanning, no external brute force and no real user data.

The probes check anonymous access, account isolation, admin permissions, CSRF,
CORS rejection, body size limits including chunked transfer, malformed JSON,
private catalog visibility, publication privileges, forged audio, byte ranges,
media headers, login throttling and logout invalidation.

Frontend route tests intercept API requests to exercise the explicit offline/demo
boundary. They detect uncaught JavaScript errors, horizontal overflow, navigation
regressions and selected interactions. Separate desktop/mobile authenticated tests
start a disposable JSON-backed API on 127.0.0.1:45174 and use Vite's proxy on 5187.
They cover real WAV upload, lost-response retries, reload without browser cache,
playback/download and two-account draft/audio isolation. They never use developer
data directories. Neither test server reuses an occupied port.

`tests/site-audit.spec.ts` additionally decodes every Home demo image and runs an
actual creator submission/admin approval against the disposable E2E API at
desktop/mobile sizes. The
general route sweep intentionally tests many pages offline; its Admin screenshot is
therefore the disconnected fallback, not evidence of an authenticated admin session.

## Automatic execution

`.github/workflows/diagnostics.yml` runs the full diagnostic for pushes, pull requests
and manual dispatch, and retains reports as workflow artifacts even on failure.
It becomes active when that file is committed and pushed; creating it locally does
not configure or execute a remote workflow. No scheduled job has been installed.

## Interpretation

Passing tests cover the assertions that exist, not every possible vulnerability.
TODO/FIXME/HACK markers are source hints, not verified bugs. Module readiness comes
from the maintained inventory. Known issues remain in `BUGS.md` and
`SECURITY_FINDINGS.md`, including those outside the current automated coverage.
Postgres tests currently use a mocked SQL client; this is not database integration QA.
