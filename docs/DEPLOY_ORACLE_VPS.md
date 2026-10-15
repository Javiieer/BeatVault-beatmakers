# Oracle VPS deployment

The repository now has a single-VM Docker Compose profile for a private pilot:
the static app is served by Caddy, the API is private to the Docker network,
PostgreSQL is isolated on an internal network, and uploaded audio persists in a
named volume. Caddy obtains and renews public HTTPS certificates for the configured
domain. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
and [Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/).

## Before starting

- Create an OCI Compute VM with a public IPv4 address and attach a domain A record to it.
- Install Docker Engine with Compose v2 on the VM.
- In the VM's NSG or subnet security list, permit inbound TCP 80 and 443. Permit SSH TCP 22 only from your own trusted IP range. Apply equivalent host firewall rules. Do not open 4174 or 5432. OCI supports NSGs on Compute VNICs; their rules control traffic to those VNICs ([OCI Network Security Groups](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/networksecuritygroups.htm)).
- The domain must resolve publicly to the VM and the VM must be reachable on ports 80 and 443 for Caddy's certificate flow ([Caddy HTTPS prerequisites](https://caddyserver.com/docs/quick-starts/https)).

## First deployment

From the project directory on the VM:

```bash
cp .env.oracle.example .env.oracle
openssl rand -hex 32
nano .env.oracle
bash scripts/deploy-oracle.sh
```

Put the real domain in `BEATVAULT_DOMAIN` and the generated 64-character hex value
in `POSTGRES_PASSWORD`. Keep `.env.oracle` private; the script restricts it to the
deploying user. The script validates the Compose configuration, builds both images
and starts the stack. Migrations 001-023 run automatically only when PostgreSQL
creates a fresh data volume. Future database changes need a separate migration step;
re-deploying does not apply migrations to an existing volume.

For an existing deployment, back up PostgreSQL first, then apply new SQL migrations
from the project directory on the VM. For the latest migration (023):

```bash
docker compose --env-file .env.oracle exec -T postgres psql -v ON_ERROR_STOP=1 -U beatvault -d beatvault < db/migrations/023_catalog_artwork.sql
```

The app listens on HTTPS at the domain. Compose publishes only TCP 80/443 through
Caddy; API and PostgreSQL have no host port mappings. The API runs as the unprivileged
Node user with a read-only container filesystem and writable persistent data volume.
Demo access and development reset tokens are disabled in production configuration.
The API trusts `X-BeatVault-Client-IP` only in this Compose deployment. Caddy
overwrites that header with the connecting visitor IP, so authentication rate
limits remain per visitor instead of sharing Caddy's container address. Keep the
API private and do not enable `BEATVAULT_TRUST_PROXY_HEADERS` when clients can
reach the API directly.

## Backups and updates

Run `bash scripts/backup-oracle.sh` for a local database dump and a separate archive
of uploaded audio. It briefly stops the API to keep the database and audio snapshot
aligned. A SHA-256 manifest is written alongside both files; verify it with
`sha256sum --check beatvault-checksums-<stamp>.sha256` from the backup directory.
Copy all three files off the VM and rehearse restoring them before storing real
creator uploads. Docker named volumes on one VM are not an off-site backup.

To rehearse the actual backup script locally without using the app's database or
uploads, run `bash scripts/backup-oracle-qa.sh`. It creates uniquely named temporary
PostgreSQL and upload volumes, validates the hashes, restores the SQL dump into a
separate database, checks a recovered upload and confirms the API service restarts.
The QA Compose project and its test files are removed on exit.
OCI Block Volume can be attached as expandable VM storage, but it also needs its own
backup plan ([OCI Block Volume overview](https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/overview.htm)).

For an update, pull the intended revision, then run `bash scripts/deploy-oracle.sh`.
This rebuilds and recreates the stack. Back up first; the script does not migrate
existing local JSON accounts/audio into PostgreSQL or perform schema migrations on
an already-initialized database.

## Go-live blockers

This is deployment scaffolding, not a claim that the public launch is ready. Email
delivery for password recovery and verification is not configured. Production
admin provisioning, real PostgreSQL migration/restore checks, upload MIME/container
hardening, PostgreSQL migration/integration QA and preview processing also remain open. Do not promise account recovery
by email or public beat publishing until those flows exist. The development reset
token flag must remain disabled on the VPS.
