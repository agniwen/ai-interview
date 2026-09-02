import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import { interviewConversation } from "@app/db-schema/schema";
import { cacheTags, safeUpdateTag } from "../../../cache-tags";
import { createInterviewEvidenceSnapshot } from "./evidence-snapshot";
import { generateInterviewKeyInformation } from "./interview-key-information";
import { buildInterviewReportQuestionsFromContext } from "./interview-report-questions";
import { runKeyInformationJob as runKeyInformationJobWithDependencies } from "./interview-key-information-job-core";
import type { KeyInformationJobDependencies } from "./interview-key-information-job-core";

const productionDependencies: KeyInformationJobDependencies = {
  buildQuestions: buildInterviewReportQuestionsFromContext,
  claim: ({ conversationId, startedAt, staleRunningThreshold }) =>
    db
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
      }),
  createEvidence: createInterviewEvidenceSnapshot,
  generate: generateInterviewKeyInformation,
  markFailed: async ({ conversationId, message, startedAt }) => {
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
          eq(interviewConversation.keyInformationStartedAt, startedAt),
        ),
      )
      .returning({ conversationId: interviewConversation.conversationId });
  },
  persist: ({ conversationId, keyInformation, startedAt }) =>
    db
      .update(interviewConversation)
      .set({
        keyInformation,
        keyInformationAttempts: 0,
        keyInformationError: null,
        keyInformationStatus: "ready",
      })
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          eq(interviewConversation.keyInformationStatus, "running"),
          eq(interviewConversation.keyInformationStartedAt, startedAt),
        ),
      )
      .returning({ conversationId: interviewConversation.conversationId }),
  publish: (interviewRecordId) => {
    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(interviewRecordId));
  },
};

export const runKeyInformationJob = (
  options: Parameters<typeof runKeyInformationJobWithDependencies>[0],
) => runKeyInformationJobWithDependencies(options, productionDependencies);
