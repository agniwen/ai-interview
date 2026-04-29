/**
 * 面试会话相关的领域类型。
 * Domain types for an interview session.
 *
 * 这一文件聚焦"会话快照 / 对话轮 / 报告"三类数据的形状，不含运行时逻辑。
 * Focus: shape of session snapshots, transcript turns, and reports — no runtime logic.
 */

/**
 * 实时对话中收到的一轮 transcript（来自 Agent webhook / 流）。
 * A transcript turn received in real time (from agent webhook / stream).
 */
export interface InterviewTranscriptTurn {
  role: "agent" | "user";
  message: string;
  timeInCallSecs?: number;
}

/**
 * 已落库的对话轮：相对于实时 turn，多了 id / 时间戳 / 来源等元数据。
 * Persisted transcript turn — adds id / timestamps / source on top of the live turn.
 */
export interface PersistedInterviewTurn {
  id: string;
  conversationId: string;
  interviewRecordId: string | null;
  role: "agent" | "user";
  message: string;
  source: string;
  timeInCallSecs: number | null;
  createdAt: string | Date;
  receivedAt: string | Date;
}

/**
 * 一次面试会话的完整快照：状态 + 评估 + 全部 transcript。
 * Full snapshot of an interview session: status, evaluation, and all transcripts.
 */
export interface InterviewConversationSnapshot {
  conversationId: string;
  interviewRecordId: string | null;
  agentId: string | null;
  status: string;
  mode: string | null;
  callSuccessful: string | null;
  transcriptSummary: string | null;
  evaluationCriteriaResults: Record<string, unknown>;
  dataCollectionResults: Record<string, unknown>;
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, unknown>;
  latestError: string | null;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  webhookReceivedAt: string | Date | null;
  lastSyncedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  turns: PersistedInterviewTurn[];
}

/**
 * Studio 后台展示的面试报告：在 snapshot 之上预聚合了几个轮次计数，
 * 减少前端二次计算成本。
 *
 * Studio admin-facing report — `snapshot` plus precomputed turn counts so the UI
 * doesn't have to recount every render.
 */
export interface StudioInterviewConversationReport {
  conversationId: string;
  interviewRecordId: string | null;
  agentId: string | null;
  status: string;
  mode: string | null;
  callSuccessful: string | null;
  transcriptSummary: string | null;
  evaluationCriteriaResults: Record<string, unknown>;
  dataCollectionResults: Record<string, unknown>;
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, unknown>;
  latestError: string | null;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  webhookReceivedAt: string | Date | null;
  lastSyncedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  turns: PersistedInterviewTurn[];
  turnCount: number;
  userTurnCount: number;
  agentTurnCount: number;
  // 录像相关元信息: file_key 仅服务端可见, 前端通过预签名 URL 接口换取播放地址
  // Recording metadata; the file_key is server-side only — the browser fetches a
  // presigned URL via /recordings/:conversationId.
  recordingStatus: "pending" | "active" | "completed" | "failed" | null;
  recordingDurationSecs: number | null;
}
