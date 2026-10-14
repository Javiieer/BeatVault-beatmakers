CREATE TABLE IF NOT EXISTS marketplace_promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  scope TEXT NOT NULL CHECK (scope IN ('all', 'beat', 'loop', 'one-shot', 'sample-pack')),
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 75),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS marketplace_promotions_updated_idx
  ON marketplace_promotions (updated_at DESC);
