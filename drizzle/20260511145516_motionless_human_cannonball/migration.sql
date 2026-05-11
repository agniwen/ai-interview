ALTER TABLE "candidate_form_submission" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "feishu_thread_state" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "global_config" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_question_template" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interviewer" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "feishu_tenant_key" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "feishu_tenant_name" text;--> statement-breakpoint
CREATE INDEX "candidate_form_submission_organization_idx" ON "candidate_form_submission" ("organization_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_organization_idx" ON "candidate_form_template" ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_attachment_organization_idx" ON "chat_attachment" ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_organization_idx" ON "chat_conversation" ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_message_organization_idx" ON "chat_message" ("organization_id");--> statement-breakpoint
CREATE INDEX "department_organization_idx" ON "department" ("organization_id");--> statement-breakpoint
CREATE INDEX "feishu_thread_state_organization_idx" ON "feishu_thread_state" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_audit_log_organization_idx" ON "interview_audit_log" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_conversation_organization_idx" ON "interview_conversation" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_conversation_turn_organization_idx" ON "interview_conversation_turn" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_notification_organization_idx" ON "interview_notification" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_organization_idx" ON "interview_question_template" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_binding_organization_idx" ON "interview_question_template_binding" ("organization_id");--> statement-breakpoint
CREATE INDEX "interviewer_organization_idx" ON "interviewer" ("organization_id");--> statement-breakpoint
CREATE INDEX "job_description_organization_idx" ON "job_description" ("organization_id");--> statement-breakpoint
CREATE INDEX "studio_interview_organization_idx" ON "studio_interview" ("organization_id");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_organization_idx" ON "studio_interview_schedule" ("organization_id");--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD CONSTRAINT "candidate_form_template_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feishu_thread_state" ADD CONSTRAINT "feishu_thread_state_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "global_config" ADD CONSTRAINT "global_config_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD CONSTRAINT "interview_conversation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD CONSTRAINT "interview_conversation_turn_oIAEcdNaEzPz_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template" ADD CONSTRAINT "interview_question_template_J7zIM98fJ9xH_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD CONSTRAINT "interview_question_template_binding_B19cq7nDyZhl_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interviewer" ADD CONSTRAINT "interviewer_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD CONSTRAINT "studio_interview_schedule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;