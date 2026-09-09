# Local Library Engine Specification

**Status:** Phase 2.2 implemented for browser-local sessions
**Scope:** Browser-local development only

## Goal

Allow a producer to select supported audio files locally, inspect basic metadata, preview the file during the current session, and publish normalized catalog metadata without pretending that browser storage is durable audio storage.

## Current MVP Behavior

- User selects multiple supported audio files or a folder when `webkitdirectory` is available; the regular file picker remains the fallback.
- The file is validated by size, extension, and MIME type.
- Duration is read through a temporary browser object URL when the browser supports the codec.
- Only normalized catalog metadata and the upload draft are stored in localStorage; `File`, `Blob`, and object URLs are never persisted.
- The selected `File` and temporary preview URL exist only for the current browser session.
- Catalog records without a durable file reference must visibly communicate that limitation.
- Published local records expose `session-preview`, `metadata-only`, `preview-unavailable`, `rejected`, or `missing`; a persisted `session-preview` becomes `missing` after reload until the source is selected again.
- The import queue exposes `pending`, `validating`, `ready`, `rejected`, `metadata-unavailable`, and `preview-unavailable` states.
- The queue displays name, size, stage, errors, and individual removal. Duplicate selections with the same name, size, and modification time are ignored.
- Publication only considers `ready` rows and reports catalog/storage failures by asset.
- Progress is represented by stages, not a fabricated percentage.

## Asset Lifecycle

```text
selected
  -> validated
  -> metadata-read
  -> session-preview
  -> catalog-draft
  -> pending-review
```

Possible failure states:

- `invalid-format`
- `too-large`
- `empty-file`
- `metadata-unavailable`
- `preview-unavailable`
- `storage-unavailable`

## Data Separation

The UI and future API must keep these concepts separate:

- **Catalog metadata:** name, type, tags, BPM, key, duration, format, size.
- **File reference:** a local session reference today; a durable provider reference later.
- **Preview:** temporary object URL today; expiring server/provider preview later.
- **Sync state:** local/session state today; provider synchronization state later.

## Browser Constraints

- `localStorage` cannot persist `File` or `Blob` values.
- Object URLs must be revoked after metadata inspection, replacement, error, or unmount.
- Removing, replacing, publishing, failed persistence, and unmounting release session object URLs where ownership remains local.
- Browser codec support is not uniform, especially for FLAC, AAC, and some container variants.
- A catalog record must not claim that an asset is permanently available when only metadata was persisted.
- Re-selection is performed through the existing Upload file picker; it never stores a `File`, `Blob`, or object URL.

## Next Implementation Slice

Session-level preview mapping remains memory-only and keyed by catalog asset ID. On page reload, the catalog remains visible with `missing` until the file is selected again in Upload.

Do not introduce IndexedDB, backend uploads, folder synchronization, MediaFire, OAuth, or cloud APIs in this slice.

## Future Provider Transition

When the VPS phase begins, replace the session file reference with a provider-neutral `FileReference` and expose previews through a permission-checked API. MediaFire and BeatVault Cloud adapters should translate their own identifiers into that contract; Library components must not import provider SDKs.

## Acceptance Criteria

- Unsupported files are rejected before metadata work.
- Temporary object URLs are always cleaned up.
- Duration is optional and honest when unavailable.
- Reloading does not imply that the original local file still exists.
- Preview controls clearly distinguish available, unavailable, and loading states.
- The same normalized catalog record can later be backed by a VPS provider without changing the Library presentation model.

## Honest Limitations

Folder selection is a progressive enhancement and is not available in every browser. Duration depends on the browser media codec; sample rate and channel count are intentionally not inferred. After reload, persisted catalog entries remain visible but have no local preview until the source file is selected again.
