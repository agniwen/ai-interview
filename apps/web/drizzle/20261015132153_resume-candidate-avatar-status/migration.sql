ALTER TABLE "resume_candidate_avatar" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ADD COLUMN "status" text;--> statement-breakpoint
UPDATE "resume_candidate_avatar" SET "status" = CASE WHEN "storage_key" IS NULL THEN 'not_detected' ELSE 'detected' END;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ALTER COLUMN "box_confidence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ALTER COLUMN "model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_candidate_avatar" ALTER COLUMN "photo_probability" DROP NOT NULL;
