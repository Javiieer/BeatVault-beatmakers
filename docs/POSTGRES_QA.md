# PostgreSQL QA

Browser/API QA also supports native PostgreSQL: `npm.cmd run test:e2e:postgres` creates
a unique `beatvault_test_e2e_*` database owned by the application role, migrates it,
runs Playwright, and removes only that temporary database. The owner's database is
never selected. For a focused run after loading `scripts/windows-env.ps1` and starting
PostgreSQL, use `node --import tsx scripts/postgres-tasks.ts qa-browser tests/product-journey-audit.spec.ts`.
The runner has a ten-minute global browser limit; a timeout/interruption is not a pass.

## Windows native local workflow (2026-10-26)

Load `. ./scripts/windows-env.ps1`, then `npm.cmd run test:postgres:local`.
The launcher starts the native loopback cluster, applies checksummed migrations to
`beatvault_test_native`, and supplies private admin credentials only to the QA process.
Native `pg_dump`, `createdb`, `pg_restore` and `dropdb` run the same restore assertions
as the Docker workflow below. The test cannot target `beatvault_local`.

Current native result: PASS with all seven audio formats, auth/chat/SSE, stories,
social permissions, moderation, quota concurrency, transactional notifications,
backup/restore and source integrity/retention with a simultaneous order/delete race.
Fresh 001-029 and existing 028 to 029 upgrade were also exercised. The owner's imported
data was separately restored and compared exactly across 32 tables. See
[local operation and evidence](POSTGRES_LOCAL.md).

To persist only the synthetic QA backup on the D: emulation folder, set
`$env:BEATVAULT_TEST_RECOVERY_ROOT='D:\BeatVault\backups\emulated-disk'` before
`npm.cmd run test:postgres:local`. Each successful run writes a unique `run-*` folder
with a custom PostgreSQL dump, a tar archive of QA uploads and `verification.json`
containing their SHA-256 hashes. The QA restores from D: into a disposable database and
temporary media directory, then removes those restore targets. The retained artifacts
come only from `beatvault_test_native` and generated QA uploads; they do not include
`beatvault_local` or the owner's primary uploads. D: is still the same physical disk as
those primary uploads, so this folder simulates a third destination but cannot prove
physical independence. The run applies changes after a later checkout must use a fresh
shell so it sees the per-user FFmpeg PATH if media tests are desired.

`npm run test:postgres` runs live integration checks against an isolated local
PostgreSQL database. It refuses remote hosts and database names unless they match
`beatvault_test_*` or `beatvault_audit_*`. The current schema includes migrations
001-036; mounting `db/migrations` into a new Postgres container applies all of them
in order. The QA harness checks that the notification table from migration 027, the
follow/bookmark tables from migration 028, and independent story records from migration
029 exist. It checks public story visibility, private-story isolation, exact 24-hour
expiry, owner-only deletion and that stories do not appear in the feed,
exercises seller intake through the HTTP API, uploads real PDF-signature rights
evidence, verifies that another account cannot read it, persists Beat artwork before
catalog creation, checks original/thumbnail quota accounting and creator/CM/staff
artwork visibility, and verifies artwork plus thumbnail through backup/restore,
uploads custom avatar and cover images, checks public/private image access and profile privacy, and verifies those images through backup/restore,
checks public creator posts in the feed and profile, cross-account comments and reactions, private-post interaction denial, account-isolated follows/bookmarks including backup/restore, CM report/removal, persistent friendship/comment/reaction notifications, and verifies that an artificial notification insert failure rolls back its PostgreSQL comment in the same statement,
checks the community-manager recommendation and separate admin approval boundary, and confirms edits invalidate
both decisions. Catalog Beats can be independently approved by either a CM or an
admin; CM reviews use a private processed preview, and either approval publishes the
Beat with only the processed preview exposed. It
also checks that seller-intake approval does not publish a beat by itself,
exercises Mercado Pago migration 035, social report snapshots from migration 036, one-use OAuth state,
seller-link persistence, preference reservation/idempotency, exact preference/payment
linkage, webhook-event idempotency, terminal provider-state compare-and-set, persists
an order state, and checks session reuse across an API restart. The synthetic HTTP flow
also covers OAuth, Checkout, signed webhooks and refund holds. These local tests do not
call Mercado Pago, perform a provider-hosted Checkout, or prove a real refund/dispute.

Example with Docker Desktop on PowerShell, using a random host port and a separate
container/anonymous volume:

```powershell
docker run -d --rm --name beatvault-postgres-qa `
  --label beatvault.qa=true `
  -e POSTGRES_DB=beatvault_test_local `
  -e POSTGRES_USER=beatvault_qa `
  -e POSTGRES_PASSWORD=qa_only_local `
  -p 127.0.0.1::5432 `
  -v "${PWD}/db/migrations:/docker-entrypoint-initdb.d:ro" postgres:16

docker port beatvault-postgres-qa 5432/tcp
$env:BEATVAULT_TEST_DATABASE_URL='postgresql://beatvault_qa:qa_only_local@127.0.0.1:PORT/beatvault_test_local'
$env:BEATVAULT_TEST_DATABASE_CONTAINER='beatvault-postgres-qa'
npm run test:postgres

docker stop beatvault-postgres-qa
Remove-Item Env:BEATVAULT_TEST_DATABASE_URL
Remove-Item Env:BEATVAULT_TEST_DATABASE_CONTAINER
```

Replace `PORT` with the host port printed by `docker port`. The script creates
uniquely named QA accounts, tests HTTP authorization/CSRF, chat persistence and SSE
reconnect, local package assignment and storage-limit resolution, and races two
simultaneous uploads against the remaining package-derived quota (only one may
commit, and the final usage must remain within the plan limit). The race uses
small real multipart WAV uploads and a reduced test quota. It also checks WAV
preview byte ranges and account isolation, and (when FFmpeg is
available) authenticated MP3, FLAC, AAC, M4A, OGG and WebM uploads, original byte
preservation, derived M4A publication and forged-signature rejection. It also checks
malformed WAV fail-closed moderation, per-file and total-request `413` responses
(including chunked multipart without `Content-Length`), per-account storage usage,
atomic concurrent quota enforcement and release on deletion, processed-preview publication
(or fail-closed moderation when FFmpeg is unavailable), concurrent moderation, retry
ownership/CSRF enforcement, audit persistence, then restarts its API process and
rechecks durable chat/media state. To exercise encoded publication, install FFmpeg separately and set
`BEATVAULT_FFMPEG_PATH` to its executable. The app does not bundle FFmpeg. It deletes
only the accounts and manual quota rows it created and its temporary upload
directory. The database/container remain under the operator's control; the stop
command removes the `--rm` container and its anonymous data volume.

When `BEATVAULT_TEST_DATABASE_CONTAINER` is set, the same run also stops its API,
creates a custom-format `pg_dump`, archives the upload directory as a separate
`tar.gz`, restores both into temporary locations, and starts a second API against
the restored database and files. It compares row counts across all QA tables and
checks restored account package history, chat, catalog and exact original audio
bytes through the API. This stage refuses containers unless they carry the
`beatvault.qa=true` label, use exactly `postgres:16`, and publish the matching QA
port only on loopback. It creates and drops only a uniquely named
`beatvault_test_restore_*` database; temporary dump/archive files are deleted. This
is a disposable round-trip rehearsal, not a backup of the operator's database or
proof that an Oracle VPS backup has been restored.

The integration check is deliberately separate from `test:qa-bots` and
`diagnose:full`: those commands remain safe to run without a PostgreSQL server.
