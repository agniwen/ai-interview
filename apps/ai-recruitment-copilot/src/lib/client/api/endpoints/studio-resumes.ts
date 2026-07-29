/**
 * Studio 后台「招聘台」API。映射到 `/api/w/:slug/studio/resumes/*`。
 * 文件上传 (POST/PATCH 带 resume File) 由对话框组件直接用 fetch + FormData，
 * 不在本文件内（与 studio-interviews 同样的约定）。
 *
 * Resume library API — maps to `/api/w/:slug/studio/resumes/*`. File-upload
 * POST/PATCH stay on raw fetch+FormData inside their dialog components, same
 * convention as studio-interviews.
 */

import type { InterviewQuestion, ResumeProfile } from "@arc/db-schema/interview/types";
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
} from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeSummaryFields } from "@arc/shared/structured-resume-scoring";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";
import type { DedupMatchRecord } from "./studio-interviews";

export interface ResumeListParams {
  /** 已知的列表总数；后续分页用于跳过重复 COUNT。 */
  knownTotal?: number;
  page?: number;
  pageSize?: number;
  search?: string;
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
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  structuredMaxScore?: number;
  structuredMinScore?: number;
}

/**
 * 拉取简历列表（支持分页 / 关键词 / 排序 / 技能 / 关联岗位筛选）。
 * Fetch the resume list (pagination / keyword / sort / skills / JD filters).
 */
export function fetchStudioResumes(
  slug: string,
  params: ResumeListParams = {},
): Promise<PaginatedResumeLibraryResult> {
  return rpcFetch<PaginatedResumeLibraryResult>(
    rpc.api.w[":slug"].studio.resumes.$get({
      param: { slug },
      query: {
        ...(params.page === undefined ? {} : { page: String(params.page) }),
        ...(params.pageSize === undefined ? {} : { pageSize: String(params.pageSize) }),
        ...(params.knownTotal === undefined ? {} : { knownTotal: String(params.knownTotal) }),
        ...(params.search ? { search: params.search } : {}),
        ...(params.creatorIds && params.creatorIds.length > 0
          ? { creatorIds: params.creatorIds.join(",") }
          : {}),
        ...(params.skills && params.skills.length > 0 ? { skills: params.skills.join(",") } : {}),
        ...(params.jobDescriptionIds && params.jobDescriptionIds.length > 0
          ? { jdIds: params.jobDescriptionIds.join(",") }
          : {}),
        ...(params.pipelineStages && params.pipelineStages.length > 0
          ? { pipelineStages: params.pipelineStages.join(",") }
          : {}),
        ...(params.outcomes && params.outcomes.length > 0
          ? { outcomes: params.outcomes.join(",") }
          : {}),
        ...(params.sortBy ? { sortBy: params.sortBy } : {}),
        ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
        ...(params.structuredMaxScore === undefined
          ? {}
          : { structuredMaxScore: String(params.structuredMaxScore) }),
        ...(params.structuredMinScore === undefined
          ? {}
          : { structuredMinScore: String(params.structuredMinScore) }),
      },
    }),
    "加载简历列表失败",
  );
}

export function fetchStudioResumeMetrics(slug: string): Promise<ResumeLibraryMetrics> {
  return rpcFetch<ResumeLibraryMetrics>(
    rpc.api.w[":slug"].studio.resumes.metrics.$get({
      param: { slug },
    }),
    "加载招聘指标失败",
  );
}

export interface SkillSuggestion {
  skill: string;
  count: number;
}

/**
 * 拉取组织内的技能建议（按候选人计数倒序）。
 * Fetch skill suggestions for the org, sorted by candidate count desc.
 */
export function fetchStudioResumeSkillSuggestions(
  slug: string,
  params: { prefix?: string; limit?: number } = {},
): Promise<{ records: SkillSuggestion[] }> {
  return rpcFetch<{ records: SkillSuggestion[] }>(
    rpc.api.w[":slug"].studio.resumes["skill-suggestions"].$get({
      param: { slug },
      query: {
        ...(params.prefix ? { prefix: params.prefix } : {}),
        ...(params.limit === undefined ? {} : { limit: String(params.limit) }),
      },
    }),
    "加载技能建议失败",
  );
}

/**
 * 拉取单条简历详情；不存在时返回 null。
 * Fetch a single resume by id; returns null when not found.
 */
export function fetchStudioResume(slug: string, id: string): Promise<ResumeLibraryDetail | null> {
  return rpcFetch<ResumeLibraryDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"].$get({ param: { id, slug } }),
    "加载简历详情失败",
    { allow404: true },
  );
}

