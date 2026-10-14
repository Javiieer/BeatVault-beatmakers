CREATE TABLE beat_orders (
  id UUID PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES accounts(id),
  seller_id TEXT NOT NULL REFERENCES accounts(id),
  checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'disputed')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX beat_orders_buyer_created_idx ON beat_orders (buyer_id, created_at DESC);
