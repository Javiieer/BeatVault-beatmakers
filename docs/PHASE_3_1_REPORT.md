# Phase 3.1 Report

## Decisions

- `ApiClient` uses `VITE_API_BASE_URL` or `http://localhost:4174`, with a four-second timeout.
- Every response is validated as an `ApiResult` and project records are validated without `any`.
- The repository is the only project transport boundary.

## Flow and fallback

Dashboard/Studio load through `ProjectRepository.list()`: API data is mapped to the existing `Project` model and merged with local records; network, HTTP, timeout, or invalid-envelope failures use localStorage. Creation tries `POST /api/projects`; a successful record is mapped and cached locally, while failure retains the modal's local project. The UI exposes API versus fallback status.

## Limitations

The prototype supports only GET/POST for projects. Edit/delete are deliberately local-only and are not reported as remote success. Library was not migrated. Tests disable automatic App loading in test mode and inject fetch mocks in client/repository tests.

## Files and results

- Added `src/api/client.ts`, `src/data/projectRepository.ts`, and focused unit tests.
- Updated `App.tsx`, README, architecture, phases, and progress documentation.
