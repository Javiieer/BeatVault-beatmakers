# Local QA accounts

With the local API running on its development port, run:

```sh
npm run local:qa-accounts
```

The command refuses production, PostgreSQL storage and non-loopback API binding.
It creates a fresh creator and admin in the configured local JSON account store,
sets a public test creator profile, and adds one clearly named pending Beat entry
for the admin review queue. Existing accounts and projects are not overwritten or
deleted. Each run creates a new pair and a new pending marker; do not rerun unless
you need another isolated pair.

Passwords are random, printed once to the invoking terminal, and never written by
the setup script to a credentials file. Save them in a password manager if they
need to survive beyond the terminal session. These are local-only QA identities;
never copy this local JSON database or credentials into a hosted environment.

The script logs in as both accounts and verifies that the creator receives HTTP 403
from the admin overview while the admin can read the overview and its QA review row.
To use both sessions simultaneously, open the app in two separate browser profiles
(for example, Chrome and Edge):

- Creator: log in with the `qa-creator-...@beatvault.local` account and test upload,
  profile, friends and creator navigation.
- Admin: log in with the `qa-admin-...@beatvault.local` account and open `#/admin` to
  approve or reject the pending `QA - solicitud de prueba ...` entry.

The QA catalog marker contains no audio and is only for checking moderation and
role boundaries. Upload an actual Beat or One-shot from the creator account to test
the complete audio review loop.
