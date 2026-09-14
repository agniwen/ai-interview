CREATE TABLE "ai_interview_report_receipt" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"ai_round_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "ai_report_receipt_status_check" CHECK ("status" in ('pending', 'applied', 'processed', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "ai_report_receipt_retry_idx" ON "ai_interview_report_receipt" ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "ai_report_receipt_conversation_idx" ON "ai_interview_report_receipt" ("conversation_id","created_at");
--> statement-breakpoint
ALTER TABLE "ai_interview_report_receipt" ADD CONSTRAINT "ai_report_receipt_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
