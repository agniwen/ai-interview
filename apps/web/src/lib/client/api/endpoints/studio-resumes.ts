import {
  bulkDeleteWorkspaceResumes,
  correctWorkspaceResumeStructuredGate,
  deleteWorkspaceResume,
  findWorkspaceResumeDuplicates,
  forceWorkspaceResumeReparse,
  getWorkspaceResume,
  getWorkspaceResumeMetrics,
  getWorkspaceResumeReview,
  getWorkspaceResumeReviewTimeline,
  getWorkspaceResumeTimeline,
  launchWorkspaceResumeInterview,
  listWorkspaceResumeDuplicateMatches,
  listWorkspaceResumeMeetings,
  listWorkspaceResumeReviewRounds,
  listWorkspaceResumeRounds,
  listWorkspaceResumeSkillSuggestions,
  listWorkspaceResumes,
  reassessWorkspaceResume,
  retryWorkspaceResumeParse,
  submitWorkspaceResumeReviewEvaluation,
  updateWorkspaceResumeEvaluation,
  updateWorkspaceResumeIdentity,
  updateWorkspaceResumeInterviewQuestions,
} from "@/lib/client/backend-api";

/**
 * Studio 后台「招聘台」API。映射到 `/workspaces/:workspaceSlug/candidates/resumes/*`。
 * 文件上传 (POST/PATCH 带 resume File) 由对话框组件直接用 fetch + FormData，
 * 不在本文件内（与 studio-interviews 同样的约定）。
 *
 * Resume library API — maps to `/workspaces/:workspaceSlug/candidates/resumes/*`. File-upload
 * POST/PATCH stay on raw fetch+FormData inside their dialog components, same
 * convention as studio-interviews.
 */

import type { InterviewQuestion, ResumeProfile } from "@arc/db-schema/interview/types";
import type { AiInterviewLinkValidity } from "@arc/shared/interview/ai-interview-invitation";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@arc/shared/studio-interview-rounds";
import type {
  CandidateTimelineResponse,
  PaginatedResumeLibraryResult,
  ResumeEvaluationStatus,
  ResumeIdentityUpdateInput,
  ResumeLibraryDetail,
  ResumeLibraryMetrics,
} from "@arc/shared/studio-resumes";
import type {
  StructuredResumeEvaluationV1,
  StructuredResumeGateStatus,
  StructuredResumeGrade,
} from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeSummaryFields } from "@arc/shared/structured-resume-scoring";

import { apiRequest } from "../rpc-fetch";
import type { DedupMatchRecord } from "./studio-interviews";

export interface ResumeListParams {
  /** 北京时间自然日，包含起止日期，格式 YYYY-MM-DD。 */
  createdFrom?: string;
  createdTo?: string;
  /** 已知的列表总数；后续分页用于跳过重复 COUNT。 */
  knownTotal?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  textFilters?: string;
  /** 创建人用户 id 列表。Creator user id filter (OR semantics). */
  creatorIds?: string[];
  /** 任一匹配的技能（CSV-encoded on the wire）。Any-of skill filter. */
  skills?: string[];
  /** 关联岗位 id 列表。 Job-description id filter (OR semantics). */
  jobDescriptionIds?: string[];
  /** pipeline 阶段过滤（任一匹配）。Pipeline stage filter (OR semantics). */
  pipelineStages?: string[];
  /** 候选人最终结论过滤（任一匹配）。Outcome filter (OR semantics). */
  outcomes?: string[];
  recommendationLevels?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  structuredMaxScore?: number;
  structuredMinScore?: number;
}

interface ResumeListQuery {
  createdFrom?: string;
  createdTo?: string;
  creatorIds?: string;
  jdIds?: string;
  knownTotal?: number;
  outcomes?: string;
  recommendationLevels?: string;
  page?: number;
  pageSize?: number;
  pipelineStages?: string;
  search?: string;
  textFilters?: string;
  skills?: string;
  sortBy?: "candidateName" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  structuredMaxScore?: number;
  structuredMinScore?: number;
}

