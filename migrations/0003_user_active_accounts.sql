-- User Active Accounts Migration
-- Stores the user's current billing account preference (personal or team).
-- Absence of a row defaults to the personal account.

CREATE TABLE IF NOT EXISTS user_active_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL DEFAULT 'personal',
  account_id UUID,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
