CREATE TABLE "candidate_form_submission" (
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"template_id" text NOT NULL,
	"version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"description" text,
	"id" text PRIMARY KEY,
	"job_description_id" text,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template_question" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"display_mode" text NOT NULL,
	"helper_text" text,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"options" jsonb DEFAULT '[]' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"template_id" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template_version" (
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"snapshot" jsonb NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_form_submission_template_interview_uq" ON "candidate_form_submission" ("template_id","interview_record_id");--> statement-breakpoint
CREATE INDEX "candidate_form_submission_version_idx" ON "candidate_form_submission" ("version_id");--> statement-breakpoint
CREATE INDEX "candidate_form_submission_interview_idx" ON "candidate_form_submission" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_scope_idx" ON "candidate_form_template" ("scope");--> statement-breakpoint
CREATE INDEX "candidate_form_template_job_description_idx" ON "candidate_form_template" ("job_description_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_created_at_idx" ON "candidate_form_template" ("created_at");--> statement-breakpoint
CREATE INDEX "candidate_form_template_question_template_idx" ON "candidate_form_template_question" ("template_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_question_order_idx" ON "candidate_form_template_question" ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_form_template_version_template_version_uq" ON "candidate_form_template_version" ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_form_template_version_template_hash_uq" ON "candidate_form_template_version" ("template_id","content_hash");--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_OekSV5G6608S_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_dULxBVL5akJQ_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_Po2euoDAYppr_fkey" FOREIGN KEY ("version_id") REFERENCES "candidate_form_template_version"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD CONSTRAINT "candidate_form_template_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD CONSTRAINT "candidate_form_template_5QVxTR8PfDMr_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template_question" ADD CONSTRAINT "candidate_form_template_question_PxiJZNp6QGl3_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template_version" ADD CONSTRAINT "candidate_form_template_version_PBy8nrbNPyNR_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE CASCADE;