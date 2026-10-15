ALTER TABLE catalog_artwork
  ADD COLUMN IF NOT EXISTS thumbnail_storage_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS thumbnail_size_bytes BIGINT;

ALTER TABLE catalog_artwork
  DROP CONSTRAINT IF EXISTS catalog_artwork_thumbnail_size_bytes_check;

ALTER TABLE catalog_artwork
  ADD CONSTRAINT catalog_artwork_thumbnail_size_bytes_check
  CHECK (thumbnail_size_bytes IS NULL OR thumbnail_size_bytes BETWEEN 16 AND 524288);

ALTER TABLE catalog_artwork
  ADD CONSTRAINT catalog_artwork_thumbnail_pair_check
  CHECK ((thumbnail_storage_key IS NULL) = (thumbnail_size_bytes IS NULL));
