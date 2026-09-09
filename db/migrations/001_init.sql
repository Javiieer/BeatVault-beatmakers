CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'creator' CHECK (role IN ('creator', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'working', 'demo', 'ready', 'released')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, title)
);

CREATE TABLE IF NOT EXISTS catalog_assets (
  content_id UUID PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  tag_ids TEXT[] NOT NULL DEFAULT '{}',
  preview_ids TEXT[] NOT NULL DEFAULT '{}',
  publication_status TEXT NOT NULL DEFAULT 'pending-review' CHECK (publication_status IN ('draft', 'pending-review', 'published', 'rejected', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_id, title, type)
);

CREATE INDEX IF NOT EXISTS projects_owner_updated_idx ON projects (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS catalog_creator_updated_idx ON catalog_assets (creator_id, updated_at DESC);
