CREATE TABLE "meeting_device_request" (
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"account_id" text NOT NULL,
	"device_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"kind" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_token" text,
	"lease_expires_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_device_request_status_check" CHECK ("status" in ('pending', 'complete'))
);
--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "processing_owner" text DEFAULT 'worker' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "processing_device_id" text;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "processing_account_id" text;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "processing_epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "meeting_device_request_meeting_idx" ON "meeting_device_request" ("meeting_id");--> statement-breakpoint
ALTER TABLE "meeting_device_request" ADD CONSTRAINT "meeting_device_request_meeting_id_meeting_session_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "meeting_device_request" ADD CONSTRAINT "meeting_device_request_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_processing_account_id_user_id_fkey" FOREIGN KEY ("processing_account_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_processing_owner_check" CHECK ("processing_owner" in ('worker', 'device'));--> statement-breakpoint
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_processing_epoch_check" CHECK ("processing_epoch" > 0);
--> statement-breakpoint
-- Historical Echo sessions are explicitly adopted in Desktop. Recruiting processing copies
-- retain Worker ownership, including the legacy human-interview table.
UPDATE meeting_session AS meeting
SET processing_owner = 'device', processing_device_id = NULL,
    processing_account_id = NULL, processing_epoch = processing_epoch + 1,
    processing_run_id = NULL, transcription_run_id = NULL, intelligence_run_id = NULL,
    purge_claim_token = NULL, purge_lease_expires_at = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM human_interview_meeting AS human
  WHERE human.processing_meeting_session_id = meeting.id
) AND NOT EXISTS (
  SELECT 1 FROM studio_human_interview_meeting AS legacy
  WHERE legacy.processing_meeting_session_id = meeting.id
);
--> statement-breakpoint
UPDATE meeting_processing_run AS run
SET execution_token = NULL, status = 'failed', error_code = 'device-adoption-required',
    error_message = '请在 Echo 中选择在此设备继续处理', finished_at = now()
FROM meeting_session AS meeting
WHERE meeting.id = run.meeting_id AND meeting.processing_owner = 'device'
  AND run.status IN ('pending', 'processing');
--> statement-breakpoint
UPDATE meeting_question_exchange AS exchange
SET execution_token = NULL, lease_expires_at = NULL, status = 'failed',
    error_code = 'device-adoption-required'
FROM meeting_session AS meeting
WHERE meeting.id = exchange.meeting_id AND meeting.processing_owner = 'device'
  AND exchange.status IN ('pending', 'processing');
