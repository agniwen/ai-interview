import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/resumes/utils/candidate-question-generation";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/resumes/utils/candidate-question-generation";

export const enqueueCandidateQuestionGenerationForRecordBestEffort: typeof implementation.enqueueCandidateQuestionGenerationForRecordBestEffort =
  bindResumeProcessingDatabase(
    db,
    implementation.enqueueCandidateQuestionGenerationForRecordBestEffort,
  );
export const generateCandidateInterviewQuestions: typeof implementation.generateCandidateInterviewQuestions =
  bindResumeProcessingDatabase(db, implementation.generateCandidateInterviewQuestions);
