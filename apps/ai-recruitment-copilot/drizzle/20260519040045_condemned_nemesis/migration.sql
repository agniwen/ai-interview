CREATE TABLE "studio_round_email_log" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error_message" text,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"resend_message_id" text,
	"round_id" text NOT NULL,
	"sent_by" text,
	"status" text NOT NULL,
	"subject" text NOT NULL,
	"template_key" text DEFAULT 'round_invite' NOT NULL,
	"to_email" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "studio_round_email_log_organization_idx" ON "studio_round_email_log" ("organization_id");--> statement-breakpoint
CREATE INDEX "studio_round_email_log_round_created_idx" ON "studio_round_email_log" ("round_id","created_at");--> statement-breakpoint
ALTER TABLE "studio_round_email_log" ADD CONSTRAINT "studio_round_email_log_rhgdeh8F175o_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_round_email_log" ADD CONSTRAINT "studio_round_email_log_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_round_email_log" ADD CONSTRAINT "studio_round_email_log_6VyrdzuvQQ0T_fkey" FOREIGN KEY ("round_id") REFERENCES "studio_interview_schedule"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_round_email_log" ADD CONSTRAINT "studio_round_email_log_sent_by_user_id_fkey" FOREIGN KEY ("sent_by") REFERENCES "user"("id") ON DELETE SET NULL;