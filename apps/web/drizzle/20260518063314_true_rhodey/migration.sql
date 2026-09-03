ALTER TABLE "candidate_form_template" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "interview_question_template" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX "candidate_form_template_org_archived_idx" ON "candidate_form_template" ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "interview_question_template_org_archived_idx" ON "interview_question_template" ("organization_id","archived_at");