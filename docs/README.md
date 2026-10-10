# BeatVault: current project handoff

Start with [RELEASE_SCOPE.md](RELEASE_SCOPE.md), [DIAGNOSTICS.md](DIAGNOSTICS.md),
[BUGS.md](BUGS.md), and [NEXT_STEP.md](NEXT_STEP.md).

The current product is a React frontend with a local Node API, session authentication,
JSON/Postgres adapters, private file uploads and an admin review queue. Home has a
browser-local post composer mirrored to the author's own profile; Amigos supports
opt-in public creator discovery and persisted friend requests in the local API.
Creator profiles include persisted metadata, bundled cover/avatar choices, project
cards, Publications and optional public links. Public metadata is separate from
account credentials. The first-release priority remains reliable audio publication
and discovery, not broad social features.
It is not ready for a public production launch. Older phase reports are historical;
their statements that there is no backend, authentication or test suite no longer apply.

- Product decisions: [RELEASE_SCOPE.md](RELEASE_SCOPE.md)
- Repeatable checks and security probes: [DIAGNOSTICS.md](DIAGNOSTICS.md)
- Confirmed issues: [BUGS.md](BUGS.md)
- Security finding register: [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Release sequence: [ROADMAP.md](ROADMAP.md)
- Next implementation: [NEXT_STEP.md](NEXT_STEP.md)
- History: [CHANGELOG.md](CHANGELOG.md)
- Oracle VPS deployment scaffold and go-live blockers: [DEPLOY_ORACLE_VPS.md](DEPLOY_ORACLE_VPS.md)
