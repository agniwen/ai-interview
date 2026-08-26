import type {
  StructuredResumeEvaluationV1,
  StructuredResumeGateStatus,
} from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeSummaryFields } from "@arc/shared/structured-resume-scoring";
import type { PaginatedResumeLibraryResult, ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { apiJson } from "./rpc-fetch";
import { apiUrl } from "./rpc";

export interface ResumeListParams {
  /** 创建人用户 id 列表（OR）。 */
  creatorIds?: string[];
  /** 关联岗位 id 列表（OR）。 */
  jobDescriptionIds?: string[];
  knownTotal?: number;
  page?: number;
  pageSize?: number;
  /** pipeline 阶段过滤（OR）。 */
  pipelineStages?: string[];
  search?: string;
  textFilters?: string;
  /** 技能筛选（后端 AND / 同时具备）。 */
  skills?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  structuredMaxScore?: number;
  structuredMinScore?: number;
}

export interface WorkspaceMemberOption {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

export interface RecruitingJobDescriptionOption {
  departmentName: string | null;
  evaluationMode: "legacy" | "structured";
  id: string;
  name: string;
}

export interface SkillSuggestion {
  count: number;
  skill: string;
}

/**
 * 招聘台简历列表（分页 / 关键词 / 排序 / 筛选）。
 * Maps to GET /api/w/:slug/studio/resumes
 */
export function fetchStudioResumes(
  slug: string,
  params: ResumeListParams = {},
): Promise<PaginatedResumeLibraryResult> {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    query.set("pageSize", String(params.pageSize));
  }
  if (params.knownTotal !== undefined) {
    query.set("knownTotal", String(params.knownTotal));
  }
  if (params.textFilters) {
    query.set("textFilters", params.textFilters);
  }
  if (params.search) {
    query.set("search", params.search);
  }
  if (params.creatorIds && params.creatorIds.length > 0) {
    query.set("creatorIds", params.creatorIds.join(","));
  }
  if (params.skills && params.skills.length > 0) {
    query.set("skills", params.skills.join(","));
  }
  if (params.jobDescriptionIds && params.jobDescriptionIds.length > 0) {
    query.set("jdIds", params.jobDescriptionIds.join(","));
  }
  if (params.pipelineStages && params.pipelineStages.length > 0) {
    query.set("pipelineStages", params.pipelineStages.join(","));
  }
  if (params.sortBy) {
    query.set("sortBy", params.sortBy);
  }
  if (params.sortOrder) {
    query.set("sortOrder", params.sortOrder);
  }
  if (params.structuredMinScore !== undefined) {
    query.set("structuredMinScore", String(params.structuredMinScore));
  }
  if (params.structuredMaxScore !== undefined) {
    query.set("structuredMaxScore", String(params.structuredMaxScore));
  }

  const qs = query.toString();
  const path = `/api/w/${encodeURIComponent(slug)}/studio/resumes${qs ? `?${qs}` : ""}`;
  return apiJson<PaginatedResumeLibraryResult>(apiUrl(path), "加载简历列表失败");
}

/**
 * 工作区成员（创建人筛选选项）。
 * GET /api/w/:slug/studio/workspace/members
 */
export function fetchWorkspaceMembers(slug: string): Promise<WorkspaceMemberOption[]> {
  const path = `/api/w/${encodeURIComponent(slug)}/studio/workspace/members`;
  return apiJson<{ records: WorkspaceMemberOption[] }>(apiUrl(path), "加载成员列表失败").then(
    (payload) => payload.records,
  );
}

/**
 * 在招岗位列表（岗位筛选选项）。
 * GET /api/w/:slug/studio/job-descriptions/recruiting
 */
export function fetchRecruitingJobDescriptions(
  slug: string,
): Promise<RecruitingJobDescriptionOption[]> {
  const path = `/api/w/${encodeURIComponent(slug)}/studio/job-descriptions/recruiting`;
  return apiJson<{ records: RecruitingJobDescriptionOption[] }>(
    apiUrl(path),
    "加载在招岗位列表失败",
  ).then((payload) => payload.records);
}

/**
 * 组织技能建议。
 * GET /api/w/:slug/studio/resumes/skill-suggestions
 */
export function fetchStudioResumeSkillSuggestions(
  slug: string,
  params: { limit?: number; prefix?: string } = {},
): Promise<SkillSuggestion[]> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) {
    query.set("limit", String(params.limit));
  }
  if (params.prefix) {
    query.set("prefix", params.prefix);
  }
  const qs = query.toString();
  const path = `/api/w/${encodeURIComponent(slug)}/studio/resumes/skill-suggestions${qs ? `?${qs}` : ""}`;
  return apiJson<{ records: SkillSuggestion[] }>(apiUrl(path), "加载技能建议失败").then(
    (payload) => payload.records,
  );
}

/**
 * 招聘台单条详情；不存在时返回 null。
 * GET /api/w/:slug/studio/resumes/:id
 */
export function fetchStudioResume(slug: string, id: string): Promise<ResumeLibraryDetail | null> {
  const path = `/api/w/${encodeURIComponent(slug)}/studio/resumes/${encodeURIComponent(id)}`;
  return apiJson<ResumeLibraryDetail | null>(apiUrl(path), "加载简历详情失败", {
    allow404: true,
  });
}

/**
 * 核实 / 纠正结构化评估硬性门槛。
 * PATCH /api/w/:slug/studio/resumes/:id/structured-evaluation/gates/:requirementId
 */
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
  const path = `/api/w/${encodeURIComponent(slug)}/studio/resumes/${encodeURIComponent(resumeId)}/structured-evaluation/gates/${encodeURIComponent(requirementId)}`;
  return apiJson(apiUrl(path), "更新门槛核实结果失败", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}
