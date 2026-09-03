import { db } from "../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/agents/mastra/workflows/interview-questions-workflow";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/agents/mastra/workflows/interview-questions-workflow";

export const createInterviewQuestionsWorkflow: typeof implementation.createInterviewQuestionsWorkflow =
  bindResumeProcessingDatabase(db, implementation.createInterviewQuestionsWorkflow);
export const runInterviewQuestionsWorkflow: typeof implementation.runInterviewQuestionsWorkflow =
  bindResumeProcessingDatabase(db, implementation.runInterviewQuestionsWorkflow);
export const streamInterviewQuestionsWorkflow: typeof implementation.streamInterviewQuestionsWorkflow =
  bindResumeProcessingDatabase(db, implementation.streamInterviewQuestionsWorkflow);
