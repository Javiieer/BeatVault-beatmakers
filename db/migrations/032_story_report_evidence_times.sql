ALTER TABLE social_story_reports
  ADD COLUMN IF NOT EXISTS story_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ;

UPDATE social_story_reports
SET story_created_at = created_at,
    story_expires_at = created_at + INTERVAL '24 hours'
WHERE story_created_at IS NULL OR story_expires_at IS NULL;

ALTER TABLE social_story_reports
  ALTER COLUMN story_created_at SET NOT NULL,
  ALTER COLUMN story_expires_at SET NOT NULL;
