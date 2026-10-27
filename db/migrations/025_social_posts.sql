CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('status', 'photo', 'video')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 600),
  audience TEXT NOT NULL CHECK (audience IN ('public', 'friends', 'private')),
  visibility TEXT NOT NULL CHECK (visibility IN ('pending-review', 'published', 'rejected', 'removed')),
  media_storage_key TEXT UNIQUE,
  media_mime_type TEXT CHECK (media_mime_type IS NULL OR media_mime_type IN ('image/jpeg', 'image/png', 'video/mp4')),
  media_size_bytes BIGINT CHECK (media_size_bytes IS NULL OR media_size_bytes > 0),
  media_sha256 TEXT CHECK (media_sha256 IS NULL OR media_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  CHECK ((kind = 'status' AND media_storage_key IS NULL AND media_mime_type IS NULL AND media_size_bytes IS NULL AND media_sha256 IS NULL) OR (kind = 'photo' AND media_storage_key IS NOT NULL AND media_mime_type IN ('image/jpeg', 'image/png') AND media_size_bytes IS NOT NULL AND media_sha256 IS NOT NULL) OR (kind = 'video' AND media_storage_key IS NOT NULL AND media_mime_type = 'video/mp4' AND media_size_bytes IS NOT NULL AND media_sha256 IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS social_posts_feed_idx ON social_posts (created_at DESC, id DESC) WHERE visibility = 'published';
CREATE INDEX IF NOT EXISTS social_posts_author_idx ON social_posts (author_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS social_posts_review_idx ON social_posts (created_at ASC) WHERE visibility = 'pending-review';

CREATE TABLE IF NOT EXISTS social_post_reports (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'copyright', 'nudity', 'violence', 'other')),
  details TEXT NOT NULL CHECK (char_length(details) <= 500),
  status TEXT NOT NULL CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  UNIQUE (post_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS social_post_reports_queue_idx ON social_post_reports (created_at DESC) WHERE status = 'open';

CREATE OR REPLACE FUNCTION enforce_social_post_media_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_key TEXT;
  used_bytes BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  owner_key := NEW.author_id;
  PERFORM pg_advisory_xact_lock(hashtext(owner_key));
  SELECT COALESCE(SUM(media_size_bytes), 0) INTO used_bytes FROM social_posts WHERE author_id = owner_key AND id <> NEW.id;
  IF COALESCE(NEW.media_size_bytes, 0) + used_bytes > 536870912 THEN
    RAISE EXCEPTION 'SOCIAL_MEDIA_QUOTA_EXCEEDED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS social_posts_media_quota ON social_posts;
CREATE TRIGGER social_posts_media_quota BEFORE INSERT OR UPDATE OF author_id, media_size_bytes OR DELETE ON social_posts FOR EACH ROW EXECUTE FUNCTION enforce_social_post_media_quota();
