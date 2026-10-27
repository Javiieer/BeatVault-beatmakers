# BeatVault local on Windows 11

Recovery date: 2026-10-27. The local app uses native PostgreSQL and stores uploaded
media on the dedicated D: volume.

## Installed for this workspace

- Node 24.22.1: `.tools/bin/node.exe` (copied from the available Codex runtime).
- npm 12.2.1: `.tools/package`, with npm/npx command wrappers in `.tools/bin`.
- Project packages restored with `npm ci` before targeted security updates.
- FFmpeg/FFprobe 8.1 LGPL build from BtbN, linked by ffmpeg.org; downloaded ZIP
  verified against the release SHA-256 list in `.tools/ffmpeg-checksums.sha256`.
- Playwright Chromium and headless shell in the current user's browser cache.

The `.tools` directory is private local tooling, ignored by Git and ESLint. It is
not committed or automatically restored by cloning the repository. A fresh machine
needs Node/npm and FFmpeg installed again, or a separate copy of this tooling.

## Start

Open two PowerShell terminals in the project folder. Run the API in the first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Service api
```

Run the frontend in the second:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Service web
```

Open http://127.0.0.1:5188. Stop each server with Ctrl+C. ExecutionPolicy Bypass
applies only to these processes; it does not change the Windows policy permanently.
The launchers bind to loopback. API mode selects the verified local PostgreSQL import
when the private configuration is active. `-Backend json` explicitly selects the
retained pre-migration JSON data under `data/server-local`; both backends use the
configured upload directory.
The two backends do not synchronize; see [PostgreSQL local](POSTGRES_LOCAL.md).
They do not load `.env` automatically; use process environment variables for overrides.

## Local storage volume

The Windows launcher is configured to use `D:\BeatVault\storage\uploads` for uploaded
files. The ignored
`.tools/local-storage.json` sets `BEATVAULT_UPLOAD_DIR` for the Windows launchers;
an explicit process environment variable can override it. The existing files were
copied from `data/uploads` and SHA-256 checked; the original C: copy remains intact.
The active API was restarted after migrations 031–034 and now reports PostgreSQL ready
on `/api/ready`; the web app remains available on port 5188. PostgreSQL and the workspace
stay on C:. D: is the primary media volume, so a complete recovery bundle must be placed on a third physical disk
distinct from both C: and D:. The app continues to use the `BEATVAULT_UPLOAD_DIR`
interface so a future storage backend or volume can be selected without changing media
records. NTFS permissions on `D:\BeatVault` are restricted to this Windows user,
SYSTEM, and Administrators; the D: root permissions were left unchanged. A future
service account must be added explicitly before running the server under that identity.

## Maintenance

Load workspace tools in a PowerShell session:

```powershell
. .\scripts\windows-env.ps1
npm.cmd ci
npm.cmd run diagnose
npm.cmd exec -- playwright test tests/site-audit.spec.ts tests/persistent-uploads.spec.ts --workers=1
```

The npm 12 installation policy explicitly allows esbuild 0.28.2's postinstall in
`package.json`. Review a new version's installation script before changing that rule.
Reports are in `artifacts/diagnostics/latest.md`. Browser tests use disposable data
and separate ports 45174/5187; they do not use the owner's running API.
Run diagnostics and browser suites sequentially on this Windows setup. Running both
at once reproduced five-second unit-test timeouts; the three affected files passed
all 37 tests when rerun alone. The first five-test browser run passed four tests;
mobile catalog review hit its 30-second budget and passed on an isolated rerun.
These retries do not establish full parallel-browser stability.
Vitest's default and the diagnostic harness now use one worker on Windows (two on
other systems). The subsequent two-worker general run still reproduced a five-second
artwork-processing timeout without browser tests, so disk/media contention is not
limited to running the two suites together. The test time limits were preserved.

Final verification on 2026-10-25 with one worker: all six non-browser diagnostic
checks passed, including 314 tests in 64 files, security probes, build, lint,
TypeScript and npm audit (zero advisories). The diagnostic report says `attention`
because its full browser gate was skipped; only the focused browser runs described
above were executed. Public-release blockers in the roadmap still apply.

## Data and optional environments

A pre-start ZIP of `data` was saved under `backups/windows11-20261025-191536.zip`.
This is a local copy on the same disk, not an off-device or automatic backup.
It contains private account/session data and must not be committed or shared publicly.

Native PostgreSQL 16.15 is now installed inside `.tools/postgresql/pgsql`; Docker/WSL
are not required. Migrations 001-029, upgrade 028 to 029 and native backup/restore
passed on 2026-10-26. The verified data import is active for local API startup.
Java/Android Studio/Android SDK are separate requirements for building an Android APK;
they were not installed. See `ANDROID_PRIVATE_TEST.md`.

Security updates applied in this recovery: Vitest stays on major 4 (`^4.1.12`),
and transitive undici/zod were updated. The resulting npm audit reported zero
advisories. Other available upgrades, especially TypeScript 7 and Vitest 5, need
their own compatibility review; restoring the local environment does not apply them.
