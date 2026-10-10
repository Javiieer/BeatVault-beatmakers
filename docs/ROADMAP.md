# Roadmap

Current priority: complete one reliable creator audio workflow before expanding modules.
See RELEASE_SCOPE.md for the decision on every section.

Home's browser-local composer/profile mirror and the Friends request foundation are
implemented as supporting creator surfaces. Keep their local-only boundaries honest;
do not let them displace review and published audio discovery from the next milestone.

Oracle VPS Compose/Caddy deployment scaffolding is now present for a single-machine
private pilot. It is not public-launch ready; follow docs/DEPLOY_ORACLE_VPS.md and
close the email, admin provisioning, Postgres restore, and media-validation blockers.

## 1. Diagnostics and scope - implemented

Shared module inventory, focused navigation, repeatable code checks, local HTTP
security probes, browser route coverage and a GitHub workflow definition.
Results live in artifacts/diagnostics, with unresolved issues in BUGS.md.

## 2. Authenticated audio lifecycle - implemented with local JSON

Owned audio/cover references, reload playback/download, account cache isolation and
lost-response retries have desktop/mobile coverage. Retrying after reload requires
file reselection. Production storage and public media remain separate work.

## 3. Publication and discovery

The local admin review queue and published Beat catalog now use server records.
Next: validate Postgres migrations/concurrency, then create a separate processed
preview artifact with access rules that never expose the private original.

## 3a. Social foundation - limited local scope

Home posts are account-scoped to one browser and mirrored to the owner's profile.
Friends discovers opted-in public profiles and persists requests/connections in the
local API. PostgreSQL requires migration 006. Notifications, public post distribution,
chat, blocking/reporting and friend-based feed ranking remain future work.

## 4. Private pilot readiness

Real Postgres integration and concurrency tests, durable sessions, email delivery,
backup/restore drills, deployment configuration and authenticated browser coverage.

## 5. Commerce - deferred

One Marketplace flow, licensing, checkout and payouts. Store merges into Marketplace.
Plans follow an implemented purchase model, not an isolated pricing screen.

## 6. Expansion - deferred

Shorts, expanded community and collaboration workflows after catalog validation. AI and distribution
require separate evidence of demand and implementation scope.

Historical phase numbering and older "frontend only" limits remain in CHANGELOG.md
and phase reports; they do not describe the current repository state.
