CREATE TABLE "candidate_form_ai_fill_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"version_id" text NOT NULL,
	"interview_record_id" text NOT NULL,
	"created_by" text NOT NULL,
	"prompt" text NOT NULL,
	"generated_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_answers" jsonb,
	"status" text DEFAULT 'generated' NOT NULL,
	"submission_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD CONSTRAINT "candidate_form_ai_fill_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD CONSTRAINT "candidate_form_ai_fill_log_template_id_candidate_form_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."candidate_form_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD CONSTRAINT "candidate_form_ai_fill_log_version_id_candidate_form_template_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."candidate_form_template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD CONSTRAINT "candidate_form_ai_fill_log_interview_record_id_studio_interview_id_fk" FOREIGN KEY ("interview_record_id") REFERENCES "public"."studio_interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD CONSTRAINT "candidate_form_ai_fill_log_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD CONSTRAINT "candidate_form_ai_fill_log_submission_id_candidate_form_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."candidate_form_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_form_ai_fill_log_template_idx" ON "candidate_form_ai_fill_log" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "candidate_form_ai_fill_log_interview_idx" ON "candidate_form_ai_fill_log" USING btree ("interview_record_id");--> statement-breakpoint
CREATE INDEX "candidate_form_ai_fill_log_org_created_idx" ON "candidate_form_ai_fill_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_form_ai_fill_log_created_by_idx" ON "candidate_form_ai_fill_log" USING btree ("created_by");
