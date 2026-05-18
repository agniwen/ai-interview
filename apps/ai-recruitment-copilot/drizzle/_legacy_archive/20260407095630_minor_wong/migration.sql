CREATE TABLE "interview_audit_log" (
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"schedule_entry_id" text,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	"operator_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD COLUMN "schedule_entry_id" text;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD COLUMN "conversation_id" text;--> statement-breakpoint
CREATE INDEX "interview_audit_log_record_idx" ON "interview_audit_log" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_audit_log_created_at_idx" ON "interview_audit_log" ("created_at");--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_aoIEHPgEi3Dl_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_WIrMwSI6gUoW_fkey" FOREIGN KEY ("schedule_entry_id") REFERENCES "studio_interview_schedule"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_operator_id_user_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD CONSTRAINT "interview_conversation_MY0dFnw28dGN_fkey" FOREIGN KEY ("schedule_entry_id") REFERENCES "studio_interview_schedule"("id") ON DELETE SET NULL;