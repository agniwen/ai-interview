ALTER TABLE "resume_pool_item" DROP CONSTRAINT "resume_pool_item_qualitative_evaluation_complete_check", ADD CONSTRAINT "resume_pool_item_qualitative_evaluation_complete_check" CHECK ((
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
        AND "resume_evaluation_contract_version" IN ('qualitative-v2', 'qualitative-v3')
        AND "resume_evaluation_generated_at" IS NOT NULL
        AND "resume_evaluation_input_hash" IS NOT NULL
      ));