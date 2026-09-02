import { db } from "@server/lib/server/db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/review";

configureResumeProcessingDatabase(db);

export {
  generateResumePoolAssessment,
  processResumeReviewGenerationJob,
  reassessResumeRecord,
} from "@app/resume-processing/review";
export type {
  ResumePoolAssessmentGenerationDependencies,
  ResumeReviewWorkerDependencies,
} from "@app/resume-processing/review";
