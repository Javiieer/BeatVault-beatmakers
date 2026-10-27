ALTER TABLE social_post_reports
  ADD COLUMN IF NOT EXISTS post_snapshot JSONB;

UPDATE social_post_reports report
SET post_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'id', post.id,
  'authorId', post.author_id,
  'kind', post.kind,
  'body', post.body,
  'audience', post.audience,
  'createdAt', post.created_at,
  'mediaSha256', post.media_sha256
))
FROM social_posts post
WHERE report.post_id = post.id AND report.post_snapshot IS NULL;

ALTER TABLE social_post_reports
  ALTER COLUMN post_snapshot SET NOT NULL,
  ALTER COLUMN post_id DROP NOT NULL;

ALTER TABLE social_post_reports
  DROP CONSTRAINT IF EXISTS social_post_reports_post_id_fkey;
ALTER TABLE social_post_reports
  ADD CONSTRAINT social_post_reports_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE SET NULL;
