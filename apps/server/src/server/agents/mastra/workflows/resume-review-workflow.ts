import { db } from "../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/agents/mastra/workflows/resume-review-workflow";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/agents/mastra/workflows/resume-review-workflow";

export const createResumeReviewWorkflow: typeof implementation.createResumeReviewWorkflow =
  bindResumeProcessingDatabase(db, implementation.createResumeReviewWorkflow);
export const runResumeReviewWorkflow: typeof implementation.runResumeReviewWorkflow =
  bindResumeProcessingDatabase(db, implementation.runResumeReviewWorkflow);
export const streamResumeReviewWorkflow: typeof implementation.streamResumeReviewWorkflow =
  bindResumeProcessingDatabase(db, implementation.streamResumeReviewWorkflow);
