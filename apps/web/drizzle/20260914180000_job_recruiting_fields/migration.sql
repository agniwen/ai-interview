ALTER TABLE "job_description" ADD COLUMN "headcount" integer;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "job_weight" numeric(8,2);--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "published_date" date;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "referral_channels" text;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "reporting_manager_user_id" text;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "salary_max_k" numeric(10,2);--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "salary_min_k" numeric(10,2);--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_priority_check" CHECK ("priority" IS NULL OR "priority" IN ('high', 'medium', 'low'));--> statement-breakpoint
CREATE INDEX "job_description_priority_idx" ON "job_description" ("organization_id","priority");--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_reporting_manager_user_id_user_id_fkey" FOREIGN KEY ("reporting_manager_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
