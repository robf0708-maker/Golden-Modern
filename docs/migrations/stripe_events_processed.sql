-- Tabela de controle de idempotência para webhooks do Stripe.
-- Evita processar o mesmo event.id duas vezes quando o Stripe reenvia
-- (ex.: após falha de rede). Usada pela função storage.tryRecordStripeEvent().

CREATE TABLE IF NOT EXISTS stripe_events_processed (
  id TEXT PRIMARY KEY,                                    -- event.id do Stripe (ex.: "evt_1Abc...")
  event_type TEXT NOT NULL,                               -- tipo do evento (checkout.session.completed, invoice.paid, etc.)
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_events_processed(processed_at DESC);
