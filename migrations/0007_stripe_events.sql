-- Migration: Stripe event log for audit
-- Records every Stripe webhook event with full metadata.

CREATE TABLE stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX idx_stripe_events_user ON stripe_events(user_id);
CREATE INDEX idx_stripe_events_created ON stripe_events(created_at DESC);
