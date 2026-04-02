-- Migration: Stripe integration
-- Adds Stripe customer tracking, subscriptions, subscription plans,
-- credit packages, event audit log, payment consent, and widens
-- credit_transactions.related_entity_id for Stripe session IDs.

-- 1. Stripe customer ID on users
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) UNIQUE;

-- 2. Subscriptions (one active row per user)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_price_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'incomplete',
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Admin-configurable subscription plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL,
  interval VARCHAR(20) NOT NULL DEFAULT 'month',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Admin-configurable credit packages
CREATE TABLE credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Widen related_entity_id to support Stripe session IDs
ALTER TABLE credit_transactions
  ALTER COLUMN related_entity_id TYPE VARCHAR(255)
  USING related_entity_id::text;

-- 6. Stripe webhook event audit log
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

-- 7. Payment consent type on user_consents
ALTER TABLE user_consents
  ADD COLUMN consent_type VARCHAR(20) NOT NULL DEFAULT 'login';

CREATE INDEX IF NOT EXISTS user_consents_user_type_idx
  ON user_consents (user_id, consent_type);
