CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, content_hash TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0), state TEXT NOT NULL CHECK (state IN ('available','missing','metadata-only')),
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_owner_created_idx ON assets (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assets_owner_hash_idx ON assets (owner_id, content_hash);
