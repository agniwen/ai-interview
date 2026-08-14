ALTER TABLE "meeting_session" ADD COLUMN "processing_error" text;
--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "processing_run_id" text;
--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "title" text;
--> statement-breakpoint
UPDATE "meeting_session"
SET "title" = '录制记录-' || to_char("started_at" AT TIME ZONE 'UTC', 'YYMMDDHH24MI')
WHERE "title" IS NULL;
--> statement-breakpoint
ALTER TABLE "meeting_session" ALTER COLUMN "title" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "meeting_session_org_status_saved_idx" ON "meeting_session" USING btree ("organization_id","status","saved_at");
