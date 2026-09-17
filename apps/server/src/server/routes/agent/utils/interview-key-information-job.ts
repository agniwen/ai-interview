import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../../../lib/server/db/index";
import { aiInterviewConversation } from "@app/db-schema/schema";
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
      .update(aiInterviewConversation)
      .set({
        keyInformationAttempts: sql`${aiInterviewConversation.keyInformationAttempts} + 1`,
        keyInformationStartedAt: startedAt,
        keyInformationStatus: "running",
      })
      .where(
        and(
          eq(aiInterviewConversation.conversationId, conversationId),
          or(
            inArray(aiInterviewConversation.keyInformationStatus, ["pending", "failed"]),
            and(
              eq(aiInterviewConversation.keyInformationStatus, "running"),
              lt(aiInterviewConversation.keyInformationStartedAt, staleRunningThreshold),
            ),
          ),
        ),
      )
      .returning({
        keyInformationStartedAt: aiInterviewConversation.keyInformationStartedAt,
        transcript: aiInterviewConversation.transcript,
      }),
  createEvidence: createInterviewEvidenceSnapshot,
  generate: generateInterviewKeyInformation,
  markFailed: async ({ conversationId, message, startedAt }) => {
    await db
      .update(aiInterviewConversation)
      .set({
        keyInformationError: message,
        keyInformationStatus: "failed",
      })
      .where(
        and(
          eq(aiInterviewConversation.conversationId, conversationId),
          eq(aiInterviewConversation.keyInformationStatus, "running"),
          eq(aiInterviewConversation.keyInformationStartedAt, startedAt),
        ),
      )
      .returning({ conversationId: aiInterviewConversation.conversationId });
  },
  persist: ({ conversationId, keyInformation, startedAt }) =>
    db
      .update(aiInterviewConversation)
      .set({
        keyInformation,
        keyInformationAttempts: 0,
        keyInformationError: null,
        keyInformationStatus: "ready",
      })
      .where(
        and(
          eq(aiInterviewConversation.conversationId, conversationId),
          eq(aiInterviewConversation.keyInformationStatus, "running"),
          eq(aiInterviewConversation.keyInformationStartedAt, startedAt),
        ),
      )
      .returning({ conversationId: aiInterviewConversation.conversationId }),
  publish: (interviewRecordId) => {
    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(interviewRecordId));
  },
};

export const runKeyInformationJob = (
  options: Parameters<typeof runKeyInformationJobWithDependencies>[0],
) => runKeyInformationJobWithDependencies(options, productionDependencies);
