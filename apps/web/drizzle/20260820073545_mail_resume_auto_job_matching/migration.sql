ALTER TABLE "mail_ingest_account"
  ALTER COLUMN "jd_mode" SET DEFAULT 'auto';

ALTER TABLE "resume_upload_batch"
  ADD COLUMN "job_match_requested_at" timestamp with time zone;

CREATE TABLE "resume_job_match_run" (
  "batch_item_id" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "error_message" text,
  "id" text PRIMARY KEY NOT NULL,
  "mail_message_id" text,
  "matcher_version" text NOT NULL,
  "model" text,
  "organization_id" text NOT NULL,
  "pool_item_id" text NOT NULL,
  "prompt_version" text,
  "resume_input_hash" text NOT NULL,
  "selected_job_description_id" text,
  "selection_method" text,
  "status" text NOT NULL,
  CONSTRAINT "resume_job_match_run_batch_item_id_resume_upload_batch_item_id_fk"
    FOREIGN KEY ("batch_item_id") REFERENCES "public"."resume_upload_batch_item"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "resume_job_match_run_mail_message_id_mail_ingest_message_id_fk"
    FOREIGN KEY ("mail_message_id") REFERENCES "public"."mail_ingest_message"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "resume_job_match_run_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "resume_job_match_run_pool_item_id_resume_pool_item_id_fk"
    FOREIGN KEY ("pool_item_id") REFERENCES "public"."resume_pool_item"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "resume_job_match_run_selected_job_description_id_job_description_id_fk"
    FOREIGN KEY ("selected_job_description_id") REFERENCES "public"."job_description"("id")
    ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX "resume_job_match_run_pool_batch_version_uq"
  ON "resume_job_match_run" USING btree ("pool_item_id", "batch_item_id", "matcher_version");
CREATE INDEX "resume_job_match_run_org_pool_created_idx"
  ON "resume_job_match_run" USING btree ("organization_id", "pool_item_id", "created_at");
CREATE INDEX "resume_job_match_run_selected_job_idx"
  ON "resume_job_match_run" USING btree ("selected_job_description_id");

CREATE TABLE "resume_job_match_candidate" (
  "ai_rank" integer,
  "ai_reason" text,
  "ai_score" integer,
  "id" text PRIMARY KEY NOT NULL,
  "job_description_id" text,
  "job_snapshot" jsonb NOT NULL,
  "overview_score" double precision,
  "recall_rank" integer,
  "recall_source" text NOT NULL,
  "run_id" text NOT NULL,
  "skill_role_score" double precision,
  "vector_score" integer,
  "work_project_score" double precision,
  CONSTRAINT "resume_job_match_candidate_job_description_id_job_description_id_fk"
    FOREIGN KEY ("job_description_id") REFERENCES "public"."job_description"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "resume_job_match_candidate_run_id_resume_job_match_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "public"."resume_job_match_run"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "resume_job_match_candidate_ai_score_check"
    CHECK ("resume_job_match_candidate"."ai_score" IS NULL OR
      ("resume_job_match_candidate"."ai_score" >= 0 AND
       "resume_job_match_candidate"."ai_score" <= 100)),
  CONSTRAINT "resume_job_match_candidate_ai_rank_check"
    CHECK ("resume_job_match_candidate"."ai_rank" IS NULL OR
      "resume_job_match_candidate"."ai_rank" > 0),
  CONSTRAINT "resume_job_match_candidate_recall_rank_check"
    CHECK ("resume_job_match_candidate"."recall_rank" IS NULL OR
      "resume_job_match_candidate"."recall_rank" > 0)
);

CREATE UNIQUE INDEX "resume_job_match_candidate_run_job_uq"
  ON "resume_job_match_candidate" USING btree ("run_id", "job_description_id");
CREATE UNIQUE INDEX "resume_job_match_candidate_run_ai_rank_uq"
  ON "resume_job_match_candidate" USING btree ("run_id", "ai_rank");
CREATE INDEX "resume_job_match_candidate_job_idx"
  ON "resume_job_match_candidate" USING btree ("job_description_id");
