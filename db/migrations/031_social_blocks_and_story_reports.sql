CREATE TABLE IF NOT EXISTS social_account_blocks (
  blocker_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS social_account_blocks_reverse_idx ON social_account_blocks (blocked_id, blocker_id);

CREATE OR REPLACE FUNCTION prevent_blocked_social_relationship() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=NEW.requester_id AND blocked_id=NEW.recipient_id) OR (blocker_id=NEW.recipient_id AND blocked_id=NEW.requester_id)) THEN
    RAISE EXCEPTION 'SOCIAL_ACCOUNT_BLOCKED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS friendships_block_guard ON friendships;
CREATE TRIGGER friendships_block_guard BEFORE INSERT OR UPDATE OF requester_id, recipient_id, status ON friendships FOR EACH ROW EXECUTE FUNCTION prevent_blocked_social_relationship();

CREATE OR REPLACE FUNCTION prevent_blocked_direct_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=NEW.sender_id AND blocked_id=NEW.recipient_id) OR (blocker_id=NEW.recipient_id AND blocked_id=NEW.sender_id)) THEN
    RAISE EXCEPTION 'SOCIAL_ACCOUNT_BLOCKED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS direct_messages_block_guard ON direct_messages;
CREATE TRIGGER direct_messages_block_guard BEFORE INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION prevent_blocked_direct_message();

-- Reports retain a bounded text snapshot and media hash, so staff can review
-- evidence after the 24-hour Story has expired or its author deletes it.
CREATE TABLE IF NOT EXISTS social_story_reports (
  id UUID PRIMARY KEY,
  story_id UUID NOT NULL,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  story_kind TEXT NOT NULL CHECK (story_kind IN ('status', 'photo', 'video')),
  story_body TEXT NOT NULL CHECK (char_length(story_body) <= 600),
  story_audience TEXT NOT NULL CHECK (story_audience IN ('public', 'friends', 'private')),
  media_sha256 TEXT CHECK (media_sha256 IS NULL OR media_sha256 ~ '^[a-f0-9]{64}$'),
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'copyright', 'nudity', 'violence', 'other')),
  details TEXT NOT NULL CHECK (char_length(details) <= 500),
  status TEXT NOT NULL CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  CHECK (reporter_id <> author_id),
  UNIQUE (story_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS social_story_reports_queue_idx ON social_story_reports (created_at DESC) WHERE status = 'open';
