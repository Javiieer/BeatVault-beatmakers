# Native PostgreSQL on Windows 11

Update 2026-10-27: migrations 031–034 are applied to the local database. Persistent
account blocks, Story reports, private evidence retention and their audit behavior are
active. The restarted API reports PostgreSQL ready. Uploads now resolve to
`D:\BeatVault\storage\uploads`; both existing files were copied from C: and verified
by SHA-256, with the originals retained. See
[CONSOLIDATION_STAGES.md](CONSOLIDATION_STAGES.md) for the latest scope.

Verified on 2026-10-26. The local API now uses real PostgreSQL 16.15, bound only to
`127.0.0.1:55432`, database `beatvault_local`. It does not require Docker or WSL.
The app connects with `beatvault_app`, without superuser, database-creation or role-creation
privileges. Password authentication uses SCRAM. Private random credentials are in
`.tools/postgresql/local-config.json`, outside Git and restricted with Windows ACLs.
Do not publish this file, the cluster, source JSON or backups.

## Start and maintain

```powershell
. .\scripts\windows-env.ps1
npm.cmd run postgres:status
npm.cmd run postgres:migrate
npm.cmd run test:postgres:local
npm.cmd run postgres:backup
```

Start the API and web in separate terminals using `scripts/start-local.ps1 -Service api`
and `-Service web`. API startup starts PostgreSQL if necessary and selects it when
the verified private configuration has `active: true`. Open http://127.0.0.1:5188.
`GET http://127.0.0.1:4174/api/ready` must report `storageBackend: postgres`.
Stop the API before `npm.cmd run postgres:stop`. Startup is manual after a Windows
reboot; no Windows service or scheduled task was installed.

Migrations 001-034 are applied in order with a checksum ledger and an advisory lock.
Applied SQL must not be edited: add a new migration for future schema changes.
`test:postgres:local` uses only a separate `beatvault_test_native` database and generates
temporary QA accounts. Native backup/restore is part of the QA, not a skipped gate.

## Migration and recovery evidence

The JSON API was stopped before copying the existing data. Backup:
`backups/pre-postgres-20261026-084959.zip` contains source JSON and uploads.
The importer preserved 9 accounts and password hashes/roles, 88 projects, 8 catalog
entries, 8 profiles, 3 friendships, comments, reactions, follows, notifications and
255 audit events. Two valid-owner asset records were migrated; one is available with
its original bytes/hash verified, and the other retains its previous missing state.
Six legacy asset records reference absent owners. Their full records are preserved in
`beatvault_local_legacy_records`, without inventing accounts or transferring ownership.
All source JSON arrays and SHA256 checksums are also preserved in the private
`beatvault_local_import_sources` table. Original JSON files remain unchanged.

`scripts/postgres-import-local.ts` refuses an active or nonempty target, rolls back
on errors and refuses unmapped nonempty sources. It is a one-time importer for this
specific source inventory, not a general bidirectional synchronization tool.
`artifacts/postgres-local-import.json` records counts and archive reasons.

The app dump `backups/postgres-local-2026-10-26T14-51-40-763Z.dump` was restored into a
temporary isolated database. All row values in all 32 public tables matched exactly;
the available original audio hash, unchanged JSON and restricted app role were verified.
Evidence: `artifacts/postgres-import-restore.json`. PostgreSQL was then restarted
before enabling the API. `artifacts/postgres-native-qa.log` records the full native QA.

Regression evidence: 390 tests in 73 files passed, plus a focused 10-test run for
listing validation/legacy stem compatibility. TypeScript, ESLint and the production
build passed. Real local Marketplace guest checks passed on desktop and mobile with
PostgreSQL, no page errors and no horizontal overflow; screenshots/report are in
`artifacts/postgres-marketplace-*.png` and `artifacts/postgres-ui-smoke.json`.
The initial smoke assertion expected an authenticated sidebar for a guest; it was
corrected to assert the public header and rerun. This is focused browser evidence,
not a claim that the entire Playwright suite was rerun against PostgreSQL.

