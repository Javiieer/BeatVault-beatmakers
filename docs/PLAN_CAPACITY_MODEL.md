# Capacity model (local draft)

Package storage defaults are 5 GiB Free, 50 GiB Creator and 250 GiB Studio. They
are technical limits for local product testing, not prices, a commercial promise,
or a VPS capacity recommendation. Each can be overridden in bytes through the
`BEATVAULT_PLAN_*_STORAGE_BYTES` environment variables.

The deterministic `npm run test:plan-capacity` virtual-user model writes no media
files. It models a three-minute, uncompressed stereo 44.1 kHz/24-bit WAV as
47,628,000 bytes (45.4 MiB), and each one-shot as 4 MiB. Cohorts are 700 Free users
at 1 beat + 20 one-shots, 250 Creator users at 8 beats + 80 one-shots, and 50
Studio users at 24 beats + 250 one-shots. The one-shot size and user mix are
planning assumptions, not measured production telemetry.

Latest run: all 1,000 accounts fit. Free uses 2.45% per account (85.74 GiB cohort),
Creator 1.33% (166.84 GiB), and Studio 0.82% (102.06 GiB), for 354.63 GiB total
original audio in the modeled cohort.

Run output provides per-user fill, cohort original-audio volume, and whether every
modeled user fits their package. It excludes generated previews, filesystem and
database overhead, replication, backups, abandoned uploads and peak network
bandwidth. The model does not establish a safe VPS disk size. Before public launch,
replace assumptions with anonymized local usage observations and add preview and
backup multipliers. Prices and payment processing remain undecided/disabled.

The same run includes single-format sensitivity ranges: beats from 2 to 5 minutes
at the reference WAV encoding, and one-shots from 1 to 8 MiB. Package cards use the
midpoint assumptions (3-minute WAV, 4 MiB one-shot) and label counts as estimates.

Package badges are based on `purchased_plan_ids`, not the current assigned plan.
Only the server-side `AuthService.recordVerifiedPlanPurchase` internal operation
can record a verified purchase; it must only be called after a future payment
provider webhook has been authenticated and verified. Admin plan assignment and
test quota overrides never grant purchase badges.
