import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewConversation } from "@arc/db-schema/schema";
import { cacheTags, safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { createInterviewEvidenceSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot";
import { generateInterviewKeyInformation } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-key-information";
import { buildInterviewReportQuestionsFromContext } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-report-questions";

const LOG_PREFIX = "[interview-key-information]";
const RUNNING_STALE_MINUTES = 10;

export interface RunKeyInformationJobOptions {
  conversationId: string;
  interviewRecordId: string;
}

export async function runKeyInformationJob(options: RunKeyInformationJobOptions): Promise<void> {
  const { conversationId, interviewRecordId } = options;
  const startedAt = new Date();
  let claimedStartedAt: Date | null = null;

  try {
    const staleRunningThreshold = new Date(Date.now() - RUNNING_STALE_MINUTES * 60 * 1000);
    const claimed = await db
      .update(interviewConversation)
      .set({
        keyInformationAttempts: sql`${interviewConversation.keyInformationAttempts} + 1`,
        keyInformationStartedAt: startedAt,
        keyInformationStatus: "running",
      })
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          or(
            inArray(interviewConversation.keyInformationStatus, ["pending", "failed"]),
            and(
              eq(interviewConversation.keyInformationStatus, "running"),
              lt(interviewConversation.keyInformationStartedAt, staleRunningThreshold),
            ),
          ),
        ),
      )
      .returning({
        keyInformationStartedAt: interviewConversation.keyInformationStartedAt,
        transcript: interviewConversation.transcript,
      });

    if (claimed.length === 0) {
      return;
    }

    const [{ keyInformationStartedAt, transcript }] = claimed;
    if (!keyInformationStartedAt) {
      throw new Error("claimed key-information job has no start time");
    }
    claimedStartedAt = keyInformationStartedAt;
    const ownedRunPredicate = and(
      eq(interviewConversation.conversationId, conversationId),
      eq(interviewConversation.keyInformationStatus, "running"),
      eq(interviewConversation.keyInformationStartedAt, claimedStartedAt),
    );

    if (!transcript || transcript.length === 0) {
      await db
        .update(interviewConversation)
        .set({
          keyInformationError: "empty transcript",
          keyInformationStatus: "failed",
        })
        .where(ownedRunPredicate);
      return;
    }

    const evidence = await createInterviewEvidenceSnapshot({
      conversationId,
      interviewRecordId,
    });
    const { context } = evidence.payload;
    const keyInformation = await generateInterviewKeyInformation({
      jobDescription: context.jobDescription,
      questions: buildInterviewReportQuestionsFromContext(context),
      targetRole: context.candidate.targetRole,
      transcript,
    });

    const completed = await db
      .update(interviewConversation)
      .set({
        keyInformation,
        keyInformationAttempts: 0,
        keyInformationError: null,
        keyInformationStatus: "ready",
      })
      .where(ownedRunPredicate)
      .returning({ conversationId: interviewConversation.conversationId });

    if (completed.length === 0) {
      return;
    }

    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(interviewRecordId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`${LOG_PREFIX} failed for ${conversationId}:`, error);

    if (!claimedStartedAt) {
      return;
    }

    await db
      .update(interviewConversation)
      .set({
        keyInformationError: message,
        keyInformationStatus: "failed",
      })
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          eq(interviewConversation.keyInformationStatus, "running"),
          eq(interviewConversation.keyInformationStartedAt, claimedStartedAt),
        ),
      )
      .returning({ conversationId: interviewConversation.conversationId })
      .catch((updateError) => {
        // eslint-disable-next-line no-console
        console.error(`${LOG_PREFIX} failed to mark failure state:`, updateError);
      });
  }
}
