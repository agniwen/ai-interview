import type { StudioInterviewConversationReport } from "@/lib/shared/interview-session";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/server/db";
import { interviewConversation, interviewConversationTurn } from "@/lib/shared/db/schema";

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

async function queryInterviewConversationReports(interviewRecordId: string) {
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

/** Cached version for Server Components */
// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listInterviewConversationReports(interviewRecordId: string) {
  "use cache";
  cacheTag("interview-conversations", `interview-conversations-${interviewRecordId}`);
  cacheLife("minutes");

  return queryInterviewConversationReports(interviewRecordId);
}

// 按轮次（scheduleEntryId）过滤 conversations，适用于 round-keyed 的报告端点。
// Filter conversations by round (scheduleEntryId) for round-keyed report endpoints.
async function queryInterviewConversationReportsByRound(scheduleEntryId: string) {
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

/** Cached version for Server Components */
// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listInterviewConversationReportsByRound(scheduleEntryId: string) {
  "use cache";
  cacheTag("interview-conversations", `interview-conversations-round-${scheduleEntryId}`);
  cacheLife("minutes");
  return queryInterviewConversationReportsByRound(scheduleEntryId);
}

/** Uncached version for API route handlers */
export { queryInterviewConversationReports, queryInterviewConversationReportsByRound };
