// AI 面试 round 视图类型。
// list / detail 都从 studio_interview_schedule 主键出发，candidate 信息通过 JOIN 带出快照。
//
// AI interview round-side types. Both list rows and detail are keyed by the
// schedule row's id; candidate info is JOINed in as a snapshot.

import type {
  CandidateOutcome,
  PipelineStage,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";
import type { StudioCandidateRecord } from "@/lib/shared/studio-candidates";

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
  lastInterviewAt: string | null;
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  conversationId: string | null;
  hasReport: boolean;
  /** 完整面试链接相对路径 / Relative interview link path. */
  interviewLink: string;
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
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  conversationId: string | null;
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
}

export interface PaginatedStudioInterviewRoundsResult {
  records: StudioInterviewRoundListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
