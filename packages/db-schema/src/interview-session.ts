/**
 * 面试会话相关的领域类型。
 * Domain types for an interview session.
 *
 * 这一文件聚焦"会话快照 / 对话轮 / 报告"三类数据的形状，不含运行时逻辑。
 * Focus: shape of session snapshots, transcript turns, and reports — no runtime logic.
 */

import type { InterviewMessageRole, InterviewRecordingStatus } from "./db-enums";
import type { InterviewKeyInformation } from "./interview-key-information";

/**
 * 实时对话中收到的一轮 transcript（来自 Agent webhook / 流）。
 * A transcript turn received in real time (from agent webhook / stream).
 */
export interface InterviewTranscriptTurn {
  role: InterviewMessageRole;
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
  role: InterviewMessageRole;
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
  keyInformation: InterviewKeyInformation | null;
  dataCollectionResults: Record<string, unknown>;
  metadata: Record<string, unknown>;
  // Agent 端 metrics_collected 聚合：STT/LLM/TTS/EOU/打断的会话级总览与 per-speech_id 明细。
  // 结构与 agent.py 中 metrics_state 容器一致；Studio 详情页消费它渲染延迟/用量面板。
  // STT/LLM/TTS/EOU/interruption aggregates from the agent's metrics_collected
  // listener. Shape mirrors the metrics_state container in agent.py; the Studio
  // detail dialog consumes it to render the latency/usage panel.
  metrics: Record<string, unknown>;
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

export interface InterviewReportSnapshotMetadata {
  contextSnapshot: {
    contentHash: string;
    createdAt: string | Date;
    id: string;
    reason: string;
    scheduleEntryId: string | null;
    schemaVersion: number;
    status: string;
    version: number;
  } | null;
  evidenceSnapshot: {
    contentHash: string;
    contextSnapshotId: string;
    createdAt: string | Date;
    generatedAt: string | null;
    id: string;
    scheduleEntryId: string | null;
    schemaVersion: number;
  } | null;
  frozenInput: {
    candidateEmail: string | null;
    candidateName: string | null;
    formCount: number;
    formQuestionCount: number;
    formSubmissionCount: number;
    interviewerCount: number;
    jobDescriptionName: string | null;
    personalizedQuestionCount: number;
    questionTemplateCount: number;
    questionTemplateQuestionCount: number;
    targetRole: string | null;
  } | null;
  fullTextInput: {
    candidate: {
      candidateEmail: string | null;
      candidateName: string | null;
      candidatePhone: string | null;
      resumeProfileJson: string | null;
      targetRole: string | null;
    };
    formSubmissions: {
      answers: {
        label: string;
        questionId: string;
        valueText: string;
      }[];
      submittedAt: string;
      templateId: string;
      title: string;
      version: number;
      versionId: string;
    }[];
    forms: {
      description: string | null;
      questions: {
        helperText: string | null;
        label: string;
        optionsText: string | null;
        questionId: string;
        required: boolean;
        type: string;
      }[];
      templateId: string;
      title: string;
      version: number;
      versionId: string;
    }[];
    globalConfig: {
      closingInstructions: string | null;
      companyContext: string | null;
      openingInstructions: string | null;
    };
    interviewers: {
      name: string;
      prompt: string | null;
      voice: string | null;
    }[];
    jobDescription: {
      id: string;
      name: string;
      prompt: string | null;
    } | null;
    personalizedQuestions: {
      difficulty: string;
      evaluationFocus?: string | null;
      followUpDirections?: string | null;
      order: number;
      question: string;
    }[];
    questionTemplates: {
      description: string | null;
      questions: {
        content: string;
        difficulty: string;
        evaluationFocus?: string | null;
        followUpDirections?: string | null;
        questionId: string;
      }[];
      templateId: string;
      title: string;
      version: number;
      versionId: string;
    }[];
    transcript: InterviewTranscriptTurn[];
  } | null;
  session: {
    recordingDurationSecs: number | null;
    recordingStatus: InterviewRecordingStatus | null;
    scheduleEntryId: string | null;
    transcriptTurnCount: number;
  };
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
  keyInformation: InterviewKeyInformation | null;
  dataCollectionResults: Record<string, unknown>;
  metadata: Record<string, unknown>;
  // Agent 端 metrics_collected 聚合：STT/LLM/TTS/EOU/打断的会话级总览与 per-speech_id 明细。
  // 结构与 agent.py 中 metrics_state 容器一致；Studio 详情页消费它渲染延迟/用量面板。
  // STT/LLM/TTS/EOU/interruption aggregates from the agent's metrics_collected
  // listener. Shape mirrors the metrics_state container in agent.py; the Studio
  // detail dialog consumes it to render the latency/usage panel.
  metrics: Record<string, unknown>;
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
  recordingStatus: InterviewRecordingStatus | null;
  recordingDurationSecs: number | null;
  snapshotMetadata?: InterviewReportSnapshotMetadata | null;
}
