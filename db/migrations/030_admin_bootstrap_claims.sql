CREATE TABLE IF NOT EXISTS admin_bootstrap_claims (
  claim_key TEXT PRIMARY KEY CHECK (claim_key = 'initial-admin'),
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
