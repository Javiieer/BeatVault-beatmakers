# PostgreSQL QA

`npm run test:postgres` runs live integration checks against an isolated local
PostgreSQL database. It refuses remote hosts and database names unless they match
`beatvault_test_*` or `beatvault_audit_*`. The schema must already have migrations
001-014 applied.

Example with Docker Desktop on PowerShell, using a random host port and a separate
container/anonymous volume:

```powershell
docker run -d --rm --name beatvault-postgres-qa `
  -e POSTGRES_DB=beatvault_test_local `
  -e POSTGRES_USER=beatvault_qa `
  -e POSTGRES_PASSWORD=qa_only_local `
  -p 127.0.0.1::5432 `
  -v "${PWD}/db/migrations:/docker-entrypoint-initdb.d:ro" postgres:16

docker port beatvault-postgres-qa 5432/tcp
$env:BEATVAULT_TEST_DATABASE_URL='postgresql://beatvault_qa:qa_only_local@127.0.0.1:PORT/beatvault_test_local'
npm run test:postgres

docker stop beatvault-postgres-qa
Remove-Item Env:BEATVAULT_TEST_DATABASE_URL
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

The integration check is deliberately separate from `test:qa-bots` and
`diagnose:full`: those commands remain safe to run without a PostgreSQL server.
