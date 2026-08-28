import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { uniq } from "lodash-es";

import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewConversation } from "@arc/db-schema/schema";
import {
  hasExistingInterviewAnswers,
  isInterviewQuestionSetComplete,
} from "@arc/shared/interview/question-outcomes";
import type { FeishuEvaluationDocumentStatus } from "@arc/shared/studio-interview-rounds";
import { loadLatestFeishuDocumentUrls } from "./feishu-document-urls";

type InterviewConversationRow = typeof interviewConversation.$inferSelect;

export interface LatestEndedInterviewConversation {
  conversationId: string;
  dataCollectionResults: InterviewConversationRow["dataCollectionResults"];
  interviewRecordId: string | null;
  scheduleEntryId: string | null;
  summaryStatus: InterviewConversationRow["summaryStatus"];
}

export interface FeishuEvaluationDocumentProjection {
  status: FeishuEvaluationDocumentStatus;
  url: string | null;
}

const UNAVAILABLE_FEISHU_EVALUATION_DOCUMENT = {
  status: "unavailable",
  url: null,
} satisfies FeishuEvaluationDocumentProjection;

async function loadLatestEndedInterviewConversations(
  roundIds: string[],
  organizationId: string,
): Promise<Map<string, LatestEndedInterviewConversation>> {
  const ids = uniq(roundIds.filter(Boolean));
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      conversationId: interviewConversation.conversationId,
      dataCollectionResults: interviewConversation.dataCollectionResults,
      interviewRecordId: interviewConversation.interviewRecordId,
      scheduleEntryId: interviewConversation.scheduleEntryId,
      summaryStatus: interviewConversation.summaryStatus,
    })
    .from(interviewConversation)
    .where(
      and(
        eq(interviewConversation.organizationId, organizationId),
        inArray(interviewConversation.scheduleEntryId, ids),
        isNotNull(interviewConversation.endedAt),
      ),
    )
    .orderBy(
      asc(interviewConversation.scheduleEntryId),
      desc(interviewConversation.endedAt),
      desc(interviewConversation.updatedAt),
    );

  const result = new Map<string, LatestEndedInterviewConversation>();
  for (const row of rows) {
    if (row.scheduleEntryId && !result.has(row.scheduleEntryId)) {
      result.set(row.scheduleEntryId, row);
    }
  }
  return result;
}

function resolveEvaluationDocument(
  conversation: LatestEndedInterviewConversation,
  documentUrlsByConversationId: Map<string, string>,
): FeishuEvaluationDocumentProjection {
  const url = documentUrlsByConversationId.get(conversation.conversationId) ?? null;
  if (url) {
    return { status: "generated", url };
  }
  if (
    conversation.summaryStatus === "ready" &&
    !isInterviewQuestionSetComplete(conversation.dataCollectionResults) &&
    hasExistingInterviewAnswers(conversation.dataCollectionResults)
  ) {
    return { status: "partial_answers_available", url: null };
  }
  return UNAVAILABLE_FEISHU_EVALUATION_DOCUMENT;
}

export async function loadRoundFeishuEvaluationDocuments(
  roundIds: string[],
  organizationId: string,
): Promise<Map<string, FeishuEvaluationDocumentProjection>> {
  const latestConversationByRoundId = await loadLatestEndedInterviewConversations(
    roundIds,
    organizationId,
  );
  const documentUrlsByConversationId = await loadLatestFeishuDocumentUrls({
    ids: [...latestConversationByRoundId.values()].map((row) => row.conversationId),
    key: "conversationId",
    organizationId,
  });
  return new Map(
    [...latestConversationByRoundId.entries()].map(([roundId, conversation]) => [
      roundId,
      resolveEvaluationDocument(conversation, documentUrlsByConversationId),
    ]),
  );
}

export async function loadLatestEndedInterviewConversationForRound(
  roundId: string,
  organizationId: string,
): Promise<LatestEndedInterviewConversation | null> {
  const rows = await loadLatestEndedInterviewConversations([roundId], organizationId);
  return rows.get(roundId) ?? null;
}