function buildResumeScalarQuery(params: ResumeListParams): ResumeListQuery {
  const query: ResumeListQuery = {
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  };
  if (params.knownTotal !== undefined) {
    query.knownTotal = params.knownTotal;
  }
  if (params.page !== undefined) {
    query.page = params.page;
  }
  if (params.pageSize !== undefined) {
    query.pageSize = params.pageSize;
  }
  if (params.textFilters) {
    query.textFilters = params.textFilters;
  }
  if (params.search) {
    query.search = params.search;
  }
  if (
    params.sortBy === "candidateName" ||
    params.sortBy === "createdAt" ||
    params.sortBy === "updatedAt"
  ) {
    query.sortBy = params.sortBy;
  }
  if (params.sortOrder) {
    query.sortOrder = params.sortOrder;
  }
  if (params.structuredMaxScore !== undefined) {
    query.structuredMaxScore = params.structuredMaxScore;
  }
  if (params.structuredMinScore !== undefined) {
    query.structuredMinScore = params.structuredMinScore;
  }
  return query;
}

function buildResumeListQuery(params: ResumeListParams): ResumeListQuery {
  const query = buildResumeScalarQuery(params);
  if (params.creatorIds?.length) {
    query.creatorIds = params.creatorIds.join(",");
  }
  if (params.jobDescriptionIds?.length) {
    query.jdIds = params.jobDescriptionIds.join(",");
  }
  if (params.outcomes?.length) {
    query.outcomes = params.outcomes.join(",");
  }
  if (params.pipelineStages?.length) {
    query.pipelineStages = params.pipelineStages.join(",");
  }
  if (params.recommendationLevels?.length) {
    query.recommendationLevels = params.recommendationLevels.join(",");
  }
  if (params.skills?.length) {
    query.skills = params.skills.join(",");
  }
  return query;
}

/**
 * 拉取简历列表（支持分页 / 关键词 / 排序 / 技能 / 关联岗位筛选）。
 * Fetch the resume list (pagination / keyword / sort / skills / JD filters).
 */
export function fetchStudioResumes(
  slug: string,
  params: ResumeListParams = {},
): Promise<PaginatedResumeLibraryResult> {
  return apiRequest(
    listWorkspaceResumes({ path: { workspaceSlug: slug }, query: buildResumeListQuery(params) }),

    "加载简历列表失败",
  );
}

export function fetchStudioResumeMetrics(
  slug: string,
  scope: "team" | "personal" = "team",
): Promise<ResumeLibraryMetrics> {
  return apiRequest(
    getWorkspaceResumeMetrics({ path: { workspaceSlug: slug }, query: { scope } }),

    "加载招聘指标失败",
  );
}

export interface SkillSuggestion {
  skill: string;
  count: number;
}

interface SkillSuggestionQuery {
  limit?: number;
  prefix?: string;
}

/**
 * 拉取组织内的技能建议（按候选人计数倒序）。
 * Fetch skill suggestions for the org, sorted by candidate count desc.
 */
export function fetchStudioResumeSkillSuggestions(
  slug: string,
  params: { prefix?: string; limit?: number } = {},
): Promise<{ records: SkillSuggestion[] }> {
  const query: SkillSuggestionQuery = {};
  if (params.prefix) {
    query.prefix = params.prefix;
  }
  if (params.limit !== undefined) {
    query.limit = params.limit;
  }
  return apiRequest(
    listWorkspaceResumeSkillSuggestions({ path: { workspaceSlug: slug }, query }),

    "加载技能建议失败",
  );
}

/**
 * 拉取单条简历详情；不存在时返回 null。
 * Fetch a single resume by id; returns null when not found.
 */
export function fetchStudioResume(slug: string, id: string): Promise<ResumeLibraryDetail | null> {
  return apiRequest(getWorkspaceResume({ path: { id, workspaceSlug: slug } }), "加载简历详情失败", {
    allow404: true,
  });
}

