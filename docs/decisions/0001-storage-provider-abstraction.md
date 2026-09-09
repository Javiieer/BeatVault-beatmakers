# ADR 0001: Storage Provider Abstraction

**Status:** Proposed
**Scope:** Future cloud architecture
**Date:** 2026-09-01

## Context

BeatVault is being developed locally today, but the production platform is expected to run on a VPS with shared services and a BeatVault cloud. Users may also connect external storage providers and use them as the source for their own projects and audio assets.

BeatVault should show searchable metadata and controlled audio previews without forcing every file to be copied into BeatVault storage.

## Decision

Introduce a provider-agnostic storage boundary between BeatVault and file providers.

The future system will separate:

- **Provider connection:** account/integration configuration and authorization state.
- **File reference:** provider, remote identifier, path metadata, size, MIME type, and user ownership.
- **Indexed metadata:** BeatVault-owned searchable metadata and waveform/preview references.
- **Preview access:** short-lived, permission-checked URLs or proxied preview streams.
- **Sync state:** indexed, changed, unavailable, revoked, or error.

Potential providers include BeatVault Cloud and external cloud services, but no provider is selected or implemented yet.

## Security Rules

- Provider access tokens must remain server-side and must never be sent to the browser or stored in localStorage.
- Preview URLs must be short-lived and scoped to the authenticated user and asset.
- Full downloads and previews must use separate permissions.
- Disconnecting a provider must revoke or invalidate its access and preserve clear user-facing sync status.
- External provider webhooks and polling must be treated as untrusted input and validated.
- The VPS should not become a blind proxy with unrestricted access to a user's entire external drive.

## Consequences

### Benefits

- Users can keep originals in their preferred storage.
- BeatVault can index production metadata without duplicating every binary.
- BeatVault Cloud can be added as one provider rather than becoming a hard-coded special case.
- Local-first development can continue using browser-local adapters.

### Costs and Risks

- OAuth and provider-specific APIs require dedicated backend adapters.
- Provider rate limits, revoked permissions, moved files, and offline state must be modeled.
- Waveforms and previews may need to be generated and cached by BeatVault.
- Licensing and privacy policies differ by provider.
- A preview-only experience still requires careful authorization and storage cost controls.

## Deferred Work

Do not implement external provider integrations, OAuth, VPS deployment, cloud sync, preview proxying, billing, or account management until the provider contract and threat model are specified.

## Initial Contract Direction

Future adapters should expose operations conceptually similar to:

```text
connect()
listFiles(cursor, filter)
getMetadata(fileId)
createPreviewAccess(fileId, expiresAt)
disconnect()
```

The application should consume normalized BeatVault asset records, not provider-specific response shapes.
