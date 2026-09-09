# Phase 2.2 Technical Report

## Decisions

- Published local assets now carry an explicit availability state: `session-preview`, `metadata-only`, `preview-unavailable`, `rejected`, or `missing`.
- Object URLs remain exclusively in the in-memory session preview map. They are revoked on replacement, failure, and unmount.
- A persisted `session-preview` state is interpreted as `missing` after reload because the browser no longer owns the File.
- Recovery uses the existing Upload picker. No File, Blob, object URL, IndexedDB, backend, or second confusing re-link workflow was added.
- Technical metadata stays honest: duration is nullable and sample rate/channels are not inferred.

## Files

- `src/types/index.ts`: local availability contract.
- `src/data/localLibraryEngine.ts`: state mapping helper.
- `src/data/localCatalog.ts`: persisted-state validation.
- `src/app/App.tsx`: correct current asset association for multiple publication calls.
- `src/components/Library.tsx`: session-versus-missing presentation.
- `src/components/Upload.tsx`: availability written at publication.
- `src/components/ui-audio.tsx`: unavailable previews are visibly and accessibly non-playable.
- `src/data/localLibraryEngine.test.ts`: state mapping coverage.

## Flow

Select and validate a File, read only browser-provided metadata, create a session URL when possible, and publish metadata. The URL is registered by catalog asset ID in memory. On reload, metadata remains but the asset is `missing`; the user selects the source again in Upload.

## Tests

Unit and DOM tests cover queue validation, duplicate filtering, honest metadata, availability mapping, and existing Library/Upload browser flows. Full command results are recorded in the handoff after validation.

## Limitations and Recommendations

Codec support, playback, duration, storage quota, and object URL behavior remain browser-dependent. Before a durable provider phase, add real codec matrix coverage and replace the session reference behind a provider-neutral file reference.
