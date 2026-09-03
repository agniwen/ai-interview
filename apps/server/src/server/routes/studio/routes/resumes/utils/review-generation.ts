import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/resumes/utils/review-generation";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/resumes/utils/review-generation";

export const buildJobDescriptionReviewContext: typeof implementation.buildJobDescriptionReviewContext =
  bindResumeProcessingDatabase(db, implementation.buildJobDescriptionReviewContext);
export const generateLegacyResumeReviewBestEffort: typeof implementation.generateLegacyResumeReviewBestEffort =
  bindResumeProcessingDatabase(db, implementation.generateLegacyResumeReviewBestEffort);
export const generateResumeAssessment: typeof implementation.generateResumeAssessment =
  bindResumeProcessingDatabase(db, implementation.generateResumeAssessment);
export const generateResumeReviewBestEffort: typeof implementation.generateResumeReviewBestEffort =
  bindResumeProcessingDatabase(db, implementation.generateResumeReviewBestEffort);
export const generateResumeScreeningBestEffort: typeof implementation.generateResumeScreeningBestEffort =
  bindResumeProcessingDatabase(db, implementation.generateResumeScreeningBestEffort);
