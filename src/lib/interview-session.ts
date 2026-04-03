export interface InterviewTranscriptTurn {
  role: 'agent' | 'user'
  message: string
  timeInCallSecs?: number
}

export interface PersistedInterviewTurn {
  id: string
  conversationId: string
  interviewRecordId: string | null
  role: 'agent' | 'user'
  message: string
  source: string
  timeInCallSecs: number | null
  createdAt: string | Date
  receivedAt: string | Date
}

export interface InterviewConversationSnapshot {
  conversationId: string
  interviewRecordId: string | null
  agentId: string | null
  status: string
  mode: string | null
  callSuccessful: string | null
  transcriptSummary: string | null
  evaluationCriteriaResults: Record<string, unknown>
  dataCollectionResults: Record<string, unknown>
  metadata: Record<string, unknown>
  dynamicVariables: Record<string, unknown>
  latestError: string | null
  startedAt: string | Date | null
  endedAt: string | Date | null
  webhookReceivedAt: string | Date | null
  lastSyncedAt: string | Date
  createdAt: string | Date
  updatedAt: string | Date
  turns: PersistedInterviewTurn[]
}

export interface StudioInterviewConversationReport {
  conversationId: string
  interviewRecordId: string | null
  agentId: string | null
  status: string
  mode: string | null
  callSuccessful: string | null
  transcriptSummary: string | null
  evaluationCriteriaResults: Record<string, unknown>
  dataCollectionResults: Record<string, unknown>
  metadata: Record<string, unknown>
  dynamicVariables: Record<string, unknown>
  latestError: string | null
  startedAt: string | Date | null
  endedAt: string | Date | null
  webhookReceivedAt: string | Date | null
  lastSyncedAt: string | Date
  createdAt: string | Date
  updatedAt: string | Date
  turns: PersistedInterviewTurn[]
  turnCount: number
  userTurnCount: number
  agentTurnCount: number
}
