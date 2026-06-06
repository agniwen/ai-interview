import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { interviewConversation, interviewConversationTurn } from "@arc/db-schema/schema";

type InterviewConversationRow = typeof interviewConversation.$inferSelect;
type InterviewConversationTurnRow = typeof interviewConversationTurn.$inferSelect;

function buildFallbackTurns(
  conversation: InterviewConversationRow,
): InterviewConversationTurnRow[] {
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  const fallbackCreatedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;
  const fallbackReceivedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;

  return transcript.map((turn, index) => ({
    conversationId: conversation.conversationId,
    createdAt: fallbackCreatedAt,
    id: `${conversation.conversationId}:webhook:${index}`,
    interviewRecordId: conversation.interviewRecordId,
    message: turn.message,
    organizationId: conversation.organizationId,
    receivedAt: fallbackReceivedAt,
    role: turn.role,
    source: "post_call_transcription",
    timeInCallSecs: turn.timeInCallSecs ?? null,
  }));
}

function serializeConversationReport(
  conversation: InterviewConversationRow,
  turnRows: InterviewConversationTurnRow[],
): StudioInterviewConversationReport {
  const turns = turnRows.length > 0 ? turnRows : buildFallbackTurns(conversation);

  return {
    agentId: conversation.agentId,
    agentTurnCount: turns.filter((turn) => turn.role === "agent").length,
    callSuccessful: conversation.callSuccessful,
    conversationId: conversation.conversationId,
    createdAt: conversation.createdAt,
    dataCollectionResults: conversation.dataCollectionResults ?? {},
    dynamicVariables: conversation.dynamicVariables ?? {},
    endedAt: conversation.endedAt,
    evaluationCriteriaResults: conversation.evaluationCriteriaResults ?? {},
    interviewRecordId: conversation.interviewRecordId,
    lastSyncedAt: conversation.lastSyncedAt,
    latestError: conversation.latestError,
    metadata: conversation.metadata ?? {},
    metrics: conversation.metrics ?? {},
    mode: conversation.mode,
    recordingDurationSecs: conversation.recordingDurationSecs,
    recordingStatus: conversation.recordingStatus,
    startedAt: conversation.startedAt,
    status: conversation.status,
    transcriptSummary: conversation.transcriptSummary,
    turnCount: turns.length,
    turns,
    updatedAt: conversation.updatedAt,
    userTurnCount: turns.filter((turn) => turn.role === "user").length,
    webhookReceivedAt: conversation.webhookReceivedAt,
  };
}

export async function queryInterviewConversationReports(interviewRecordId: string) {
  const conversations = await db
    .select()
    .from(interviewConversation)
    .where(eq(interviewConversation.interviewRecordId, interviewRecordId))
    .orderBy(desc(interviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [] as StudioInterviewConversationReport[];
  }

  const conversationIds = conversations.map((conversation) => conversation.conversationId);
  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(inArray(interviewConversationTurn.conversationId, conversationIds))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));

  return conversations.map((conversation) => {
    const turns = turnRows.filter((turn) => turn.conversationId === conversation.conversationId);
    return serializeConversationReport(conversation, turns);
  });
}

// 按轮次（scheduleEntryId）过滤 conversations，适用于 round-keyed 的报告端点。
// Filter conversations by round (scheduleEntryId) for round-keyed report endpoints.
export async function queryInterviewConversationReportsByRound(scheduleEntryId: string) {
  const conversations = await db
    .select()
    .from(interviewConversation)
    .where(eq(interviewConversation.scheduleEntryId, scheduleEntryId))
    .orderBy(desc(interviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [] as StudioInterviewConversationReport[];
  }

  const conversationIds = conversations.map((conversation) => conversation.conversationId);
  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(inArray(interviewConversationTurn.conversationId, conversationIds))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));

  return conversations.map((conversation) => {
    const turns = turnRows.filter((turn) => turn.conversationId === conversation.conversationId);
    return serializeConversationReport(conversation, turns);
  });
}
