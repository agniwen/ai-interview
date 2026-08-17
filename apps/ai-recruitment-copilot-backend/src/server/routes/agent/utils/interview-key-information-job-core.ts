import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewKeyInformation } from "@arc/db-schema/interview-key-information";
import type { createInterviewEvidenceSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot";
import type { generateInterviewKeyInformation } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-key-information";
import type { buildInterviewReportQuestionsFromContext } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-report-questions";

const LOG_PREFIX = "[interview-key-information]";
const RUNNING_STALE_MINUTES = 10;

export interface RunKeyInformationJobOptions {
  conversationId: string;
  interviewRecordId: string;
}

export interface ClaimedKeyInformationRun {
  keyInformationStartedAt: Date | null;
  transcript: InterviewTranscriptTurn[] | null;
}

export interface KeyInformationJobDependencies {
  buildQuestions: typeof buildInterviewReportQuestionsFromContext;
  claim: (input: {
    conversationId: string;
    startedAt: Date;
    staleRunningThreshold: Date;
  }) => Promise<ClaimedKeyInformationRun[]>;
  createEvidence: typeof createInterviewEvidenceSnapshot;
  generate: typeof generateInterviewKeyInformation;
  markFailed: (input: {
    conversationId: string;
    message: string;
    startedAt: Date;
  }) => Promise<void>;
  persist: (input: {
    conversationId: string;
    keyInformation: InterviewKeyInformation;
    startedAt: Date;
  }) => Promise<{ conversationId: string }[]>;
  publish: (interviewRecordId: string) => void;
}

export async function runKeyInformationJob(
  options: RunKeyInformationJobOptions,
  dependencies: KeyInformationJobDependencies,
): Promise<void> {
  const { conversationId, interviewRecordId } = options;
  const startedAt = new Date();
  let claimedStartedAt: Date | null = null;

  try {
    const staleRunningThreshold = new Date(Date.now() - RUNNING_STALE_MINUTES * 60 * 1000);
    const claimed = await dependencies.claim({
      conversationId,
      staleRunningThreshold,
      startedAt,
    });
    if (claimed.length === 0) {
      return;
    }

    const [{ keyInformationStartedAt, transcript }] = claimed;
    if (!keyInformationStartedAt) {
      throw new Error("claimed key-information job has no start time");
    }
    claimedStartedAt = keyInformationStartedAt;
    if (!transcript || transcript.length === 0) {
      await dependencies.markFailed({
        conversationId,
        message: "empty transcript",
        startedAt: claimedStartedAt,
      });
      return;
    }

    const evidence = await dependencies.createEvidence({
      conversationId,
      interviewRecordId,
    });
    const { context } = evidence.payload;
    const keyInformation = await dependencies.generate({
      jobDescription: context.jobDescription,
      questions: dependencies.buildQuestions(context),
      targetRole: context.candidate.targetRole,
      transcript,
    });
    const completed = await dependencies.persist({
      conversationId,
      keyInformation,
      startedAt: claimedStartedAt,
    });
    if (completed.length === 0) {
      return;
    }
    dependencies.publish(interviewRecordId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`${LOG_PREFIX} failed for ${conversationId}:`, error);
    if (!claimedStartedAt) {
      return;
    }
    try {
      await dependencies.markFailed({
        conversationId,
        message,
        startedAt: claimedStartedAt,
      });
    } catch (updateError) {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} failed to mark failure state:`, updateError);
    }
  }
}
