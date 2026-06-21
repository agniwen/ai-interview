CREATE TABLE IF NOT EXISTS "resume_semantic_index" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "content_hash" text,
  "profile_hash" text NOT NULL,
  "embedding_model" text NOT NULL,
  "embedding_version" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_indexed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resume_semantic_index_source_version_uq"
  ON "resume_semantic_index" ("source_type", "source_id", "embedding_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_semantic_index_org_status_idx"
  ON "resume_semantic_index" ("organization_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_semantic_index_org_source_idx"
  ON "resume_semantic_index" ("organization_id", "source_type", "source_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resume_duplicate_match" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "matched_source_type" text NOT NULL,
  "matched_source_id" text NOT NULL,
  "score" integer NOT NULL,
  "level" text NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "embedding_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_duplicate_match_org_source_idx"
  ON "resume_duplicate_match" ("organization_id", "source_type", "source_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_duplicate_match_org_level_idx"
  ON "resume_duplicate_match" ("organization_id", "level");
