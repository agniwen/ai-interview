import type { Database } from "@app/database";
import { bindResumeProcessingDatabase } from "./database";
import * as review from "./internal/studio/resumes/utils/review-worker";

export type {
  ResumePoolAssessmentGenerationDependencies,
  ResumeReviewWorkerDependencies,
} from "./internal/studio/resumes/utils/review-worker";

export function createResumeReview(database: Database) {
  return {
    generateResumePoolAssessment: bindResumeProcessingDatabase(
      database,
      review.generateResumePoolAssessment,
    ),
    processResumeReviewGenerationJob: bindResumeProcessingDatabase(
      database,
      review.processResumeReviewGenerationJob,
    ),
    reassessResumeRecord: bindResumeProcessingDatabase(database, review.reassessResumeRecord),
  };
}

export type ResumeReview = ReturnType<typeof createResumeReview>;
