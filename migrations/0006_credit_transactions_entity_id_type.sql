-- Change related_entity_id from uuid to varchar(255)
-- to support non-UUID identifiers (e.g. Stripe checkout session IDs)
ALTER TABLE credit_transactions
  ALTER COLUMN related_entity_id TYPE VARCHAR(255)
  USING related_entity_id::text;
