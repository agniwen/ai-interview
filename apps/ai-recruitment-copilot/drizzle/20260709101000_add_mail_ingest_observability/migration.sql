ALTER TABLE "mail_ingest_message" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "mail_ingest_message" ADD COLUMN "jd_bind_status" text;--> statement-breakpoint
ALTER TABLE "mail_ingest_message" ADD COLUMN "bound_job_description_id" text;--> statement-breakpoint
ALTER TABLE "mail_ingest_message" ADD COLUMN "extracted_job_codes" jsonb;--> statement-breakpoint
ALTER TABLE "mail_ingest_message" ADD COLUMN "attachment_count" integer;--> statement-breakpoint
ALTER TABLE "mail_ingest_message" ADD COLUMN "resume_attachment_count" integer;--> statement-breakpoint
ALTER TABLE "mail_ingest_account" ADD COLUMN "last_run_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_ingest_account" ADD COLUMN "last_run_subject_skipped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_ingest_account" ADD COLUMN "last_run_matched" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_ingest_account" ADD COLUMN "last_run_queued" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_ingest_account" ADD COLUMN "last_run_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_ingest_message" ADD CONSTRAINT "mail_ingest_message_bound_job_description_id_job_description_id_fk" FOREIGN KEY ("bound_job_description_id") REFERENCES "job_description"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "mail_ingest_message_account_received_idx" ON "mail_ingest_message" ("account_id","received_at" DESC);
