# Local QA accounts

With the local API running on its development port, run:

```sh
npm run local:qa-accounts
```

The command refuses production, PostgreSQL storage and non-loopback API binding.
It creates a fresh creator, Community Manager and admin in the configured local JSON
account store, sets the creator profile public and the staff profiles private, and
adds one clearly named pending Beat entry. The admin assigns the Community Manager
role through the authenticated, CSRF-protected role endpoint. Existing accounts and
projects are not overwritten or deleted. Each run creates a new trio and pending
marker; do not rerun unless you need another isolated set.

Passwords are random, printed once to the invoking terminal, and never written by
the setup script to a credentials file. Save them in a password manager if they
need to survive beyond the terminal session. These are local-only QA identities;
never copy this local JSON database or credentials into a hosted environment.

The script verifies that the creator cannot access staff review or Admin, the
Community Manager can read the private Beat review queue but cannot access Admin,
and the admin can read both the admin overview and review queue. To use the sessions
simultaneously, open each account in a separate browser profile:

- Creator: log in with the `qa-creator-...@beatvault.local` account and test upload,
  profile, friends and creator navigation.
- Community Manager: log in with the `qa-manager-...@beatvault.local` account and open
  `#/community-review` to review real pending Beat uploads.
- Admin: log in with the `qa-admin-...@beatvault.local` account and open `#/admin` to
  review the admin panel and the same pending Beat queue.

The QA catalog marker contains no audio; it is only for checking queue visibility and
role boundaries, and cannot be approved. Upload an actual Beat with a processed audio
preview from the creator account to test independent CM/admin approval and rejection.
