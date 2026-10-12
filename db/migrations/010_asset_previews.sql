ALTER TABLE assets ADD COLUMN preview_storage_key TEXT UNIQUE;
ALTER TABLE assets ADD COLUMN preview_mime_type TEXT;
ALTER TABLE assets ADD COLUMN preview_size_bytes BIGINT;
ALTER TABLE assets ADD CONSTRAINT assets_preview_metadata_complete CHECK (
  (preview_storage_key IS NULL AND preview_mime_type IS NULL AND preview_size_bytes IS NULL)
  OR
  (preview_storage_key IS NOT NULL AND preview_mime_type IS NOT NULL AND preview_mime_type = 'audio/mp4' AND preview_size_bytes IS NOT NULL AND preview_size_bytes > 0)
);
