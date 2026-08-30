ALTER TABLE "studio_interview"
  ADD COLUMN IF NOT EXISTS "resume_source_type" text,
  ADD COLUMN IF NOT EXISTS "resume_source_pool_item_id" text,
  ADD COLUMN IF NOT EXISTS "resume_source_imported_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "resume_source_imported_by" text;

CREATE TABLE IF NOT EXISTS "resume_pool_item" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "organization_id" text,
  "created_by" text,
  "source_pool_item_id" text,
  "source_organization_id" text,
  "source_user_id" text,
  "published_at" timestamp with time zone,
  "published_by" text,
  "candidate_name" text NOT NULL,
  "candidate_email" text,
  "candidate_phone" text,
  "target_role" text,
  "notes" text,
  "job_description_id" text,
  "resume_file_name" text,
  "resume_storage_key" text,
  "resume_content_hash" text,
  "resume_parse_status" text DEFAULT 'ready' NOT NULL,
  "resume_parse_error" text,
  "resume_parsed_at" timestamp with time zone,
  "resume_profile" jsonb,
  "skills_normalized" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "resume_pool_import" (
  "id" text PRIMARY KEY NOT NULL,
  "pool_item_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "imported_resume_record_id" text NOT NULL,
  "imported_by" text,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "resume_pool_event" (
  "id" text PRIMARY KEY NOT NULL,
  "pool_item_id" text NOT NULL,
  "organization_id" text,
  "actor_id" text,
  "type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_interview_resume_source_imported_by_user_id_fk'
  ) THEN
    ALTER TABLE "studio_interview"
      ADD CONSTRAINT "studio_interview_resume_source_imported_by_user_id_fk"
      FOREIGN KEY ("resume_source_imported_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_interview_resume_source_pool_item_fk'
  ) THEN
    ALTER TABLE "studio_interview"
      ADD CONSTRAINT "studio_interview_resume_source_pool_item_fk"
      FOREIGN KEY ("resume_source_pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_item_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_item"
      ADD CONSTRAINT "resume_pool_item_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_item_created_by_user_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_item"
      ADD CONSTRAINT "resume_pool_item_created_by_user_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_item_source_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_item"
      ADD CONSTRAINT "resume_pool_item_source_organization_id_organization_id_fk"
      FOREIGN KEY ("source_organization_id") REFERENCES "organization"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_item_source_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_item"
      ADD CONSTRAINT "resume_pool_item_source_user_id_user_id_fk"
      FOREIGN KEY ("source_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_item_published_by_user_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_item"
      ADD CONSTRAINT "resume_pool_item_published_by_user_id_fk"
      FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_item_job_description_id_job_description_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_item"
      ADD CONSTRAINT "resume_pool_item_job_description_id_job_description_id_fk"
      FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_import_pool_item_id_resume_pool_item_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_import"
      ADD CONSTRAINT "resume_pool_import_pool_item_id_resume_pool_item_id_fk"
      FOREIGN KEY ("pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_import_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_import"
      ADD CONSTRAINT "resume_pool_import_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_import_record_fk'
  ) THEN
    ALTER TABLE "resume_pool_import"
      ADD CONSTRAINT "resume_pool_import_record_fk"
      FOREIGN KEY ("imported_resume_record_id") REFERENCES "studio_interview"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_import_imported_by_user_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_import"
      ADD CONSTRAINT "resume_pool_import_imported_by_user_id_fk"
      FOREIGN KEY ("imported_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_event_pool_item_id_resume_pool_item_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_event"
      ADD CONSTRAINT "resume_pool_event_pool_item_id_resume_pool_item_id_fk"
      FOREIGN KEY ("pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_event_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_event"
      ADD CONSTRAINT "resume_pool_event_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_pool_event_actor_id_user_id_fk'
  ) THEN
    ALTER TABLE "resume_pool_event"
      ADD CONSTRAINT "resume_pool_event_actor_id_user_id_fk"
      FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "studio_interview_resume_source_pool_item_idx"
  ON "studio_interview" USING btree ("resume_source_pool_item_id");

CREATE INDEX IF NOT EXISTS "studio_interview_resume_source_type_idx"
  ON "studio_interview" USING btree ("resume_source_type");

CREATE INDEX IF NOT EXISTS "resume_pool_item_scope_created_idx"
  ON "resume_pool_item" USING btree ("scope", "created_at");

CREATE INDEX IF NOT EXISTS "resume_pool_item_org_user_scope_created_idx"
  ON "resume_pool_item" USING btree ("organization_id", "created_by", "scope", "created_at");

CREATE INDEX IF NOT EXISTS "resume_pool_item_resume_content_hash_idx"
  ON "resume_pool_item" USING btree ("resume_content_hash");

CREATE INDEX IF NOT EXISTS "resume_pool_item_resume_parse_status_idx"
  ON "resume_pool_item" USING btree ("resume_parse_status");

CREATE INDEX IF NOT EXISTS "resume_pool_item_source_pool_item_idx"
  ON "resume_pool_item" USING btree ("source_pool_item_id");

CREATE INDEX IF NOT EXISTS "resume_pool_item_skills_normalized_idx"
  ON "resume_pool_item" USING gin ("skills_normalized");

CREATE UNIQUE INDEX IF NOT EXISTS "resume_pool_import_pool_org_record_uq"
  ON "resume_pool_import" USING btree ("pool_item_id", "organization_id", "imported_resume_record_id");

CREATE INDEX IF NOT EXISTS "resume_pool_import_pool_org_idx"
  ON "resume_pool_import" USING btree ("pool_item_id", "organization_id");

CREATE INDEX IF NOT EXISTS "resume_pool_import_record_idx"
  ON "resume_pool_import" USING btree ("imported_resume_record_id");

CREATE INDEX IF NOT EXISTS "resume_pool_event_pool_created_idx"
  ON "resume_pool_event" USING btree ("pool_item_id", "created_at");

CREATE INDEX IF NOT EXISTS "resume_pool_event_org_created_idx"
  ON "resume_pool_event" USING btree ("organization_id", "created_at");
