import type { Database } from "@app/database";
import { bindResumeProcessingDatabase } from "./database";
import * as review from "./internal/recruiting/resumes/utils/review-worker";
import { recoverStaleResumeReviewRuns } from "./internal/recruiting/resumes/utils/review-recovery";

export type {
  ResumePoolAssessmentGenerationDependencies,
  ResumeReviewWorkerDependencies,
} from "./internal/recruiting/resumes/utils/review-worker";

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
    recoverStaleResumeReviewRuns: bindResumeProcessingDatabase(
      database,
      recoverStaleResumeReviewRuns,
    ),
  };
}

export type ResumeReview = ReturnType<typeof createResumeReview>;
