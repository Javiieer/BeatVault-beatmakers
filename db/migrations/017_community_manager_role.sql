ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_role_check
  CHECK (role IN ('creator', 'community_manager', 'admin'));
