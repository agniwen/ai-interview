CREATE TABLE "job_description_version" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"id" text PRIMARY KEY,
	"job_description_id" text,
	"job_description_name" text NOT NULL,
	"organization_id" text NOT NULL,
	"prompt" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_evaluation_version" (
	"artifact" jsonb NOT NULL,
	"contract_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"job_description_version_id" text,
	"numeric_score" integer,
	"organization_id" text NOT NULL,
	"recommendation_level" text,
	"resume_record_id" text NOT NULL,
	"run_id" text,
	CONSTRAINT "resume_evaluation_version_numeric_score_check" CHECK ("numeric_score" IS NULL OR "numeric_score" BETWEEN 0 AND 100),
	CONSTRAINT "resume_evaluation_version_recommendation_check" CHECK ("recommendation_level" IS NULL OR "recommendation_level" IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended'))
);
--> statement-breakpoint
CREATE TABLE "resume_evaluation_failure" (
	"contract_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text NOT NULL,
	"id" text PRIMARY KEY,
	"job_description_version_id" text,
	"organization_id" text NOT NULL,
	"resume_record_id" text NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "qualitative_attempt_job_description_version_id" text;
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "qualitative_job_description_version_id" text;
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "qualitative_recommendation_level" text;
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "qualitative_resume_evaluation" jsonb;
--> statement-breakpoint
ALTER TABLE "job_description_version" ADD CONSTRAINT "job_description_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_description_version" ADD CONSTRAINT "job_description_version_job_description_id_job_description_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_description"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_description_version" ADD CONSTRAINT "job_description_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_evaluation_version" ADD CONSTRAINT "resume_evaluation_version_job_description_version_id_job_description_version_id_fk" FOREIGN KEY ("job_description_version_id") REFERENCES "public"."job_description_version"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_evaluation_version" ADD CONSTRAINT "resume_evaluation_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_evaluation_version" ADD CONSTRAINT "resume_evaluation_version_resume_record_id_studio_interview_id_fk" FOREIGN KEY ("resume_record_id") REFERENCES "public"."studio_interview"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_evaluation_failure" ADD CONSTRAINT "resume_evaluation_failure_job_description_version_id_job_description_version_id_fk" FOREIGN KEY ("job_description_version_id") REFERENCES "public"."job_description_version"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_evaluation_failure" ADD CONSTRAINT "resume_evaluation_failure_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_evaluation_failure" ADD CONSTRAINT "resume_evaluation_failure_resume_record_id_studio_interview_id_fk" FOREIGN KEY ("resume_record_id") REFERENCES "public"."studio_interview"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_qualitative_attempt_job_description_version_id_job_description_version_id_fk" FOREIGN KEY ("qualitative_attempt_job_description_version_id") REFERENCES "public"."job_description_version"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_qualitative_job_description_version_id_job_description_version_id_fk" FOREIGN KEY ("qualitative_job_description_version_id") REFERENCES "public"."job_description_version"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_description" DROP CONSTRAINT "job_description_evaluation_mode_check";
--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_evaluation_mode_check" CHECK ("evaluation_mode" IN ('legacy', 'structured', 'qualitative'));
--> statement-breakpoint
ALTER TABLE "job_description" DROP CONSTRAINT "job_description_evaluation_lifecycle_check";
--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_evaluation_lifecycle_check" CHECK ((
        "evaluation_mode" = 'legacy'
        AND "lifecycle_status" = 'published'
        AND "published_at" IS NOT NULL
        AND "evaluation_blueprint_preview" IS NULL
        AND "evaluation_blueprint_preview_input_hash" IS NULL
        AND "evaluation_blueprint_preview_hash" IS NULL
        AND "evaluation_blueprint_preview_generated_at" IS NULL
        AND "evaluation_blueprint" IS NULL
        AND "evaluation_blueprint_hash" IS NULL
        AND "evaluation_blueprint_schema_version" IS NULL
        AND "deduction_rule_set_version" IS NULL
      ) OR (
        "evaluation_mode" = 'structured'
        AND "lifecycle_status" = 'draft'
        AND "published_at" IS NULL
        AND "evaluation_blueprint" IS NULL
        AND "evaluation_blueprint_hash" IS NULL
        AND "evaluation_blueprint_schema_version" IS NULL
        AND "deduction_rule_set_version" IS NULL
        AND (("evaluation_blueprint_preview" IS NULL AND "evaluation_blueprint_preview_input_hash" IS NULL AND "evaluation_blueprint_preview_hash" IS NULL AND "evaluation_blueprint_preview_generated_at" IS NULL)
          OR ("evaluation_blueprint_preview" IS NOT NULL AND "evaluation_blueprint_preview_input_hash" IS NOT NULL AND "evaluation_blueprint_preview_hash" IS NOT NULL AND "evaluation_blueprint_preview_generated_at" IS NOT NULL))
      ) OR (
        "evaluation_mode" = 'structured'
        AND "lifecycle_status" = 'published'
        AND "published_at" IS NOT NULL
        AND "evaluation_blueprint" IS NOT NULL
        AND "evaluation_blueprint_hash" IS NOT NULL
        AND "evaluation_blueprint_schema_version" IS NOT NULL
        AND "deduction_rule_set_version" IS NOT NULL
        AND "evaluation_blueprint_preview" IS NULL
        AND "evaluation_blueprint_preview_input_hash" IS NULL
        AND "evaluation_blueprint_preview_hash" IS NULL
        AND "evaluation_blueprint_preview_generated_at" IS NULL
      ) OR (
        "evaluation_mode" = 'qualitative'
        AND "lifecycle_status" = 'published'
        AND "published_at" IS NOT NULL
      ));
