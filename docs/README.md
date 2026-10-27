# BeatVault: current project handoff

Latest local consolidation and verification:
[CONSOLIDATION_STAGES.md](CONSOLIDATION_STAGES.md), including migration 030,
account favorites, independent review state, media formats and journey continuity.

Next work is ordered in [PRIORITIES.md](PRIORITIES.md). Start there before taking a
new feature so privacy, browser reliability and recovery stay ahead of expansion.

For the current technical architecture and the evolution from the initial discovery,
read [ARCHITECTURE_CURRENT.md](ARCHITECTURE_CURRENT.md). The August discovery report
is retained as a historical baseline.

Windows now starts the verified native local PostgreSQL 16.15 import. See
[POSTGRES_LOCAL.md](POSTGRES_LOCAL.md) for start/stop, migrations, QA, backups and
the retained JSON rollback state. Stems are deferred from current seller scope.

Current product audit: [functional journeys, findings and next milestones](PRODUCT_AUDIT_2026-10-26.md).
Use its acceptance criteria to close existing journeys before adding modules.

Start with [ROADMAP.md](ROADMAP.md) for current product direction, implementation
status, launch blockers, and next steps. Then read [RELEASE_SCOPE.md](RELEASE_SCOPE.md),
[BUGS.md](BUGS.md), [SECURITY_AUDIT.md](SECURITY_AUDIT.md), and the focused subsystem
references relevant to the task. `NEXT_STEP.md`, `PROJECT_OVERVIEW.md`, `PROGRESS.md`,
`SITE_AUDIT.md`, `SECURITY_FINDINGS.md`, and phase plans are dated historical snapshots;
do not follow their old implementation priorities without checking the roadmap.

The current product is a React frontend with a local Node API, durable session support,
JSON/Postgres adapters, private file uploads, moderation, a seller-review workflow, and
test-mode Mercado Pago Split 1:1 checkout for Beats. Authenticated Home posts and
independent expiring stories persist through JSON/PostgreSQL repositories; profile posts
read the same server records. Amigos supports opt-in public creator discovery and
persisted friend requests in the local API.
Creator profiles include persisted metadata, bundled cover/avatar choices, project
cards, Publications and optional public links. Public metadata is separate from
account credentials. The first-release priority remains reliable audio publication
and discovery, not broad social features.
It is not ready for a public production launch. Older phase reports are historical;
their statements that there is no backend, authentication or test suite no longer apply.

- Product decisions: [RELEASE_SCOPE.md](RELEASE_SCOPE.md)
- Unified Marketplace local behavior and boundaries: [MARKETPLACE_LOCAL.md](MARKETPLACE_LOCAL.md)
- Repeatable checks and security probes: [DIAGNOSTICS.md](DIAGNOSTICS.md)
- Confirmed issues: [BUGS.md](BUGS.md)
- Current security audit and launch limitations: [SECURITY_AUDIT.md](SECURITY_AUDIT.md)
- Historical security finding register: [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md)
- Local user/admin QA accounts: [LOCAL_QA_ACCOUNTS.md](LOCAL_QA_ACCOUNTS.md)
- Automated two-role browser QA: [QA_BOTS.md](QA_BOTS.md)
- Live PostgreSQL integration QA: [POSTGRES_QA.md](POSTGRES_QA.md)
- Package quota assumptions and virtual-user load model: [PLAN_CAPACITY_MODEL.md](PLAN_CAPACITY_MODEL.md)
- Dated route and release audit: [SITE_AUDIT.md](SITE_AUDIT.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Current release sequence and next implementation: [ROADMAP.md](ROADMAP.md)
- Historical milestone snapshot: [NEXT_STEP.md](NEXT_STEP.md)
- Marketplace seller intake rules (draft, not legal terms): [MARKETPLACE_SELLER_RULES.md](MARKETPLACE_SELLER_RULES.md)
- Beat artwork requirements, thumbnails and backfill: [ARTWORK_PIPELINE.md](ARTWORK_PIPELINE.md)
- Mercado Pago local setup and sandbox limitations: [MERCADOPAGO_LOCAL_TESTING.md](MERCADOPAGO_LOCAL_TESTING.md)
- History: [CHANGELOG.md](CHANGELOG.md)
- Oracle VPS deployment scaffold and go-live blockers: [DEPLOY_ORACLE_VPS.md](DEPLOY_ORACLE_VPS.md)
