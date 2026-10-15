CREATE TABLE IF NOT EXISTS catalog_artwork (
  asset_id UUID PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  width INTEGER NOT NULL CHECK (width BETWEEN 640 AND 10000),
  height INTEGER NOT NULL CHECK (height BETWEEN 640 AND 10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_artwork_owner_idx ON catalog_artwork (owner_id);
