-- Migration: Add user_consents table
-- Records when users accept legal agreements (Terms, Privacy, AUP).
-- A new row is inserted each time the user accepts a new version.
-- California law requires 3+ years retention.

CREATE TABLE IF NOT EXISTS "user_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "terms_version" varchar(20) NOT NULL,
  "accepted_from_ip" varchar(100),
  "accepted_at" timestamp DEFAULT now() NOT NULL
);

-- Index for looking up consents by user
CREATE INDEX IF NOT EXISTS "user_consents_user_id_idx" ON "user_consents" ("user_id");
