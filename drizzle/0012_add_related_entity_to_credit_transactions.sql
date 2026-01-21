ALTER TABLE "credit_transactions" ADD COLUMN "related_entity_type" varchar(50);--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "related_entity_id" uuid;