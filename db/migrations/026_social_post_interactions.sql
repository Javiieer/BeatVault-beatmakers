CREATE TABLE IF NOT EXISTS social_post_comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS social_post_comments_recent_idx
  ON social_post_comments (post_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS social_post_comments_author_idx
  ON social_post_comments (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_post_reactions (
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, actor_id)
);
CREATE INDEX IF NOT EXISTS social_post_reactions_active_idx
  ON social_post_reactions (post_id, actor_id) WHERE active = TRUE;
