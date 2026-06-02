CREATE INDEX "interview_conversation_schedule_entry_idx" ON "interview_conversation" ("schedule_entry_id");--> statement-breakpoint
CREATE INDEX "studio_interview_org_created_at_idx" ON "studio_interview" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_org_created_by_created_at_idx" ON "studio_interview" ("organization_id","created_by","created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_org_stage_created_at_idx" ON "studio_interview" ("organization_id","pipeline_stage","created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_org_created_at_idx" ON "studio_interview_schedule" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_org_created_by_created_at_idx" ON "studio_interview_schedule" ("organization_id","created_by","created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_org_status_created_at_idx" ON "studio_interview_schedule" ("organization_id","status","created_at");