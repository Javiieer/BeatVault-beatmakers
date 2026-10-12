ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS purchased_plan_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_purchased_plan_ids_valid'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_purchased_plan_ids_valid
      CHECK (
        jsonb_typeof(purchased_plan_ids) = 'array'
        AND purchased_plan_ids <@ '["creator", "studio"]'::jsonb
      );
  END IF;
END $$;
