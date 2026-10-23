CREATE TABLE IF NOT EXISTS social_stories (
  id UUID PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('status', 'photo', 'video')),
  body TEXT NOT NULL CHECK (char_length(body) <= 600),
  audience TEXT NOT NULL CHECK (audience IN ('public', 'friends', 'private')),
  media_storage_key TEXT UNIQUE,
  media_mime_type TEXT CHECK (media_mime_type IS NULL OR media_mime_type IN ('image/jpeg', 'image/png', 'video/mp4')),
  media_size_bytes BIGINT CHECK (media_size_bytes IS NULL OR media_size_bytes > 0),
  media_sha256 TEXT CHECK (media_sha256 IS NULL OR media_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at = created_at + INTERVAL '24 hours'),
  CHECK ((kind = 'status' AND char_length(trim(body)) > 0 AND media_storage_key IS NULL AND media_mime_type IS NULL AND media_size_bytes IS NULL AND media_sha256 IS NULL) OR (kind = 'photo' AND media_storage_key IS NOT NULL AND media_mime_type IS NOT NULL AND media_mime_type IN ('image/jpeg', 'image/png') AND media_size_bytes IS NOT NULL AND media_sha256 IS NOT NULL) OR (kind = 'video' AND media_storage_key IS NOT NULL AND media_mime_type IS NOT NULL AND media_mime_type = 'video/mp4' AND media_size_bytes IS NOT NULL AND media_sha256 IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS social_stories_active_idx ON social_stories (expires_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS social_stories_author_expiry_idx ON social_stories (author_id, expires_at DESC);

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
  IF TG_TABLE_NAME = 'social_posts' THEN
    SELECT
      COALESCE((SELECT SUM(media_size_bytes) FROM social_posts WHERE author_id = owner_key AND id <> NEW.id), 0) +
      COALESCE((SELECT SUM(media_size_bytes) FROM social_stories WHERE author_id = owner_key), 0)
      INTO used_bytes;
  ELSE
    SELECT
      COALESCE((SELECT SUM(media_size_bytes) FROM social_posts WHERE author_id = owner_key), 0) +
      COALESCE((SELECT SUM(media_size_bytes) FROM social_stories WHERE author_id = owner_key AND id <> NEW.id), 0)
      INTO used_bytes;
  END IF;
  IF COALESCE(NEW.media_size_bytes, 0) + used_bytes > 536870912 THEN
    RAISE EXCEPTION 'SOCIAL_MEDIA_QUOTA_EXCEEDED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_posts_media_quota ON social_posts;
DROP TRIGGER IF EXISTS social_stories_media_quota ON social_stories;
CREATE TRIGGER social_posts_media_quota BEFORE INSERT OR UPDATE OF author_id, media_size_bytes OR DELETE ON social_posts FOR EACH ROW EXECUTE FUNCTION enforce_social_post_media_quota();
CREATE TRIGGER social_stories_media_quota BEFORE INSERT OR UPDATE OF author_id, media_size_bytes OR DELETE ON social_stories FOR EACH ROW EXECUTE FUNCTION enforce_social_post_media_quota();
