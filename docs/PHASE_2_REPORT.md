# Phase 2 Technical Report

## Summary

The Upload and Library flow now supports multiple local audio files, browser folder selection where supported, a stage-based queue, validation, normalized metadata, session previews, and honest post-reload availability.

## Files

`src/data/localLibraryEngine.ts` contains pure queue types, deduplication, validation, transitions, and metadata normalization. `Upload.tsx` owns session files, removal/publication, and cleanup. `App.tsx` and `sessionPreviewMap.ts` own memory-only previews.

## Flow and States

Files enter `pending`, are validated, then become `ready`, `rejected`, `metadata-unavailable`, or `preview-unavailable`. Only `ready` files publish; no unmeasurable percentage is displayed.

## Decisions

No backend, IndexedDB, cloud storage, fake sample-rate/channel data, or localStorage binary data was added. `webkitdirectory` is progressive enhancement; the normal multi-file picker is the fallback. Codec support controls whether duration and playback are available.

## Tests and Commands

Added Vitest coverage for multiple queue creation, validation rejection, normalized metadata, accessible error text, deduplication, and immutable transitions. Phase 2.1 validation passed: 40 unit tests, 19 E2E tests, typecheck, lint, build, and `git diff --check`.

## Limitations, Risks, Recommendations

Browser codec support differs, especially for FLAC/AAC/container variants. Reload removes the original local file by design, so previews correctly become unavailable. A future provider phase should replace the session reference behind the existing catalog presentation contract and add browser matrix tests for representative codecs.
