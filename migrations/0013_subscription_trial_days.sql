-- Migration: Add trial_period_days to subscription_plans
-- Admins can configure a free trial (in days) for each plan. Stripe enforces
-- a maximum of 730 days (2 years). 0 or NULL means no trial.

ALTER TABLE subscription_plans
  ADD COLUMN trial_period_days INTEGER NOT NULL DEFAULT 0
    CHECK (trial_period_days >= 0 AND trial_period_days <= 730);
