-- 多对多关联：面试题模板 / 表单模板 ↔ 在招岗位
-- Many-to-many: interview question / candidate form templates ↔ job descriptions.

CREATE TABLE "candidate_form_template_job_description" (
	"job_description_id" text NOT NULL,
	"template_id" text NOT NULL,
	CONSTRAINT "candidate_form_template_job_description_template_id_job_description_id_pk" PRIMARY KEY("template_id","job_description_id")
);
--> statement-breakpoint
CREATE INDEX "candidate_form_template_jd_jd_idx" ON "candidate_form_template_job_description" ("job_description_id");
--> statement-breakpoint
ALTER TABLE "candidate_form_template_job_description" ADD CONSTRAINT "candidate_form_template_job_description_job_description_id_job_description_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "candidate_form_template_job_description" ADD CONSTRAINT "candidate_form_template_job_description_template_id_candidate_form_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE TABLE "interview_question_template_job_description" (
	"job_description_id" text NOT NULL,
	"template_id" text NOT NULL,
	CONSTRAINT "interview_question_template_job_description_template_id_job_description_id_pk" PRIMARY KEY("template_id","job_description_id")
);
--> statement-breakpoint
CREATE INDEX "interview_question_template_jd_jd_idx" ON "interview_question_template_job_description" ("job_description_id");
--> statement-breakpoint
ALTER TABLE "interview_question_template_job_description" ADD CONSTRAINT "interview_question_template_job_description_job_description_id_job_description_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "interview_question_template_job_description" ADD CONSTRAINT "interview_question_template_job_description_template_id_interview_question_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "interview_question_template"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- 迁移既有数据：把每个 template.job_description_id 复制到关联表，保持原有绑定。
-- Backfill: copy each template's existing single jobDescriptionId into the link table.
INSERT INTO "candidate_form_template_job_description" ("template_id", "job_description_id")
SELECT "id", "job_description_id"
FROM "candidate_form_template"
WHERE "job_description_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "interview_question_template_job_description" ("template_id", "job_description_id")
SELECT "id", "job_description_id"
FROM "interview_question_template"
WHERE "job_description_id" IS NOT NULL;
--> statement-breakpoint

DROP INDEX IF EXISTS "candidate_form_template_job_description_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "interview_question_template_job_description_idx";
--> statement-breakpoint
ALTER TABLE "candidate_form_template" DROP CONSTRAINT IF EXISTS "candidate_form_template_job_description_id_job_description_id_fk";
--> statement-breakpoint
ALTER TABLE "interview_question_template" DROP CONSTRAINT IF EXISTS "interview_question_template_job_description_id_job_description_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_form_template" DROP COLUMN "job_description_id";
--> statement-breakpoint
ALTER TABLE "interview_question_template" DROP COLUMN "job_description_id";
