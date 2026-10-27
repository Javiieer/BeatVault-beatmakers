ALTER TABLE social_story_reports
  ADD COLUMN IF NOT EXISTS evidence_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS evidence_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS evidence_delete_at TIMESTAMPTZ;

ALTER TABLE social_story_reports
  ADD CONSTRAINT social_story_report_evidence_key_check CHECK (evidence_storage_key IS NULL OR evidence_storage_key = 'moderation-evidence/stories/' || id::text),
  ADD CONSTRAINT social_story_report_evidence_mime_check CHECK (evidence_mime_type IS NULL OR evidence_mime_type IN ('image/jpeg','image/png','video/mp4')),
  ADD CONSTRAINT social_story_report_evidence_size_check CHECK (evidence_size_bytes IS NULL OR evidence_size_bytes BETWEEN 1 AND 104857600),
  ADD CONSTRAINT social_story_report_evidence_fields_check CHECK ((evidence_storage_key IS NULL AND evidence_mime_type IS NULL AND evidence_size_bytes IS NULL) OR (evidence_storage_key IS NOT NULL AND evidence_mime_type IS NOT NULL AND evidence_size_bytes IS NOT NULL));

CREATE INDEX IF NOT EXISTS social_story_reports_evidence_expiry_idx
  ON social_story_reports (evidence_delete_at) WHERE evidence_storage_key IS NOT NULL AND status <> 'open';

CREATE OR REPLACE FUNCTION prevent_blocked_social_follow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(LEAST(NEW.follower_id,NEW.following_id)), hashtext(GREATEST(NEW.follower_id,NEW.following_id)));
  IF EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=NEW.follower_id AND blocked_id=NEW.following_id) OR (blocker_id=NEW.following_id AND blocked_id=NEW.follower_id)) THEN
    RAISE EXCEPTION 'SOCIAL_ACCOUNT_BLOCKED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS social_account_follows_block_guard ON social_account_follows;
CREATE TRIGGER social_account_follows_block_guard BEFORE INSERT OR UPDATE OF follower_id, following_id ON social_account_follows FOR EACH ROW EXECUTE FUNCTION prevent_blocked_social_follow();

CREATE OR REPLACE FUNCTION prevent_blocked_social_relationship() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(LEAST(NEW.requester_id,NEW.recipient_id)), hashtext(GREATEST(NEW.requester_id,NEW.recipient_id)));
  IF EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=NEW.requester_id AND blocked_id=NEW.recipient_id) OR (blocker_id=NEW.recipient_id AND blocked_id=NEW.requester_id)) THEN
    RAISE EXCEPTION 'SOCIAL_ACCOUNT_BLOCKED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_blocked_direct_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(LEAST(NEW.sender_id,NEW.recipient_id)), hashtext(GREATEST(NEW.sender_id,NEW.recipient_id)));
  IF EXISTS (SELECT 1 FROM social_account_blocks WHERE (blocker_id=NEW.sender_id AND blocked_id=NEW.recipient_id) OR (blocker_id=NEW.recipient_id AND blocked_id=NEW.sender_id)) THEN
    RAISE EXCEPTION 'SOCIAL_ACCOUNT_BLOCKED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
