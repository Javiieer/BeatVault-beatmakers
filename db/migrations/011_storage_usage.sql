CREATE TABLE IF NOT EXISTS account_storage_usage (
  owner_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO account_storage_usage (owner_id, used_bytes)
SELECT owner_id, SUM(size_bytes)::BIGINT
FROM assets
WHERE state = 'available'
GROUP BY owner_id
ON CONFLICT (owner_id) DO UPDATE
SET used_bytes = EXCLUDED.used_bytes, updated_at = NOW();
