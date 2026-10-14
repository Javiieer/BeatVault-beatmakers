ALTER TABLE beat_orders DROP CONSTRAINT IF EXISTS beat_orders_status_check;

ALTER TABLE beat_orders
  ADD CONSTRAINT beat_orders_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'refund_pending', 'refunded', 'partially_refunded', 'disputed'));
