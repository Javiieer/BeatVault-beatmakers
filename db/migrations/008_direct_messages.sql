CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS direct_messages_sender_recipient_created_idx
  ON direct_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_sender_created_idx
  ON direct_messages (recipient_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_unread_idx
  ON direct_messages (recipient_id, sender_id, created_at DESC) WHERE read_at IS NULL;
