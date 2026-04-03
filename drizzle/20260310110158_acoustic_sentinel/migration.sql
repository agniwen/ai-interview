CREATE TABLE "studio_interview_schedule" (
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"round_label" text NOT NULL,
	"scheduled_at" timestamp,
	"notes" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_interview" ALTER COLUMN "resume_file_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_interview" ALTER COLUMN "resume_profile" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_interview" ALTER COLUMN "interview_questions" SET DEFAULT '[]';--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_record_idx" ON "studio_interview_schedule" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_sort_idx" ON "studio_interview_schedule" ("interview_record_id","sort_order");--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD CONSTRAINT "studio_interview_schedule_OvJYIg2SsCtN_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;