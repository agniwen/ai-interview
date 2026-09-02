import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/resumes/utils/review-queue";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/resumes/utils/review-queue";

export const enqueueResumePoolReviewGenerationBestEffort: typeof implementation.enqueueResumePoolReviewGenerationBestEffort =
  bindResumeProcessingDatabase(db, implementation.enqueueResumePoolReviewGenerationBestEffort);
/** @deprecated Use scheduleResumeEvaluationForRecord. */
export const enqueueResumeReviewGenerationForRecordBestEffort: typeof implementation.enqueueResumeReviewGenerationForRecordBestEffort =
  bindResumeProcessingDatabase(db, implementation.enqueueResumeReviewGenerationForRecordBestEffort);
export const enqueueResumeReassessmentForRecord: typeof implementation.enqueueResumeReassessmentForRecord =
  bindResumeProcessingDatabase(db, implementation.enqueueResumeReassessmentForRecord);
export const scheduleResumeEvaluationForRecord: typeof implementation.scheduleResumeEvaluationForRecord =
  bindResumeProcessingDatabase(db, implementation.scheduleResumeEvaluationForRecord);
