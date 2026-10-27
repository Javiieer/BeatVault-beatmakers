CREATE TABLE account_catalog_favorites (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES catalog_assets(content_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, content_id)
);
CREATE INDEX account_catalog_favorites_recent_idx ON account_catalog_favorites(account_id, created_at DESC, content_id);

CREATE TABLE marketplace_listing_review_state (
  content_id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (content_id, owner_id) REFERENCES marketplace_beat_listing_drafts(content_id, owner_id) ON DELETE CASCADE
);
-- Legacy decisions are imported conservatively by the application, only after checking
-- actor roles, the current listing/evidence revision and independent CM/admin decisions.
-- Missing or unverifiable audit history never produces an approval.
