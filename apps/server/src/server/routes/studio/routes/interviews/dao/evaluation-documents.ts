import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { uniq } from "lodash-es";

import { db } from "../../../../../../lib/server/db/index";
import { aiInterviewConversation, aiInterviewRound } from "@app/db-schema/schema";
import { loadLatestFeishuDocumentUrls } from "./feishu-document-urls";
import { resolveEvaluationDocument } from "./evaluation-document-status";
import type { FeishuEvaluationDocumentProjection } from "./evaluation-document-status";

type InterviewConversationRow = typeof aiInterviewConversation.$inferSelect;

export interface LatestEndedInterviewConversation {
  conversationId: string;
  dataCollectionResults: InterviewConversationRow["dataCollectionResults"];
  interviewRecordId: string | null;
  scheduleEntryId: string | null;
  summaryStatus: InterviewConversationRow["summaryStatus"];
}

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
      conversationId: aiInterviewConversation.conversationId,
      dataCollectionResults: aiInterviewConversation.dataCollectionResults,
      interviewRecordId: aiInterviewConversation.recruitingRecordId,
      scheduleEntryId: aiInterviewConversation.aiRoundId,
      summaryStatus: aiInterviewConversation.summaryStatus,
    })
    .from(aiInterviewConversation)
    .where(
      and(
        eq(aiInterviewConversation.organizationId, organizationId),
        inArray(aiInterviewConversation.aiRoundId, ids),
        isNotNull(aiInterviewConversation.endedAt),
      ),
    )
    .orderBy(
      asc(aiInterviewConversation.aiRoundId),
      desc(aiInterviewConversation.endedAt),
      desc(aiInterviewConversation.updatedAt),
    );

  const result = new Map<string, LatestEndedInterviewConversation>();
  for (const row of rows) {
    if (row.scheduleEntryId && !result.has(row.scheduleEntryId)) {
      result.set(row.scheduleEntryId, row);
    }
  }
  return result;
}

export async function loadRoundFeishuEvaluationDocuments(
  roundIds: string[],
  organizationId: string,
): Promise<Map<string, FeishuEvaluationDocumentProjection>> {
  if (roundIds.length === 0) {
    return new Map();
  }
  const [latestConversationByRoundId, rounds] = await Promise.all([
    loadLatestEndedInterviewConversations(roundIds, organizationId),
    db
      .select({ id: aiInterviewRound.id, recordId: aiInterviewRound.recruitingRecordId })
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.organizationId, organizationId),
          inArray(aiInterviewRound.id, roundIds),
        ),
      ),
  ]);
  const documents = await loadLatestFeishuDocumentUrls({
    ids: rounds.map((row) => row.recordId),
    key: "interviewRecordId",
    organizationId,
  });
  return new Map(
    rounds.map((round) => {
      const url = documents.get(round.recordId);
      const conversation = latestConversationByRoundId.get(round.id);
      let projection: FeishuEvaluationDocumentProjection = { status: "unavailable", url: null };
      if (url) {
        projection = { status: "generated", url };
      } else if (conversation) {
        projection = resolveEvaluationDocument(conversation, new Map());
      }
      return [round.id, projection];
    }),
  );
}

export async function loadLatestEndedInterviewConversationForRound(
  roundId: string,
  organizationId: string,
): Promise<LatestEndedInterviewConversation | null> {
  const rows = await loadLatestEndedInterviewConversations([roundId], organizationId);
  return rows.get(roundId) ?? null;
}
