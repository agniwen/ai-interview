import type { interviewConversation, interviewConversationTurn } from "@arc/db-schema/schema";

type Conversation = typeof interviewConversation.$inferSelect;
type Turn = typeof interviewConversationTurn.$inferSelect;

export function buildPublicConversationReport(report: Conversation, persistedTurns: Turn[]) {
  const turns =
    persistedTurns.length > 0
      ? persistedTurns
      : report.transcript.map((turn, index) => ({
          conversationId: report.conversationId,
          createdAt: report.webhookReceivedAt ?? report.updatedAt,
          id: `${report.conversationId}:webhook:${index}`,
          interviewRecordId: report.interviewRecordId,
          message: turn.message,
          organizationId: report.organizationId,
          receivedAt: report.webhookReceivedAt ?? report.updatedAt,
          role: turn.role,
          source: "post_call_transcription" as const,
          timeInCallSecs: turn.timeInCallSecs ?? null,
        }));
  return {
    agentId: report.agentId,
    agentTurnCount: turns.filter((turn) => turn.role === "agent").length,
    callSuccessful: report.callSuccessful,
    conversationId: report.conversationId,
    createdAt: report.createdAt,
    dataCollectionResults: report.dataCollectionResults ?? {},
    dynamicVariables: report.dynamicVariables ?? {},
    endedAt: report.endedAt,
    evaluationCriteriaResults: report.evaluationCriteriaResults ?? {},
    interviewRecordId: report.interviewRecordId,
    keyInformation: null,
    lastSyncedAt: report.lastSyncedAt,
    latestError: report.latestError,
    metadata: report.metadata ?? {},
    metrics: report.metrics ?? {},
    mode: report.mode,
    recordingDurationSecs: report.recordingDurationSecs,
    recordingStatus: report.recordingStatus,
    startedAt: report.startedAt,
    status: report.status,
    transcriptSummary: report.transcriptSummary,
    turnCount: turns.length,
    turns,
    updatedAt: report.updatedAt,
    userTurnCount: turns.filter((turn) => turn.role === "user").length,
    webhookReceivedAt: report.webhookReceivedAt,
  };
}
