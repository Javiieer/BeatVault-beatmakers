# Bugs

The confirmed Shorts audit gaps are corrected: shared hash links open the requested clip, beat links resolve against local mock data, follows use creator handles, and draft editing no longer mutates saved state before Save. Automated browser tests are not present, so validation is build/type validation plus manual interaction testing.

## Storage boundary

The upload draft is best-effort browser localStorage. Corrupt or unavailable storage is handled in the UI, but the draft cannot survive browser storage clearing, private-mode restrictions, or quota exhaustion. No cloud backup or synchronization is implied.

## Known integration constraint

The browser cannot directly write files into the Termux Android filesystem without an explicit transport or handoff mechanism. This is a planned Phase 5 integration concern, not a confirmed application bug.

## File metadata boundary

Audio duration is best-effort browser metadata. Unsupported, unreadable, or non-audio files show `Not available`; the selected file itself is never persisted in the local draft.

## Retired capture boundary

Capture is not part of the current UI. Project handoff uses Markdown files; no browser-to-Termux transfer is supported.

## Retired capture history boundary

Capture history is not part of the current UI; historical notes are retained only as documentation.

## Known alpha gaps

- `npm run lint` currently runs TypeScript compilation; no independent ESLint configuration is installed.
- Only the four bundled FL Studio demo WAVs have playable previews. Other mock assets intentionally have no audio source.
- Project, favorite, draft, and capture data are isolated to the current browser profile and are lost when browser storage is cleared or unavailable.
- The sidebar status text remains a broad workspace message; individual features provide the more precise local-save status. It must not be interpreted as cloud synchronization.
- No automated test suite, backend, authentication, publication service, moderation, cloud sync, or direct Termux transport exists.
- Shorts draft cross-surface updates are local browser events/storage events only; blocked storage is session-only and the selected video cannot be restored after reload because only its filename is persisted. Review correctly requires reselecting it.
- Library can edit and archive/restore a Shorts draft, but sends the user to Shorts for review so a real video File can be selected again.
- Invalid or oversized video selections clear both the preview URL and metadata; selected video content remains session-only.
- Shorts archived status is preserved when opening and saving the editor. Restoring to Draft is an explicit action only.
- `saveShortDraft` now exposes storage failure to the modal instead of reporting a false successful save.