export function fetchStudioResumeMeetings(slug: string, id: string): Promise<MeetingLibraryItem[]> {
  return apiRequest(
    listWorkspaceResumeMeetings({ path: { id, workspaceSlug: slug } }),
    "加载候选人关联会议失败",
  ).then((payload) => payload.records);
}

/**
 * Lightweight identity update for the resume detail panel (table columns + resumeProfile JSON).
 */
export function updateStudioResumeIdentity(
  slug: string,
  id: string,
  input: ResumeIdentityUpdateInput,
): Promise<ResumeLibraryDetail> {
  return apiRequest(
    updateWorkspaceResumeIdentity({ body: input, path: { id, workspaceSlug: slug } }),

    "保存候选人信息失败",
  );
}

export function fetchStudioResumeDuplicateMatches(
  slug: string,
  id: string,
): Promise<{ matches: DedupMatchRecord[] }> {
  return apiRequest(
    listWorkspaceResumeDuplicateMatches({ path: { id, workspaceSlug: slug } }),

    "加载疑似重复简历失败",
  );
}

/**
 * 拉取候选人时间线，聚合阶段流转、AI/真人面试、表单、邮件、通知和 Offer 事件。
 * Fetch a candidate timeline aggregating stage, interview, form, email,
 * notification, and offer events.
 */
export function fetchStudioResumeTimeline(
  slug: string,
  id: string,
): Promise<CandidateTimelineResponse | null> {
  return apiRequest(
    getWorkspaceResumeTimeline({ path: { id, workspaceSlug: slug } }),
    "加载候选人时间线失败",
    { allow404: true },
  );
}

export function fetchStudioResumeReview(
  slug: string,
  id: string,
): Promise<ResumeLibraryDetail | null> {
  return apiRequest(
    getWorkspaceResumeReview({ path: { id, workspaceSlug: slug } }),
    "加载简历详情失败",
    { allow404: true },
  );
}

export function correctStructuredResumeGate(
  slug: string,
  resumeId: string,
  requirementId: string,
  input: {
    correctedStatus: StructuredResumeGateStatus | null;
    expectedRunId: string;
  },
): Promise<{
  evaluation: StructuredResumeEvaluationV1;
  status: "updated";
  summaries: StructuredResumeSummaryFields;
}> {
  return apiRequest(
    correctWorkspaceResumeStructuredGate({
      body: input,
      path: {
        id: resumeId,
        requirementId,
        workspaceSlug: slug,
      },
    }),

    "更新门槛核实结果失败",
  );
}

export function fetchStudioResumeReviewTimeline(
  slug: string,
  id: string,
): Promise<CandidateTimelineResponse | null> {
  return apiRequest(
    getWorkspaceResumeReviewTimeline({ path: { id, workspaceSlug: slug } }),
    "加载候选人时间线失败",
    { allow404: true },
  );
}

/**
 * 拉取候选人的所有 AI 面试轮次（按 sortOrder 升序）。
 * Fetch all AI interview rounds for a candidate (sortOrder asc).
 */
export function fetchStudioResumeRounds(
  slug: string,
  candidateId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  return apiRequest(
    listWorkspaceResumeRounds({ path: { id: candidateId, workspaceSlug: slug } }),

    "加载面试轮次失败",
  );
}

export function fetchStudioResumeReviewRounds(
  slug: string,
  candidateId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  return apiRequest(
    listWorkspaceResumeReviewRounds({ path: { id: candidateId, workspaceSlug: slug } }),

    "加载面试轮次失败",
  );
}

/**
 * 基于解析后的简历画像做语义查重。
 * Look up potential duplicates through semantic resume similarity.
 */
export function fetchResumeDedup(
  slug: string,
  input: {
    name: string | null;
    email: string | null;
    phone: string | null;
    resumeProfile?: ResumeProfile | null;
  },
  options?: { signal?: AbortSignal },
): Promise<{ matches: DedupMatchRecord[] }> {
  return apiRequest(
    findWorkspaceResumeDuplicates({
      body: input,
      path: { workspaceSlug: slug },
      signal: options?.signal,
    }),

    "查重失败",
  );
}

