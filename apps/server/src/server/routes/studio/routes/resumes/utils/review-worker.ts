import { db } from "../../../../../../lib/server/db/index";
import { createResumeReview } from "@app/resume-processing/review";
import type { ResumeReview } from "@app/resume-processing/review";

const review = createResumeReview(db);

export const generateResumePoolAssessment: ResumeReview["generateResumePoolAssessment"] =
  review.generateResumePoolAssessment;
export const processResumeReviewGenerationJob: ResumeReview["processResumeReviewGenerationJob"] =
  review.processResumeReviewGenerationJob;
export const reassessResumeRecord: ResumeReview["reassessResumeRecord"] =
  review.reassessResumeRecord;
export type {
  ResumePoolAssessmentGenerationDependencies,
  ResumeReviewWorkerDependencies,
} from "@app/resume-processing/review";
