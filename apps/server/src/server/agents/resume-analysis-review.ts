import { db } from "../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/agents/resume-analysis-review";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/agents/resume-analysis-review";

export const composeResumeReviewResult: typeof implementation.composeResumeReviewResult =
  bindResumeProcessingDatabase(db, implementation.composeResumeReviewResult);
export const generateResumeQualitativeReview: typeof implementation.generateResumeQualitativeReview =
  bindResumeProcessingDatabase(db, implementation.generateResumeQualitativeReview);
export const generateResumeQualitativeReviewFromMarkdown: typeof implementation.generateResumeQualitativeReviewFromMarkdown =
  bindResumeProcessingDatabase(db, implementation.generateResumeQualitativeReviewFromMarkdown);
export const generateResumeReview: typeof implementation.generateResumeReview =
  bindResumeProcessingDatabase(db, implementation.generateResumeReview);
export const generateResumeReviewScoring: typeof implementation.generateResumeReviewScoring =
  bindResumeProcessingDatabase(db, implementation.generateResumeReviewScoring);
export const streamGenerateResumeReview: typeof implementation.streamGenerateResumeReview =
  bindResumeProcessingDatabase(db, implementation.streamGenerateResumeReview);
export const streamGenerateResumeReviewMarkdownFirst: typeof implementation.streamGenerateResumeReviewMarkdownFirst =
  bindResumeProcessingDatabase(db, implementation.streamGenerateResumeReviewMarkdownFirst);