--> statement-breakpoint
ALTER TABLE "studio_interview" DROP CONSTRAINT "studio_interview_resume_evaluation_artifact_mode_check";
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_resume_evaluation_artifact_mode_check" CHECK ("resume_evaluation_artifact_mode" IS NULL OR "resume_evaluation_artifact_mode" IN ('legacy', 'structured', 'qualitative'));
--> statement-breakpoint
ALTER TABLE "studio_interview" DROP CONSTRAINT "studio_interview_resume_evaluation_attempt_mode_check";
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_resume_evaluation_attempt_mode_check" CHECK ("resume_evaluation_attempt_mode" IS NULL OR "resume_evaluation_attempt_mode" IN ('legacy', 'structured', 'qualitative'));
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_qualitative_evaluation_complete_check" CHECK (("qualitative_resume_evaluation" IS NULL AND "qualitative_recommendation_level" IS NULL AND "qualitative_job_description_version_id" IS NULL) OR ("qualitative_resume_evaluation" IS NOT NULL AND "qualitative_recommendation_level" IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended') AND "qualitative_job_description_version_id" IS NOT NULL));
--> statement-breakpoint
INSERT INTO "job_description_version" (
	"created_at",
	"created_by",
	"id",
	"job_description_id",
	"job_description_name",
	"organization_id",
	"prompt",
	"version"
)
SELECT
	"created_at",
	"created_by",
	'migration:qualitative-v1:job:' || "id",
	"id",
	"name",
	"organization_id",
	"prompt",
	1
FROM "job_description"
WHERE "lifecycle_status" = 'published';
--> statement-breakpoint
INSERT INTO "resume_evaluation_version" (
	"artifact",
	"contract_version",
	"created_at",
	"id",
	"job_description_version_id",
	"numeric_score",
	"organization_id",
	"recommendation_level",
	"resume_record_id",
	"run_id"
)
SELECT
	CASE
		WHEN COALESCE(si."resume_evaluation_artifact_mode", CASE WHEN si."structured_resume_evaluation" IS NOT NULL THEN 'structured' ELSE 'legacy' END) = 'structured'
			THEN si."structured_resume_evaluation"
		ELSE COALESCE(si."resume_review", jsonb_build_object('notes', si."notes"))
	END,
	CASE
		WHEN COALESCE(si."resume_evaluation_artifact_mode", CASE WHEN si."structured_resume_evaluation" IS NOT NULL THEN 'structured' ELSE 'legacy' END) = 'structured' THEN
			CASE
				WHEN si."structured_resume_evaluation"->>'schemaVersion' IS NOT NULL
					AND si."structured_resume_evaluation"->'engine'->>'engineVersion' IS NOT NULL
					AND si."structured_resume_evaluation"->'engine'->>'promptVersion' IS NOT NULL
				THEN 'structured-v' || (si."structured_resume_evaluation"->>'schemaVersion') || ':engine=' || (si."structured_resume_evaluation"->'engine'->>'engineVersion') || ':prompt=' || (si."structured_resume_evaluation"->'engine'->>'promptVersion')
				ELSE 'structured-unknown'
			END
		ELSE
			CASE
				WHEN si."resume_review"->>'schemaVersion' IS NOT NULL
				THEN 'legacy-resume-review-v' || (si."resume_review"->>'schemaVersion')
				ELSE 'legacy-unknown'
			END
	END,
	COALESCE(si."resume_review_generated_at", si."updated_at", si."created_at"),
	'migration:qualitative-v1:evaluation:' || si."id",
	NULL,
	CASE
		WHEN COALESCE(si."resume_evaluation_artifact_mode", CASE WHEN si."structured_resume_evaluation" IS NOT NULL THEN 'structured' ELSE 'legacy' END) = 'structured'
			THEN si."structured_composite_score"
		ELSE NULL
	END,
	si."organization_id",
	NULL,
	si."id",
	'archive:pre-qualitative-current'
FROM "studio_interview" AS si
WHERE
	si."resume_evaluation_artifact_mode" IS DISTINCT FROM 'qualitative'
	AND (
		si."structured_resume_evaluation" IS NOT NULL
		OR si."resume_review" IS NOT NULL
		OR si."notes" IS NOT NULL
	);
--> statement-breakpoint
CREATE INDEX "job_description_version_job_idx" ON "job_description_version" USING btree ("job_description_id", "version");
--> statement-breakpoint
CREATE INDEX "job_description_version_org_idx" ON "job_description_version" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "job_description_version_job_version_uq" ON "job_description_version" USING btree ("job_description_id", "version") WHERE "job_description_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "resume_evaluation_version_record_created_idx" ON "resume_evaluation_version" USING btree ("resume_record_id", "created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "resume_evaluation_version_org_idx" ON "resume_evaluation_version" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "resume_evaluation_version_record_contract_run_uq" ON "resume_evaluation_version" USING btree ("resume_record_id", "contract_version", "run_id") WHERE "run_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "resume_evaluation_failure_record_created_idx" ON "resume_evaluation_failure" USING btree ("resume_record_id", "created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "resume_evaluation_failure_org_idx" ON "resume_evaluation_failure" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "resume_evaluation_failure_record_contract_run_uq" ON "resume_evaluation_failure" USING btree ("resume_record_id", "contract_version", "run_id");
--> statement-breakpoint
CREATE INDEX "studio_interview_qualitative_job_order_idx" ON "studio_interview" USING btree ("organization_id", "job_description_id", "qualitative_recommendation_level", "resume_review_generated_at" DESC NULLS LAST);
