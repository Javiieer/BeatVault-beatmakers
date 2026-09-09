# Phase 4.3 Report: Local PostgreSQL Preparation

## Status

Prepared but not executed as part of the application runtime. The original environment note below records that Docker was unavailable when this report was written; a later local verification is referenced by `PROGRESS.md`, but it does not change the fact that JSON remains the active repository.

## Added

- `docker-compose.yml` with PostgreSQL 16 Alpine.
- `db/migrations/001_init.sql` with initial `accounts`, `projects`, and `catalog_assets` tables.
- Healthcheck and named database volume.

## Design

- Projects and catalog assets reference account ownership with foreign keys.
- Titles are unique per owner and type where appropriate.
- Statuses are constrained by database checks.
- Passwords are not part of this migration flow yet; the API must continue to store only password hashes.
- Audio files, previews, provider tokens, and binary content remain outside PostgreSQL.

## Local Start (after Docker Desktop is installed)

```bash
docker compose up -d postgres
docker compose ps
```

The local connection will be:

```text
postgresql://beatvault:beatvault_local_only@localhost:5432/beatvault
```

This password is for local development only and must never be reused on the VPS.

## Not Yet Implemented

- Node PostgreSQL driver.
- Repository migration from JSON.
- Migration runner/version table.
- Production secrets.
- Backups and restore tests.
- Connection pooling.
- VPS deployment.

The existing JSON repositories remain active until a database adapter and rollback path are implemented.
