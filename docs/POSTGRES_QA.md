# PostgreSQL QA

`npm run test:postgres` runs live integration checks against an isolated local
PostgreSQL database. It refuses remote hosts and database names unless they match
`beatvault_test_*` or `beatvault_audit_*`. The current schema includes migrations
001-029; mounting `db/migrations` into a new Postgres container applies all of them
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
checks that Admin and Community Manager can independently approve commercial listings,
and confirms listing/evidence edits stale prior decisions. Catalog Beats can be independently approved by either a CM or an
admin; CM reviews use a private processed preview, and either approval publishes the
Beat with only the processed preview exposed. It
also checks that seller-intake approval does not publish a beat by itself,
exercises Stripe Connect and webhook-event idempotency records, persists an
order/payment-intent state, and checks session reuse across an API restart. This is
repository-level persistence coverage:
it does not call Stripe, perform Checkout, or prove refund/dispute webhooks end to end.

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
