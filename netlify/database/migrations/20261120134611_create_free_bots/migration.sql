CREATE TABLE "free_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"xml" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
