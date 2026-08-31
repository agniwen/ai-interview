// AI 面试 round 视图类型。
// list / detail 都从 studio_interview_schedule 主键出发，candidate 信息通过 JOIN 带出快照。
//
// AI interview round-side types. Both list rows and detail are keyed by the
// schedule row's id; candidate info is JOINed in as a snapshot.

import type {
  CandidateInterviewFeedback,
  CandidateOutcome,
  PipelineStage,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";
import type { StudioCandidateRecord } from "@arc/shared/studio-candidates";

export type FeishuEvaluationDocumentStatus = "generated" | "answers_available" | "unavailable";

/** 列表行（精简投影）/ List row (light projection). */
export interface StudioInterviewRoundListRecord {
  /** schedule 行 id（同时是 list 的稳定 rowKey）。 */
  id: string;
  candidateId: string;
  candidateName: string;
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
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  conversationId: string | null;
  candidateInviteExpiresAt: string | null;
  hasReport: boolean;
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
