ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'free'
  CHECK (plan_id IN ('free', 'creator', 'studio'));
