-- Migration: Add consent_type column to user_consents
-- Distinguishes login consent from payment consent.
-- Existing rows default to 'login'.

ALTER TABLE user_consents
  ADD COLUMN consent_type VARCHAR(20) NOT NULL DEFAULT 'login';

-- Index for looking up payment consents efficiently
CREATE INDEX IF NOT EXISTS user_consents_user_type_idx
  ON user_consents (user_id, consent_type);
