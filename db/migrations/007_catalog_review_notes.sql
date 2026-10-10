ALTER TABLE catalog_assets
  ADD COLUMN IF NOT EXISTS review_note TEXT
  CHECK (review_note IS NULL OR char_length(review_note) <= 160);
