# Social Posts Backend

Home status/photo/video posts now have an independent `social_posts` contract and JSON/PostgreSQL repositories. Authenticated Home and CreatorProfile use server-backed posts; existing browser-local IndexedDB records remain device-only and are not automatically migrated.

## API

- `POST /api/posts`: authenticated and CSRF-protected. JSON accepts only `{ kind: "status", body, audience }`. Multipart photo/video requests use `X-Social-Post-Kind: photo|video`, fields `body` and `audience`, and one `file`. The server derives `authorId` from the session.
- `GET /api/feed` or `GET /api/posts`: visible feed with `limit` and opaque `cursor`.
- `GET /api/profiles/:id/posts`: profile posts, including accepted friends on a private profile, subject to each post's audience.
- `GET /api/posts/:id/media`: checks current post visibility and friendship on every request; private/no-store response.
- `DELETE /api/posts/:id`: owner only, CSRF-protected.
- `POST /api/posts/:id/reports`: report a published post visible to the reporter. One report per account/post.
- `GET /api/posts/:id/social`: authenticated interaction snapshot for a visible, published post: `{ comments: [{ id, authorId, authorName, body, createdAt }], reactionCount, reactedByMe }`.
- `POST /api/posts/:id/comments`: authenticated and CSRF-protected; accepts `{ body }` with 1-500 trimmed characters and returns the full interaction snapshot.
- `POST /api/posts/:id/reaction`: authenticated and CSRF-protected; accepts `{}` and atomically toggles one reaction per account/post, returning `{ reacted, reactionCount }`.
- `GET /api/social-moderation/posts`, `PATCH /api/social-moderation/posts/:id`, `GET /api/social-moderation/reports`, `PATCH /api/social-moderation/reports/:id`: community manager/admin only; mutations require CSRF and persist an audit event.

Posts are published immediately after successful upload. Public posts require an opted-in public profile; friends-only access requires an accepted friendship; private posts are owner-only. Users can report visible posts, and community managers/admins can review reports and remove content with an audit event. The legacy pending-review state remains readable for previously queued records. IndexedDB posts are untouched and never imported automatically.

Comments and reactions belong to these social posts, not catalog items. Interaction reads/writes require a session and the post must still be `published` and visible to the viewer (the author, any eligible viewer of a public post, or an accepted friend for a friends-only post). Removed, rejected, pending-review, private-to-others, and otherwise hidden posts return not found. Each comment and reaction mutation emits an audit event. PostgreSQL migration `026_social_post_interactions.sql` owns the interaction tables; deleting a post cascades its rows. JSON mode stores comments and reactions separately and removes them when the author deletes the post.

## Media limits

- Photos: JPEG/PNG, max 20 MiB and 16 megapixels. Bytes are bounded by the request limit; image structure is inspected, and FFmpeg fully decodes the image with a 20-second timeout. Before permanent storage, Sharp re-encodes JPEG/PNG to strip EXIF/XMP/IPTC metadata, applies EXIF orientation to pixels, and preserves PNG alpha; JPEG is recompressed at quality 92.
- Videos: MP4 with H.264, max 100 MiB, 180 seconds, and 1920x1080. `ffprobe` validates metadata; FFmpeg decodes video with a 20-second timeout. The upload is streamed to a temporary file and hashed as a stream rather than loaded whole into RAM.
- Per-account social media quota: 512 MiB. JSON enforces it under serialized file updates; PostgreSQL enforces it with a transaction-scoped advisory-lock trigger.
- Media processing: at most one active social-media job per account and two per server process. These in-memory limits are per process, not distributed across multiple application instances.
- Storage keys are generated server-side under `social-posts/`; neither filename nor MIME type is trusted as identity. Failed saves remove the media. Startup reconciliation removes unreferenced UUID media and temporary uploads older than one hour.

Set `BEATVAULT_FFPROBE_PATH` when `ffprobe` is not on PATH. The existing `BEATVAULT_FFMPEG_PATH` selects FFmpeg. PostgreSQL deployments must apply migration `025_social_posts.sql` and then `026_social_post_interactions.sql` before starting the updated API.

## Remaining integration

Local two-account API workflows and PostgreSQL migration/backup-restore QA have been exercised. Public deployment still requires durable shared object storage and production operational setup. Local IndexedDB records require an explicit import flow if users later want to bring them into their account. Social-post comments/reactions are not yet connected to the notification center.
