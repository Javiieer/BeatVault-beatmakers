ALTER TABLE social_story_reports
  ADD COLUMN IF NOT EXISTS evidence_expired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS social_story_reports_open_evidence_age_idx
  ON social_story_reports (created_at) WHERE status = 'open' AND evidence_storage_key IS NOT NULL;
