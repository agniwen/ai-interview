CREATE TABLE "job_description_interviewer" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"interviewer_id" text,
	"job_description_id" text,
	CONSTRAINT "job_description_interviewer_pkey" PRIMARY KEY("job_description_id","interviewer_id")
);
--> statement-breakpoint
ALTER TABLE "job_description" DROP CONSTRAINT "job_description_interviewer_id_interviewer_id_fkey";--> statement-breakpoint
DROP INDEX "job_description_interviewer_idx";--> statement-breakpoint
ALTER TABLE "job_description" DROP COLUMN "interviewer_id";--> statement-breakpoint
CREATE INDEX "job_description_interviewer_interviewer_idx" ON "job_description_interviewer" ("interviewer_id");--> statement-breakpoint
ALTER TABLE "job_description_interviewer" ADD CONSTRAINT "job_description_interviewer_interviewer_id_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewer"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "job_description_interviewer" ADD CONSTRAINT "job_description_interviewer_ShsGzu3sHE7L_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;