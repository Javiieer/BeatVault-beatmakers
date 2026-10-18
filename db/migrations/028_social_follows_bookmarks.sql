CREATE TABLE IF NOT EXISTS social_account_follows (
  follower_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS social_account_follows_target_idx
  ON social_account_follows (following_id, follower_id);

CREATE TABLE IF NOT EXISTS social_post_bookmarks (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, post_id)
);

CREATE INDEX IF NOT EXISTS social_post_bookmarks_recent_idx
  ON social_post_bookmarks (account_id, created_at DESC, post_id DESC);
