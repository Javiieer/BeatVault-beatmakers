CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'social_post_comment',
    'social_post_reaction',
    'friend_request',
    'friend_request_accepted'
  )),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('post', 'friendship')),
  resource_id TEXT NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 255),
  source_id TEXT NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 255),
  event_key TEXT NOT NULL UNIQUE CHECK (char_length(event_key) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  CHECK (
    (type IN ('social_post_comment', 'social_post_reaction') AND resource_type = 'post')
    OR (type IN ('friend_request', 'friend_request_accepted') AND resource_type = 'friendship')
  )
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_id_idx
  ON notifications (recipient_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_read_created_id_idx
  ON notifications (recipient_id, read_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_recipient_created_id_idx
  ON notifications (recipient_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;
