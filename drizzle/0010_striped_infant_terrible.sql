CREATE TABLE "video_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"fal_request_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"source_image_id" varchar(255) NOT NULL,
	"end_image_id" varchar(255),
	"video_id" varchar(255),
	"thumbnail_image_id" varchar(255),
	"params" jsonb NOT NULL,
	"error" text,
	"seed" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "video_generations" ADD CONSTRAINT "video_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;