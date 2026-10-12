# QA Bots (local only)

Run the repeatable role and interaction checks with:

```sh
npm run test:qa-bots
```

These are deterministic Playwright test agents, not autonomous production users.
The suite checks backend authorization and admin review rules, creates disposable
creator accounts for browser journeys, opens separate browser contexts for two-user
friend and chat interactions, exercises audio upload, account settings and profile
menus, verifies Home media decoding, and approves a pending catalog item through an
API-backed admin browser session on desktop and mobile.
The visual theme-route bot visits every module URL in dark, light and custom RGB at
desktop/mobile sizes and saves 126 screenshots under `artifacts/theme-route-audit/`.
Backend tests generate seven supported audio source formats, verify MIME/signatures
and AAC/M4A derivatives, and reject malformed media. The direct chat journey verifies
message delivery and online/offline presence between two independent accounts.

The E2E API runs with a temporary JSON data directory, bootstraps a test-only admin
identity, and removes the directory when the test server exits. Creator identities
and uploaded fixtures are generated for each run. The admin fixture credential in
`scripts/e2e-admin.ts` is valid only against that loopback test server and is not a
production secret. The suite does not read or modify accounts from
`npm run local:qa-accounts`, the developer's normal local database, or any hosted
environment. Do not point this suite at production. It is functional regression
coverage, not a load or penetration test.

Playwright screenshots, traces and the HTML report are written under `artifacts/`.
To run only the two-account messaging journey, use `npx playwright test
tests/chat.spec.ts`.
