ALTER TABLE "studio_interview_schedule" ADD COLUMN "created_by" text;--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_created_by_idx" ON "studio_interview_schedule" ("created_by");--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD CONSTRAINT "studio_interview_schedule_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;