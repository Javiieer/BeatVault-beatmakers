-- Mercado Pago persistence is separate from the existing Stripe tables and
-- beat_orders JSON. Token values must already be encrypted by the caller.
CREATE TABLE mercadopago_seller_links (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL CHECK (application_id ~ '^[0-9]{1,40}$'),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'production')),
  provider_user_id TEXT NOT NULL CHECK (length(provider_user_id) BETWEEN 1 AND 128),
  encrypted_access_token TEXT NOT NULL CHECK (length(encrypted_access_token) <= 11050 AND encrypted_access_token ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
  encrypted_refresh_token TEXT NOT NULL CHECK (length(encrypted_refresh_token) <= 11050 AND encrypted_refresh_token ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('connected', 'reauthorization_required', 'deauthorized')),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, application_id, mode),
  UNIQUE (application_id, mode, provider_user_id)
);

-- OAuth state is stored as a SHA-256 digest, is single-use, and is removed
-- when consumed. Expired rows can be removed by the repository cleanup method.
CREATE TABLE mercadopago_oauth_intents (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL CHECK (application_id ~ '^[0-9]{1,40}$'),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'production')),
  session_binding_hash TEXT NOT NULL CHECK (session_binding_hash ~ '^[a-f0-9]{64}$'),
  encrypted_code_verifier TEXT NOT NULL CHECK (length(encrypted_code_verifier) <= 11050 AND encrypted_code_verifier ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX mercadopago_oauth_intents_expiry_idx ON mercadopago_oauth_intents (expires_at);

-- A provider payment attempt is linked to the canonical order but does not
-- rewrite historical Stripe identifiers or order records.
CREATE UNIQUE INDEX beat_orders_id_seller_idx ON beat_orders (id, seller_id);
CREATE INDEX beat_orders_mercadopago_preference_idx ON beat_orders ((data->>'mercadoPagoPreferenceId'))
  WHERE data->>'paymentProvider'='mercadopago' AND data ? 'mercadoPagoPreferenceId';
CREATE INDEX beat_orders_mercadopago_payment_idx ON beat_orders ((data->>'mercadoPagoPaymentId'))
  WHERE data->>'paymentProvider'='mercadopago' AND data ? 'mercadoPagoPaymentId';
CREATE TABLE mercadopago_order_payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  seller_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'production')),
  application_id TEXT NOT NULL CHECK (application_id ~ '^[0-9]{1,40}$'),
  provider_user_id TEXT NOT NULL CHECK (length(provider_user_id) BETWEEN 1 AND 128),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9:_-]{8,128}$'),
  preference_id TEXT NOT NULL CHECK (length(preference_id) BETWEEN 1 AND 200),
  checkout_url TEXT NOT NULL,
  external_reference TEXT NOT NULL CHECK (external_reference = order_id::text),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency TEXT NOT NULL CHECK (currency = 'MXN'),
  quote_snapshot JSONB NOT NULL CHECK (jsonb_typeof(quote_snapshot) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'approved', 'rejected', 'cancelled', 'expired', 'refund_pending', 'refunded', 'partially_refunded', 'disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (order_id, seller_id) REFERENCES beat_orders(id, seller_id) ON DELETE RESTRICT,
  UNIQUE (application_id, mode, provider_user_id, idempotency_key),
  UNIQUE (application_id, mode, provider_user_id, preference_id),
  UNIQUE (application_id, mode, provider_user_id, preference_id, order_id)
);
CREATE INDEX mercadopago_order_payments_order_created_idx
  ON mercadopago_order_payments (order_id, created_at DESC);

-- One preference can result in multiple payment attempts/IDs. Keep every
-- provider payment so a second approval can be detected without duplicating
-- the entitlement attached to the canonical order.
CREATE TABLE mercadopago_provider_payments (
  payment_id TEXT NOT NULL CHECK (payment_id ~ '^[1-9][0-9]{0,31}$'),
  attempt_id TEXT NOT NULL CHECK (length(attempt_id) BETWEEN 1 AND 128),
  order_id UUID NOT NULL REFERENCES beat_orders(id) ON DELETE RESTRICT,
  application_id TEXT NOT NULL CHECK (application_id ~ '^[0-9]{1,40}$'),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'production')),
  provider_user_id TEXT NOT NULL CHECK (provider_user_id ~ '^[1-9][0-9]{0,31}$'),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor),
  currency TEXT NOT NULL CHECK (currency = 'MXN'),
  status TEXT NOT NULL CHECK (length(status) BETWEEN 1 AND 64),
  status_detail TEXT NOT NULL CHECK (length(status_detail) <= 100),
  normalized_status TEXT NOT NULL CHECK (normalized_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (application_id, mode, payment_id),
  FOREIGN KEY (application_id, mode, provider_user_id, attempt_id, order_id)
    REFERENCES mercadopago_order_payments(application_id, mode, provider_user_id, preference_id, order_id) ON DELETE RESTRICT
);

-- Preference creation is reserved before the outbound request. After an
-- ambiguous network failure the row remains uncertain to prevent duplicates.
CREATE TABLE mercadopago_preference_reservations (
  application_id TEXT NOT NULL CHECK (application_id ~ '^[0-9]{1,40}$'),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'production')),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 8 AND 512),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES beat_orders(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL CHECK (operation_id ~ '^[A-Za-z0-9:_-]{8,128}$'),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'complete', 'uncertain')),
  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (application_id, mode, key),
  UNIQUE (key),
  CHECK ((status = 'complete') = (result IS NOT NULL))
);

-- This ledger is explicitly namespaced across provider and environment.
-- stripe_webhook_events remains intact for legacy Stripe webhook history.
CREATE TABLE provider_webhook_events (
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, environment, event_id)
);
