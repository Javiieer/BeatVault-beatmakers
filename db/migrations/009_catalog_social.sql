CREATE TABLE IF NOT EXISTS catalog_comments (
  id UUID PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES catalog_assets(content_id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_comments_content_created_idx
  ON catalog_comments (content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS catalog_reactions (
  content_id UUID NOT NULL REFERENCES catalog_assets(content_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (content_id, actor_id)
);

CREATE INDEX IF NOT EXISTS catalog_reactions_actor_idx
  ON catalog_reactions (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS catalog_activity (
  id UUID PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES catalog_assets(content_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('comment', 'reaction')),
  body TEXT CHECK (body IS NULL OR char_length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_activity_content_created_idx
  ON catalog_activity (content_id, created_at DESC);
