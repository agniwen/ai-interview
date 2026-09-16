ALTER TABLE "recruiting_background_check" ADD COLUMN IF NOT EXISTS "draft_data" jsonb;--> statement-breakpoint
ALTER TABLE "recruiting_background_check" ADD COLUMN IF NOT EXISTS "draft_saved_at" timestamp with time zone;
