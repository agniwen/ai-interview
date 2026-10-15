CREATE TABLE "resume_candidate_avatar" (
	"box_confidence" double precision NOT NULL,
	"content_hash" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	"photo_probability" double precision NOT NULL,
	"storage_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
