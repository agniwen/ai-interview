CREATE TABLE "studio_human_interview_meeting" (
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"ended_at" timestamp,
	"id" text PRIMARY KEY,
	"livekit_room_name" text,
	"notes" text,
	"organization_id" text NOT NULL,
	"recording_egress_id" text,
	"recording_file_key" text,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_human_interview_meeting_interviewer" (
	"joined_at" timestamp,
	"left_at" timestamp,
	"meeting_id" text,
	"role" text DEFAULT 'interviewer' NOT NULL,
	"user_id" text,
	CONSTRAINT "studio_human_interview_meeting_interviewer_pkey" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "studio_human_interview_meeting_round" (
	"candidate_invite_expires_at" timestamp,
	"candidate_invite_token_hash" text,
	"joined_at" timestamp,
	"left_at" timestamp,
	"meeting_id" text,
	"round_id" text,
	CONSTRAINT "studio_human_interview_meeting_round_pkey" PRIMARY KEY("meeting_id","round_id")
);
--> statement-breakpoint
CREATE INDEX "studio_human_interview_meeting_org_idx" ON "studio_human_interview_meeting" ("organization_id");--> statement-breakpoint
CREATE INDEX "studio_human_interview_meeting_schedule_idx" ON "studio_human_interview_meeting" ("organization_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "studio_human_interview_meeting_status_idx" ON "studio_human_interview_meeting" ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_human_interview_meeting_livekit_room_idx" ON "studio_human_interview_meeting" ("livekit_room_name");--> statement-breakpoint
CREATE INDEX "studio_human_interview_meeting_interviewer_user_idx" ON "studio_human_interview_meeting_interviewer" ("user_id");--> statement-breakpoint
CREATE INDEX "studio_human_interview_meeting_round_round_idx" ON "studio_human_interview_meeting_round" ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_human_interview_meeting_round_invite_token_idx" ON "studio_human_interview_meeting_round" ("candidate_invite_token_hash");--> statement-breakpoint
ALTER TABLE "studio_human_interview_meeting" ADD CONSTRAINT "studio_human_interview_meeting_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "studio_human_interview_meeting" ADD CONSTRAINT "studio_human_interview_meeting_Lazs6aSwJRbc_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_human_interview_meeting_interviewer" ADD CONSTRAINT "studio_human_interview_meeting_interviewer_6xsZqmcCjTgM_fkey" FOREIGN KEY ("meeting_id") REFERENCES "studio_human_interview_meeting"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_human_interview_meeting_interviewer" ADD CONSTRAINT "studio_human_interview_meeting_interviewer_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_human_interview_meeting_round" ADD CONSTRAINT "studio_human_interview_meeting_round_HSXXQvCi9Qqk_fkey" FOREIGN KEY ("meeting_id") REFERENCES "studio_human_interview_meeting"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_human_interview_meeting_round" ADD CONSTRAINT "studio_human_interview_meeting_round_qWL6g8EfHBwa_fkey" FOREIGN KEY ("round_id") REFERENCES "studio_human_interview_round"("id") ON DELETE CASCADE;