CREATE TABLE marketplace_beat_listing_drafts (
  content_id UUID PRIMARY KEY REFERENCES catalog_assets(content_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX marketplace_beat_listing_drafts_owner_updated_idx
  ON marketplace_beat_listing_drafts (owner_id, updated_at DESC);

CREATE INDEX marketplace_beat_listing_drafts_data_gin_idx
  ON marketplace_beat_listing_drafts USING GIN (data);