/**
 * Lightweight identity update for the resume detail panel (table columns + resumeProfile JSON).
 */
export function updateStudioResumeIdentity(
  slug: string,
  id: string,
  input: ResumeIdentityUpdateInput,
): Promise<ResumeLibraryDetail> {
  return rpcFetch<ResumeLibraryDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"].identity.$patch({
      json: input,
      param: { id, slug },
    }),
    "保存候选人信息失败",
  );
}

export function fetchStudioResumeDuplicateMatches(
  slug: string,
  id: string,
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio.resumes[":id"]["duplicate-matches"].$get({
      param: { id, slug },
    }),
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
  return rpcFetch<CandidateTimelineResponse>(
    rpc.api.w[":slug"].studio.resumes[":id"].timeline.$get({ param: { id, slug } }),
    "加载候选人时间线失败",
    { allow404: true },
  );
}

export function fetchStudioResumeReview(
  slug: string,
  id: string,
): Promise<ResumeLibraryDetail | null> {
  return rpcFetch<ResumeLibraryDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"].review.$get({ param: { id, slug } }),
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
  return rpcFetch(
    rpc.api.w[":slug"].studio.resumes[":id"]["structured-evaluation"].gates[
      ":requirementId"
    ].$patch({
      json: input,
      param: {
        id: resumeId,
        requirementId,
        slug,
      },
    }),
    "更新门槛核实结果失败",
  );
}

export function fetchStudioResumeReviewTimeline(
  slug: string,
  id: string,
): Promise<CandidateTimelineResponse | null> {
  return rpcFetch<CandidateTimelineResponse>(
    rpc.api.w[":slug"].studio.resumes[":id"].review.timeline.$get({ param: { id, slug } }),
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
  return rpcFetch<StudioInterviewRoundListRecord[]>(
    rpc.api.w[":slug"].studio.resumes[":id"].rounds.$get({
      param: { id: candidateId, slug },
    }),
    "加载面试轮次失败",
  );
}

export function fetchStudioResumeReviewRounds(
  slug: string,
  candidateId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  return rpcFetch<StudioInterviewRoundListRecord[]>(
    rpc.api.w[":slug"].studio.resumes[":id"].review.rounds.$get({
      param: { id: candidateId, slug },
    }),
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
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio.resumes["dedup-check"].$post(
      { json: input, param: { slug } },
      { init: { signal: options?.signal } },
    ),
    "查重失败",
  );
}

/**
 * 从招聘台「发起 AI 面试」：把（可能被用户编辑过的）面试题写回该简历行，
 * 并创建一条默认排期。返回新建轮次的详情，供调用方直接打开面试详情弹窗。
 *
 * Launch an AI interview from a resume library row — writes the questions
 * onto the existing row and creates a default schedule entry. Returns the
 * fresh round detail so callers can immediately open the detail dialog.
 */
export function launchInterviewFromResume(
  slug: string,
  id: string,
  interviewQuestions: InterviewQuestion[],
): Promise<StudioInterviewRoundDetail> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"]["launch-interview"].$post({
      json: { interviewQuestions },
      param: { id, slug },
    }),
    "发起 AI 面试失败",
  );
}

export function submitResumeReviewEvaluation(
  slug: string,
  id: string,
  status: ResumeEvaluationStatus,
): Promise<ResumeLibraryDetail> {
  return rpcFetch<ResumeLibraryDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"].review.evaluation.$post({
      json: { status },
      param: { id, slug },
    }),
    "提交评估失败",
  );
}

export function updateResumeEvaluationStatus(
  slug: string,
  id: string,
  status: ResumeEvaluationStatus | null,
): Promise<ResumeLibraryDetail> {
  return rpcFetch<ResumeLibraryDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"].evaluation.$patch({
      json: { status },
      param: { id, slug },
    }),
    "更新评估状态失败",
  );
}

/**
 * 删除单条简历记录。
 * Delete a single resume record.
 */
export async function deleteStudioResume(slug: string, id: string): Promise<void> {
  await rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio.resumes[":id"].$delete({ param: { id, slug } }),
    "删除简历失败",
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
  const data = await rpcFetch<{ deletedCount: number; success: boolean }>(
    rpc.api.w[":slug"].studio.resumes["bulk-delete"].$post({
      json: { ids: ids as [string, ...string[]] },
      param: { slug },
    }),
    "批量删除失败",
  );
  return { deleted: data.deletedCount };
}
