// AI 面试 round 视图类型。
// list / detail 都从 studio_interview_schedule 主键出发，candidate 信息通过 JOIN 带出快照。
//
// AI interview round-side types. Both list rows and detail are keyed by the
// schedule row's id; candidate info is JOINed in as a snapshot.

import type {
  CandidateInterviewFeedback,
  CandidateOutcome,
  HumanInterviewFormat,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  PipelineStage,
  ScheduleEntryStatus,
} from "@app/db-schema/studio-interviews";
import type { StudioCandidateRecord } from "@app/shared/studio-candidates";
import type { AiInterviewRecommendation } from "@app/shared/interview-record-result";

export type FeishuEvaluationDocumentStatus = "generated" | "answers_available" | "unavailable";

/** 列表行（精简投影）/ List row (light projection). */
export interface StudioInterviewRoundListRecord {
  /** schedule 行 id（同时是 list 的稳定 rowKey）。 */
  id: string;
  candidateId: string;
  candidateName: string;
  /** 简历首页头像的缓存版本；null 表示没有可展示的头像。Resume headshot version; null when none. */
  candidateAvatarVersion: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionId: string | null;
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  hasResumeFile: boolean;
  roundLabel: string;
  sortOrder: number;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  lastInterviewAt: string | null;
  /** 最近一场面试（会话/会议）的结束时间；尚未结束为 null。/ End of the latest session; null until it ends. */
  lastInterviewEndedAt: string | null;
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  conversationId: string | null;
  candidateInviteExpiresAt: string | null;
  hasReport: boolean;
  /** 本轮人工评价结论；独立于报告生成状态。 */
  reviewOutcome: "pass" | "fail" | null;
  /** 最近一份 AI 面试报告的建议；尚无报告为 null。/ Latest AI report recommendation. */
  aiRecommendation: AiInterviewRecommendation | null;
  feishuDocumentUrl: string | null;
  feishuEvaluationDocumentStatus: FeishuEvaluationDocumentStatus;
  /** 完整面试链接相对路径 / Relative interview link path. */
  interviewLink: string;
  createdBy: string | null;
  creatorName: string | null;
  creatorImage: string | null;
  creatorOrganizationName: string | null;
  createdAt: string;
  updatedAt: string;
  // candidate 的 pipeline 轴；让列表行能判断 AI 阶段是否已锁。
  // Candidate-side pipeline axes; lets list rows know if AI stage is locked.
  pipelineStage: PipelineStage;
  outcome: CandidateOutcome;
}

/** 单 round 详情 + 候选人快照 / Single-round detail with candidate snapshot. */
export interface StudioInterviewRoundDetail {
  id: string;
  roundLabel: string;
  sortOrder: number;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  candidateFeedback: CandidateInterviewFeedback | null;
  conversationId: string | null;
  candidateInviteExpiresAt: string | null;
  sessionStartedAt: string | null;
  disconnectedAt: string | null;
  notes: string | null;
  interviewLink: string;
  createdAt: string;
  updatedAt: string;
  /** Whether this round currently has any conversation row in interview_conversation. */
  hasReport: boolean;
  /** Candidate snapshot (resume + JD + generated questions). */
  candidate: StudioCandidateRecord;
  /** 候选人简历头像的缓存版本；null 表示没有可展示的头像。Resume headshot version; null when none. */
  candidateAvatarVersion: string | null;
  /**
   * 该轮 JD 简历筛选策略里的必备技能，供报告关键词高亮的 extraSkills。
   * Required skills from the round's JD screening policy, fed to keyword-highlight extraSkills.
   */
  jdRequiredSkills: string[];
}

export interface PaginatedStudioInterviewRoundsResult {
  records: StudioInterviewRoundListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── 面试记录：AI 面试与真人面试合并列表 / Interview records: AI + human rounds ──

export type StudioInterviewRecordKind = "ai" | "human";

/** 两类轮次状态的并集，供列表筛选与统计使用。/ Union of AI and human round statuses. */
export const studioInterviewRecordStatusValues = [
  "pending",
  "in_progress",
  "completed",
  "interrupted",
  "cancelled",
] as const;
export type StudioInterviewRecordStatus = (typeof studioInterviewRecordStatusValues)[number];

export interface StudioAiInterviewRecordListRecord extends StudioInterviewRoundListRecord {
  kind: "ai";
  /** 本轮使用的面试官 Agent 名称；岗位未绑定 Agent 时为 null。/ Interviewer agent for this round. */
  interviewerAgentName: string | null;
}

export interface StudioHumanInterviewRecordInterviewer {
  id: string;
  name: string;
  image: string | null;
}

/** 真人面试轮次行；创建人取招聘记录的创建人。/ Human round row; creator is the recruiting record's creator. */
export interface StudioHumanInterviewRecordListRecord {
  kind: "human";
  /** human_interview_round.id */
  id: string;
  /** 招聘记录 id / Recruiting record id. */
  candidateId: string;
  candidateName: string;
  candidateAvatarVersion: string | null;
  candidateEmail: string | null;
  jobDescriptionId: string | null;
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  hasResumeFile: boolean;
  roundLabel: string;
  format: HumanInterviewFormat;
  scheduledAt: string | null;
  lastInterviewAt: string | null;
  /** 最近一场面试（会话/会议）的结束时间；尚未结束为 null。/ End of the latest session; null until it ends. */
  lastInterviewEndedAt: string | null;
  status: HumanInterviewRoundStatus;
  /** 当前关联会议状态，用于安排编辑守卫。 */
  meetingStatus: string | null;
  interviewers: StudioHumanInterviewRecordInterviewer[];
  conclusion: HumanInterviewRoundOutcome | "none";
  /** 招聘记录上的候选人评价表；与同一候选人的 AI 行共用。/ Record-level evaluation document. */
  feishuDocumentUrl: string | null;
  createdBy: string | null;
  creatorName: string | null;
  creatorImage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudioInterviewRecordListRecord =
  | StudioAiInterviewRecordListRecord
  | StudioHumanInterviewRecordListRecord;

export interface PaginatedStudioInterviewRecordsResult {
  records: StudioInterviewRecordListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StudioInterviewRecordSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
  cancelled: number;
}
