CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_images" ALTER COLUMN "collection_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "collection_images" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "projects" ("id", "user_id", "name", "is_default", "created_at", "updated_at")
SELECT
	gen_random_uuid(),
	u.user_id,
	'My Project',
	true,
	now(),
	now()
FROM (
	SELECT DISTINCT "user_id" AS user_id
	FROM "collections"
) u
WHERE NOT EXISTS (
	SELECT 1
	FROM "projects" p
	WHERE p."user_id" = u.user_id
	  AND p."is_default" = true
);
--> statement-breakpoint
UPDATE "collections" AS c
SET "project_id" = p."id"
FROM "projects" AS p
WHERE c."project_id" IS NULL
  AND p."user_id" = c."user_id"
  AND p."is_default" = true;
--> statement-breakpoint
UPDATE "collection_images" AS ci
SET "project_id" = c."project_id"
FROM "collections" AS c
WHERE ci."project_id" IS NULL
  AND ci."collection_id" = c."id";
--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "collection_images" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "collection_images" ADD CONSTRAINT "collection_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;