/**
 * 从招聘台「发起 AI 面试」：创建一条默认排期。候选人定制题仅供真人
 * 面试官参考，不会写进 AI 面试上下文。
 *
 * Launch an AI interview from a resume library row and create a default
 * schedule entry. Candidate-specific questions stay out of AI context. Returns the
 * fresh round detail so callers can immediately open the detail dialog.
 */
export function launchInterviewFromResume(
  slug: string,
  id: string,
  options: {
    candidateInviteValidity: AiInterviewLinkValidity;
    structuredEvaluationConfirmation?: {
      gateStatus: StructuredResumeGateStatus;
      grade: StructuredResumeGrade;
      runId: string;
    } | null;
  },
): Promise<StudioInterviewRoundDetail> {
  return apiRequest(
    launchWorkspaceResumeInterview({ body: options, path: { id, workspaceSlug: slug } }),

    "发起 AI 面试失败",
  );
}

export function submitResumeReviewEvaluation(
  slug: string,
  id: string,
  status: ResumeEvaluationStatus,
): Promise<ResumeLibraryDetail> {
  return apiRequest(
    submitWorkspaceResumeReviewEvaluation({ body: { status }, path: { id, workspaceSlug: slug } }),

    "提交评估失败",
  );
}

export function updateResumeEvaluationStatus(
  slug: string,
  id: string,
  status: ResumeEvaluationStatus | null,
): Promise<ResumeLibraryDetail> {
  return apiRequest(
    updateWorkspaceResumeEvaluation({ body: { status }, path: { id, workspaceSlug: slug } }),

    "更新评估状态失败",
  );
}

export function reassessStudioResume(slug: string, id: string): Promise<ResumeLibraryDetail> {
  return apiRequest(
    reassessWorkspaceResume({ path: { id, workspaceSlug: slug } }),

    "重新评价失败",
  );
}

export function updateStudioResumeInterviewQuestions(
  slug: string,
  id: string,
  interviewQuestions: InterviewQuestion[],
): Promise<{ interviewQuestions: InterviewQuestion[] }> {
  return apiRequest(
    updateWorkspaceResumeInterviewQuestions({
      body: { interviewQuestions },
      path: { id, workspaceSlug: slug },
    }),

    "保存推荐问题失败",
  );
}

/**
 * 删除单条简历记录。
 * Delete a single resume record.
 */
export async function deleteStudioResume(slug: string, id: string): Promise<void> {
  await apiRequest(deleteWorkspaceResume({ path: { id, workspaceSlug: slug } }), "删除简历失败");
}

export function retryStudioResumeParse(slug: string, id: string): Promise<{ status: "queued" }> {
  return apiRequest(
    retryWorkspaceResumeParse({ path: { id, workspaceSlug: slug } }),

    "重新解析简历失败",
  );
}

/** Admin force reparse: re-run async parse from storage, bypassing parse cache. */
export function forceStudioResumeReparse(slug: string, id: string): Promise<{ status: "queued" }> {
  return apiRequest(
    forceWorkspaceResumeReparse({ path: { id, workspaceSlug: slug } }),

    "强制重新解析失败",
  );
}

/**
 * 批量删除简历记录。
 * Bulk-delete resume records.
 */
export async function bulkDeleteStudioResumes(
  slug: string,
  ids: string[],
): Promise<{ deleted: number }> {
  const [firstId, ...remainingIds] = ids;
  if (!firstId) {
    throw new Error("请至少选择一条简历记录");
  }
  const data = await apiRequest(
    bulkDeleteWorkspaceResumes({
      body: { ids: [firstId, ...remainingIds] },
      path: { workspaceSlug: slug },
    }),

    "批量删除失败",
  );
  return { deleted: data.deletedCount };
}
