import { db } from "../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/agents/resume-analysis-agent";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/agents/resume-analysis-agent";

export const analyzeResumeFile: typeof implementation.analyzeResumeFile =
  bindResumeProcessingDatabase(db, implementation.analyzeResumeFile);
export const buildCandidateInterviewQuestionPrompt: typeof implementation.buildCandidateInterviewQuestionPrompt =
  bindResumeProcessingDatabase(db, implementation.buildCandidateInterviewQuestionPrompt);
export const generateInterviewQuestionsForProfile: typeof implementation.generateInterviewQuestionsForProfile =
  bindResumeProcessingDatabase(db, implementation.generateInterviewQuestionsForProfile);
export const isPdfFile: typeof implementation.isPdfFile = bindResumeProcessingDatabase(
  db,
  implementation.isPdfFile,
);
export const isSupportedResumeDocumentFile: typeof implementation.isSupportedResumeDocumentFile =
  bindResumeProcessingDatabase(db, implementation.isSupportedResumeDocumentFile);
export const normalizeResumeProfile: typeof implementation.normalizeResumeProfile =
  bindResumeProcessingDatabase(db, implementation.normalizeResumeProfile);
export const parseResumeBytesToProfile: typeof implementation.parseResumeBytesToProfile =
  bindResumeProcessingDatabase(db, implementation.parseResumeBytesToProfile);
export const parseResumeFastToProfile: typeof implementation.parseResumeFastToProfile =
  bindResumeProcessingDatabase(db, implementation.parseResumeFastToProfile);
export const streamGenerateInterviewQuestions: typeof implementation.streamGenerateInterviewQuestions =
  bindResumeProcessingDatabase(db, implementation.streamGenerateInterviewQuestions);
export const streamParseResumeProfile: typeof implementation.streamParseResumeProfile =
  bindResumeProcessingDatabase(db, implementation.streamParseResumeProfile);
export const validateResumeFile: typeof implementation.validateResumeFile =
  bindResumeProcessingDatabase(db, implementation.validateResumeFile);
