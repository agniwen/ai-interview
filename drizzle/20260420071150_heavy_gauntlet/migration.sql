CREATE TABLE "department" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"description" text,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviewer" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"department_id" text NOT NULL,
	"description" text,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"voice" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_description" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"department_id" text NOT NULL,
	"description" text,
	"id" text PRIMARY KEY,
	"interviewer_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "job_description_id" text;--> statement-breakpoint
CREATE INDEX "department_name_idx" ON "department" ("name");--> statement-breakpoint
CREATE INDEX "department_created_at_idx" ON "department" ("created_at");--> statement-breakpoint
CREATE INDEX "interviewer_department_idx" ON "interviewer" ("department_id");--> statement-breakpoint
CREATE INDEX "interviewer_name_idx" ON "interviewer" ("name");--> statement-breakpoint
CREATE INDEX "interviewer_created_at_idx" ON "interviewer" ("created_at");--> statement-breakpoint
CREATE INDEX "job_description_department_idx" ON "job_description" ("department_id");--> statement-breakpoint
CREATE INDEX "job_description_interviewer_idx" ON "job_description" ("interviewer_id");--> statement-breakpoint
CREATE INDEX "job_description_name_idx" ON "job_description" ("name");--> statement-breakpoint
CREATE INDEX "job_description_created_at_idx" ON "job_description" ("created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_job_description_idx" ON "studio_interview" ("job_description_id");--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interviewer" ADD CONSTRAINT "interviewer_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interviewer" ADD CONSTRAINT "interviewer_department_id_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_department_id_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_interviewer_id_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewer"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_job_description_id_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;