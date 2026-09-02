import { db } from "../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/agents/mastra/workflows/resume-analysis-workflow";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/agents/mastra/workflows/resume-analysis-workflow";

export const createResumeAnalysisWorkflow: typeof implementation.createResumeAnalysisWorkflow =
  bindResumeProcessingDatabase(db, implementation.createResumeAnalysisWorkflow);
export const runResumeAnalysisWorkflow: typeof implementation.runResumeAnalysisWorkflow =
  bindResumeProcessingDatabase(db, implementation.runResumeAnalysisWorkflow);
