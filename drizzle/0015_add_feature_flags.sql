-- Add testing_groups column to users table
ALTER TABLE "users" ADD COLUMN "testing_groups" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Create testing_groups table
CREATE TABLE "testing_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "testing_groups_name_unique" UNIQUE("name")
);

-- Create feature_flags table
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(16) NOT NULL,
	"value_type" varchar(10) NOT NULL,
	"default_value" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);

-- Create group_flag_overrides table
CREATE TABLE "group_flag_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_flag_overrides_flag_id_group_id_unique" UNIQUE("flag_id", "group_id")
);

-- Add foreign key constraints
ALTER TABLE "group_flag_overrides" ADD CONSTRAINT "group_flag_overrides_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_flag_overrides" ADD CONSTRAINT "group_flag_overrides_group_id_testing_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "testing_groups"("id") ON DELETE cascade ON UPDATE no action;