Vite denies the root private tool/data/backup/artifact directories, including raw,
import and absolute-file request variants. Nine request variants were checked as 403;
normal `src/data` application modules remain accessible and watched for development.

Use `postgres:backup` for future custom-format dumps. Uploads must also be backed up:
database dumps contain references, not the audio/image bytes. Keep a private copy of
the configuration for cluster recovery. These backups are on the same disk; no remote
backup or automatic schedule has been configured.

For rollback, first stop the API, then explicitly launch with `-Backend json`.
That opens the preserved pre-migration state; new PostgreSQL writes will not appear
there. Do not merge divergent states by overwriting files or databases. Restore a dump
to a separate database first and validate both data and media before any cutover.

### Versioned recovery copy on a separate disk

The existing postgres:backup command remains a quick same-disk database-only dump.
For recovery of both the database and uploaded media, use the append-only bundle
script with a destination folder on a physical disk distinct from both source volumes.
The current local setup keeps PostgreSQL on C: and uploads on D:, so a complete bundle
needs a third disk (or another independent destination). The script refuses either
source disk, an active API on port 4174, and a missing upload folder. It does not copy
credentials or remove older bundles. Choose and create the destination yourself:

    # Stop the API terminal first; keep PostgreSQL running.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-recovery.ps1 -Action backup -Path X:\BeatVaultBackups

Each run creates a new UTC-stamped beatvault-* directory with a custom-format database
dump, a tar.gz copy of the configured upload directory, a per-file media inventory,
and a manifest with SHA-256 digests plus per-table row counts. A failed/incomplete run is not a valid bundle;
inspect it manually and leave it untouched until understood. Bundle contents include
private user media. Restrict access to the destination and keep it disconnected when
not backing up. The script does not schedule copies or prune old bundles; retention is
append-only until an operator explicitly chooses a retention policy.

Verification defaults to at most 25 GiB of declared media and 100,000 archive entries
before extraction. Raise MaxMediaBytes or MaxMediaEntries only when the trusted backup
inventory requires it. Hashes detect accidental corruption against the included
manifest; they do not prove who created the bundle or detect an attacker who can replace
both the files and manifest. Keep the destination access-controlled and disconnected
when idle.

The API is a manually started local process. The script checks its configured loopback
port before database export, between export and media archiving, and after archiving;
keep the API stopped for the full command. The script cannot prevent someone launching
the API manually during that interval, so that operational constraint still applies.

To rehearse recovery, pass one bundle directory with the verify action. This checks both
digests, bounds declared media by size and entry count, restores the dump into a new
random beatvault_restore_check_* database, compares every public-table row count,
checks the tar paths/types before extraction, and compares extracted media names,
sizes and SHA-256 values in a fresh temporary directory. On success or failure it removes only the temporary database it
created and its uniquely named temporary extraction directory. The source database,
the bundle, and other files are not changed:

Run verification only for bundles from a trusted, controlled source. The included
hashes are not authenticated; a malicious PostgreSQL dump could execute SQL inside the
temporary database restore. The restore is isolated from `beatvault_local`, but the
process is not a sandbox for hostile dump files.

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-recovery.ps1 -Action verify -Path E:\BeatVaultBackups\beatvault-2026-10-27T00-00-00-000Z

This verifies that a bundle can be restored and that table counts/media extraction
work; it is not a proof of byte-for-byte row equivalence. It does not back up
.tools/postgresql/local-config.json; preserve those credentials separately in a
password manager or other protected recovery channel. Do not place credentials beside
the media bundle.

Treat the bundle as highly sensitive: database.dump includes account password hashes
and hashed session/CSRF tokens, even though the private runtime configuration and
database passwords are omitted. SHA-256 values verify file consistency against this
manifest, not bundle authenticity or protection from an attacker who can replace both.

## Scope

Stems are deferred: current offers support MP3/WAV only. Mercado Pago sandbox
reconciliation, production hosting and public-release operational work remain separate.
PostgreSQL QA verifies local persistence and authorization; it does not make real payments.
Native binaries came from the official PostgreSQL Windows download page's EDB link.
They live in `.tools/postgresql/pgsql`; the cluster lives in `data/postgres-local`.
