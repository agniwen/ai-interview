CREATE TABLE "interview_conversation" (
	"conversation_id" text PRIMARY KEY,
	"interview_record_id" text,
	"agent_id" text,
	"status" text DEFAULT 'initiated' NOT NULL,
	"mode" text,
	"transcript" jsonb DEFAULT '[]' NOT NULL,
	"transcript_summary" text,
	"call_successful" text,
	"evaluation_criteria_results" jsonb DEFAULT '{}' NOT NULL,
	"data_collection_results" jsonb DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"dynamic_variables" jsonb DEFAULT '{}' NOT NULL,
	"latest_error" text,
	"started_at" timestamp,
	"ended_at" timestamp,
	"webhook_received_at" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_conversation_turn" (
	"id" text PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"interview_record_id" text,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"source" text DEFAULT 'client_event' NOT NULL,
	"time_in_call_secs" integer,
	"created_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "interview_conversation_record_idx" ON "interview_conversation" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_conversation_status_idx" ON "interview_conversation" ("status");--> statement-breakpoint
CREATE INDEX "interview_conversation_updated_at_idx" ON "interview_conversation" ("updated_at");--> statement-breakpoint
CREATE INDEX "interview_conversation_turn_conversation_idx" ON "interview_conversation_turn" ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "interview_conversation_turn_record_idx" ON "interview_conversation_turn" ("interview_record_id","created_at");--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD CONSTRAINT "interview_conversation_7E79ZtgKWejQ_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD CONSTRAINT "interview_conversation_turn_jhqV2eUQdApp_fkey" FOREIGN KEY ("conversation_id") REFERENCES "interview_conversation"("conversation_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD CONSTRAINT "interview_conversation_turn_N6s6mXUvShiW_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE SET NULL;