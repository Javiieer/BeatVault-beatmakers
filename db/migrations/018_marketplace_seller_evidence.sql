ALTER TABLE marketplace_beat_listing_drafts
  ADD CONSTRAINT marketplace_beat_listing_drafts_content_owner_key UNIQUE (content_id, owner_id);

CREATE TABLE marketplace_beat_listing_evidence (
  id UUID PRIMARY KEY,
  content_id UUID NOT NULL,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (content_id, owner_id) REFERENCES marketplace_beat_listing_drafts(content_id, owner_id) ON DELETE CASCADE
);

CREATE INDEX marketplace_beat_listing_evidence_listing_idx
  ON marketplace_beat_listing_evidence (content_id, owner_id, created_at);
