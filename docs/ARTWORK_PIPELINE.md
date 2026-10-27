# Beat artwork pipeline

## Current behavior

- Creator uploads accept static JPG, PNG, WebP and AVIF artwork, up to 10 MB,
  16 megapixels and 64 MiB decoded pixels. Both sides must be at least 640 pixels.
  Landscape/portrait images are center-cropped to a square of up to 4000 pixels,
  as explained in the upload form. Signatures, MIME and full decoding are checked.
- New images are normalized to JPEG/PNG with orientation applied and EXIF/XMP removed.
  The stored master is this normalized image; source bytes are not retained for new
  artwork. Existing artwork records remain unchanged. Catalog, creator
  upload and staff-review cards use a 640 px WebP derivative (up to 512 KB) when
  FFmpeg can decode the image and create one smaller than the original. A valid image
  whose derivative is larger falls back to the original; if the server cannot decode
  it, the upload is rejected rather than preserving an unchecked image.
- Stored normalized master and derivative bytes count toward the creator's configured storage limit.
  Public catalog delivery exposes only artwork attached to published entries;
  unpublished artwork stays behind the existing owner/staff authorization checks.
- Browser artwork is lazy-loaded where it appears in long card lists.

## Existing records

Migration `024_catalog_artwork_thumbnail.sql` adds optional derivative metadata. To
inspect records that predate that migration, run this from the repository root:

```powershell
npm run artwork:backfill -- --dry-run
```

After backing up the selected JSON data directory or PostgreSQL database **and** the
upload directory, apply missing derivatives with:

```powershell
npm run artwork:backfill -- --apply
```

An optional `--owner ACCOUNT_ID` scopes either mode to one account. The operation is
idempotent, never replaces a master, respects effective account/plan/server quotas,
and removes a generated derivative if its metadata cannot be saved. Quota-limited
items and records without a usable original/FFmpeg output remain on the original-image
fallback. PostgreSQL must have migrations through 024 before applying.

## Scope and release status

This completes the artwork handling required for local Beat/One-shot upload and small
catalog cards. Opening the original in a dedicated Beat detail view remains a separate
product task. Artwork processing is not a malware scanner, rights check or security
certification; keep image decoding isolated and review access controls before hosting.

The upload flow follows the useful separation visible in BeatStars' public guidance:
track creation associates cover art with a track, while its file-storage workflow
handles reusable photos separately. BeatVault intentionally stays narrower: one cover
per uploaded audio asset, no generalized image library, and the original remains
private unless the catalog entry is public. References: [BeatStars track upload]
(https://help.beatstars.com/hc/en-us/articles/1260802609630-How-Do-I-Upload-Tracks),
[BeatStars photo upload](https://help.beatstars.com/hc/en-us/articles/4404894988187-How-Do-I-Upload-A-Photo).

Local readiness does not imply public-launch readiness. The current VPS is a scaffold;
production still needs the repository's release blockers closed, including clean and
upgrade migrations through 024, production email/admin provisioning, isolated media
decoding, off-host database-plus-media backup/restore, and an operational security
review. Do not expose the current local server directly to the internet.
