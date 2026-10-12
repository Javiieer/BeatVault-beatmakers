CREATE TABLE IF NOT EXISTS account_storage_quotas (
  owner_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  limit_bytes BIGINT NOT NULL CHECK (limit_bytes > 0),
  updated_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
