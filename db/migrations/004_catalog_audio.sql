ALTER TABLE catalog_assets ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE catalog_assets ADD COLUMN IF NOT EXISTS cover_id TEXT CHECK (cover_id IN ('808', 'orchestra', 'lo-fi'));
CREATE UNIQUE INDEX IF NOT EXISTS catalog_owned_audio_idx ON catalog_assets (creator_id, asset_id) WHERE asset_id IS NOT NULL;
