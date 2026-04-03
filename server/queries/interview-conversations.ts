import type { StudioInterviewConversationReport } from '@/lib/interview-session';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviewConversation, interviewConversationTurn } from '@/lib/db/schema';

type InterviewConversationRow = typeof interviewConversation.$inferSelect;
type InterviewConversationTurnRow = typeof interviewConversationTurn.$inferSelect;

function buildFallbackTurns(conversation: InterviewConversationRow): InterviewConversationTurnRow[] {
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  const fallbackCreatedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;
  const fallbackReceivedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;

  return transcript.map((turn, index) => ({
    id: `${conversation.conversationId}:webhook:${index}`,
    conversationId: conversation.conversationId,
    interviewRecordId: conversation.interviewRecordId,
    role: turn.role,
    message: turn.message,
    source: 'post_call_transcription',
    timeInCallSecs: turn.timeInCallSecs ?? null,
    createdAt: fallbackCreatedAt,
    receivedAt: fallbackReceivedAt,
  }));
}

function serializeConversationReport(
  conversation: InterviewConversationRow,
  turnRows: InterviewConversationTurnRow[],
): StudioInterviewConversationReport {
  const turns = turnRows.length > 0 ? turnRows : buildFallbackTurns(conversation);

  return {
    conversationId: conversation.conversationId,
    interviewRecordId: conversation.interviewRecordId,
    agentId: conversation.agentId,
    status: conversation.status,
    mode: conversation.mode,
    callSuccessful: conversation.callSuccessful,
    transcriptSummary: conversation.transcriptSummary,
    evaluationCriteriaResults: conversation.evaluationCriteriaResults ?? {},
    dataCollectionResults: conversation.dataCollectionResults ?? {},
    metadata: conversation.metadata ?? {},
    dynamicVariables: conversation.dynamicVariables ?? {},
    latestError: conversation.latestError,
    startedAt: conversation.startedAt,
    endedAt: conversation.endedAt,
    webhookReceivedAt: conversation.webhookReceivedAt,
    lastSyncedAt: conversation.lastSyncedAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    turns,
    turnCount: turns.length,
    userTurnCount: turns.filter(turn => turn.role === 'user').length,
    agentTurnCount: turns.filter(turn => turn.role === 'agent').length,
  };
}

export async function listInterviewConversationReports(interviewRecordId: string) {
  const conversations = await db
    .select()
    .from(interviewConversation)
    .where(eq(interviewConversation.interviewRecordId, interviewRecordId))
    .orderBy(desc(interviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [] as StudioInterviewConversationReport[];
  }

  const conversationIds = conversations.map(conversation => conversation.conversationId);
  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(inArray(interviewConversationTurn.conversationId, conversationIds))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));

  return conversations.map((conversation) => {
    const turns = turnRows.filter(turn => turn.conversationId === conversation.conversationId);
    return serializeConversationReport(conversation, turns);
  });
}
