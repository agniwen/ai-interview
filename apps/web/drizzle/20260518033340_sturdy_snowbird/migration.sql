CREATE TABLE "resume_upload_batch" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text NOT NULL,
	"jd_mode" text NOT NULL,
	"job_description_id" text,
	"dedup_policy" text NOT NULL,
	"total_count" integer NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "resume_upload_batch_item" (
	"batch_id" text NOT NULL,
	"dedup_match_snapshot" jsonb,
	"error_message" text,
	"file_size" integer NOT NULL,
	"finished_at" timestamp,
	"id" text PRIMARY KEY,
	"order_index" integer NOT NULL,
	"organization_id" text NOT NULL,
	"original_file_name" text NOT NULL,
	"resume_record_id" text,
	"started_at" timestamp,
	"status" text NOT NULL,
	"storage_key" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "resume_upload_batch_org_user_status_idx" ON "resume_upload_batch" ("organization_id","created_by","status");--> statement-breakpoint
CREATE INDEX "resume_upload_batch_org_user_created_idx" ON "resume_upload_batch" ("organization_id","created_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_upload_batch_active_unique_idx" ON "resume_upload_batch" ("organization_id","created_by") WHERE "status" in ('pending','running');--> statement-breakpoint
CREATE INDEX "resume_upload_batch_item_batch_order_idx" ON "resume_upload_batch_item" ("batch_id","order_index");--> statement-breakpoint
CREATE INDEX "resume_upload_batch_item_batch_status_idx" ON "resume_upload_batch_item" ("batch_id","status");--> statement-breakpoint
ALTER TABLE "resume_upload_batch" ADD CONSTRAINT "resume_upload_batch_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_upload_batch" ADD CONSTRAINT "resume_upload_batch_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_upload_batch" ADD CONSTRAINT "resume_upload_batch_job_description_id_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "resume_upload_batch_item" ADD CONSTRAINT "resume_upload_batch_item_batch_id_resume_upload_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "resume_upload_batch"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_upload_batch_item" ADD CONSTRAINT "resume_upload_batch_item_tlIJsY8LAOyb_fkey" FOREIGN KEY ("resume_record_id") REFERENCES "studio_interview"("id") ON DELETE SET NULL;