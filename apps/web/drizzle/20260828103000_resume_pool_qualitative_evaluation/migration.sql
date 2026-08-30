ALTER TABLE "resume_pool_item" ADD COLUMN "qualitative_job_description_version_id" text;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD COLUMN "qualitative_recommendation_level" text;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD COLUMN "qualitative_resume_evaluation" jsonb;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD COLUMN "qualitative_resume_summary" text;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD COLUMN "resume_evaluation_contract_version" text;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD COLUMN "resume_evaluation_generated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD COLUMN "resume_evaluation_input_hash" text;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD CONSTRAINT "resume_pool_item_qualitative_job_description_version_id_job_description_version_id_fk" FOREIGN KEY ("qualitative_job_description_version_id") REFERENCES "public"."job_description_version"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_pool_item" ADD CONSTRAINT "resume_pool_item_qualitative_evaluation_complete_check" CHECK ((
        "qualitative_resume_evaluation" IS NULL
        AND "qualitative_recommendation_level" IS NULL
        AND "qualitative_resume_summary" IS NULL
        AND "qualitative_job_description_version_id" IS NULL
        AND "resume_evaluation_contract_version" IS NULL
        AND "resume_evaluation_generated_at" IS NULL
        AND "resume_evaluation_input_hash" IS NULL
      ) OR (
        "qualitative_resume_evaluation" IS NOT NULL
        AND "qualitative_recommendation_level" IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended')
        AND "qualitative_resume_summary" IS NOT NULL
        AND "qualitative_job_description_version_id" IS NOT NULL
        AND "resume_evaluation_contract_version" = 'qualitative-v2'
        AND "resume_evaluation_generated_at" IS NOT NULL
        AND "resume_evaluation_input_hash" IS NOT NULL
      ));
--> statement-breakpoint
CREATE INDEX "resume_pool_item_qualitative_job_order_idx" ON "resume_pool_item" USING btree ("organization_id", "job_description_id", "qualitative_recommendation_level", "resume_evaluation_generated_at");
