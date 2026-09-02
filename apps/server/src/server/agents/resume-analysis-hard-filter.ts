import { db } from "../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/agents/resume-analysis-hard-filter";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/agents/resume-analysis-hard-filter";

export const buildHardFilterRejectReview: typeof implementation.buildHardFilterRejectReview =
  bindResumeProcessingDatabase(db, implementation.buildHardFilterRejectReview);
export const generateResumeScreeningEvidence: typeof implementation.generateResumeScreeningEvidence =
  bindResumeProcessingDatabase(db, implementation.generateResumeScreeningEvidence);
export const generateResumeScreeningResult: typeof implementation.generateResumeScreeningResult =
  bindResumeProcessingDatabase(db, implementation.generateResumeScreeningResult);
export const runResumeReviewHardFilter: typeof implementation.runResumeReviewHardFilter =
  bindResumeProcessingDatabase(db, implementation.runResumeReviewHardFilter);
