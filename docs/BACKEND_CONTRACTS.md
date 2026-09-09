# Backend Readiness Contracts

## Purpose

Phase 10 defines the seams that a future web API, desktop client, or native mobile client can implement. These are TypeScript contracts only. The current alpha continues to use mock data and feature-specific browser `localStorage` modules.

## Transport

`ApiResult<T>` is the shared success/error envelope. Errors have a stable machine-readable `code`, user-safe `message`, and optional `field`, `retryable`, and `requestId` data. `RequestContext` carries tracing and optional actor information without prescribing HTTP, GraphQL, or a desktop transport.

Repositories return domain-shaped records and never expose database rows, storage-provider keys as public URLs, or framework-specific response objects to screens.

## Authentication and authorization

`AuthService` owns session lookup, sign-in, and sign-out. A session contains an account, role, optional creator relationship, access token, and expiry. Authorization remains a service/API responsibility; the frontend must not treat a browser-local project or a stored filename as proof of ownership.

## Domain services

- `CatalogRepository` reads filtered catalog pages and individual content records.
- `ProjectRepository` scopes project reads by `ownerId` and creates records from explicit input.
- `MediaStorage` creates short-lived upload intents and confirms completed objects. It does not imply that the browser uploads directly to the application server.
- `BackendServices` is the composition boundary for a future authenticated adapter.

## Invariants

- IDs and timestamps use the existing domain aliases.
- Publication status and content type reuse domain unions instead of duplicate strings.
- Media upload is asynchronous and separate from metadata publication.
- Creator-defined metadata remains authoritative; technical processing may produce objective metadata only.
- No contract here enables synchronization, payments, moderation, cloud persistence, or authentication in the current alpha.

## Migration rule

When a real adapter is introduced, screens should depend on domain services rather than calling `fetch`, storage SDKs, or auth SDKs directly. Browser-local implementations may satisfy equivalent repository interfaces later, but their current feature-specific behavior must not be changed solely to match this document.
