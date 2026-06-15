ALTER TABLE "candidate_form_ai_fill_log" ADD COLUMN "generated_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_form_ai_fill_log" ADD COLUMN "confirmed_questions" jsonb;
