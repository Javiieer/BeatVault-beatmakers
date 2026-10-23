# Production admin provisioning

BeatVault keeps administrator setup out of the public API. The existing development bootstrap remains available for local work. Production uses the same one-off command only from an operator-controlled maintenance environment connected to PostgreSQL.

This is an operational tool, not Google sign-in, email delivery, or a replacement for a verified identity provider. Until account verification is configured, the operator must choose an address they control and confirm that identity outside BeatVault. The command marks the initial admin verified so that this first account can sign in; it does not send or claim to verify an email.

## Preconditions

- Keep the deployment private and take a verified database backup first.
- Apply the database migrations through `030_admin_bootstrap_claims.sql`.
- Use the production configuration already required by the server: HTTPS origins, secure cookies, PostgreSQL, and demo accounts disabled.
- Inject the admin email and a unique 12–128 character initial password into the one-off process from an approved secret manager. Do not put the password in a checked-in file, command-line argument, terminal transcript, or CI log.
- Run the command from a restricted maintenance shell or job. It is not part of API startup and adds no network endpoint.

## Create the first admin

Set `BEATVAULT_ADMIN_EMAIL`, `BEATVAULT_ADMIN_PASSWORD`, and `BEATVAULT_ADMIN_OPERATION_CONFIRM=CREATE_INITIAL_ADMIN` only for this invocation, then run:

```powershell
npm run admin:bootstrap -- provision
```

The operation is transactional. It refuses to run if an administrator already exists, the initial-admin claim is already present, or the email belongs to any account. It never promotes or overwrites an existing account. The account, one-time claim, and audit event commit together. A concurrent second run is serialized and rejected. The command output contains only the result and account email, never the password or its hash.

## Recover an existing admin password

Set `BEATVAULT_ADMIN_EMAIL`, a new `BEATVAULT_ADMIN_PASSWORD`, and `BEATVAULT_ADMIN_OPERATION_CONFIRM=RESET_ADMIN_PASSWORD` for this invocation, then run:

```powershell
npm run admin:bootstrap -- recover
```

Recovery succeeds only for an existing account whose role is already `admin`; it cannot promote a creator or Community Manager. It updates the password hash, revokes every session for that account, and writes an audit event in one transaction. It does not change the account's email or role. Because transactional email remains deferred, this operator-run procedure is the recovery path until an identity/email provider is selected and configured.

After either operation, remove the temporary password and confirmation variables from the process/deployment secret store. Never enable the development token-recovery flag in production. Rehearse this procedure against a disposable PostgreSQL database before using it on a hosted instance; no production database or credentials were used to validate the implementation.
