import {
  bindWorkspaceResumePoolItem,
  deleteWorkspaceResumePoolItem,
  getWorkspaceResumePoolItem,
  getWorkspaceResumePoolJobMatch,
  getWorkspaceResumePoolReview,
  importWorkspaceResumePoolItem,
  listRecruitingWorkspaceJobDescriptions,
  listWorkspaceResumePool,
  listWorkspaceResumePoolDuplicateMatches,
  listWorkspaceResumePoolUploaders,
  publishWorkspaceResumePoolItem,
  recommendWorkspaceResumePoolJobs,
  retryWorkspaceResumePoolParse,
} from "@/lib/client/backend-api";
import type {
  JobDescriptionListRecord,
  JobDescriptionRecommendationResult,
} from "@arc/shared/job-descriptions";
import type {
  PaginatedResumePoolResult,
  ResumePoolDetail,
  ResumePoolImportInput,
  ResumePoolImportResult,
  ResumePoolJobMatchResult,
  ResumePoolListRecord,
  ResumePoolUploaderOption,
} from "@arc/shared/resume-pool";
import type { ResumePoolScope } from "@arc/db-schema/schema";

import type { DedupMatchRecord } from "./studio-interviews";
import { apiFetch } from "../client";
import { apiRequest } from "../rpc-fetch";

export function fetchResumePoolItems(
  slug: string,
  scope: ResumePoolScope,
  options: {
    createdFrom?: string;
    createdTo?: string;
    importStatus?: "imported" | "not_imported";
    limit?: number;
    offset?: number;
    search?: string;
    textFilters?: string;
    sortBy?: "candidateName" | "createdAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
    sourceType?: "all" | "non_referral" | "referral";
    uploaderId?: string;
    uploaderIds?: string;
  } = {},
): Promise<PaginatedResumePoolResult> {
  return apiRequest(
    listWorkspaceResumePool({
      path: { workspaceSlug: slug },
      query: {
        ...options,
        limit: options.limit,
        offset: options.offset,
        scope,
      },
    }),

    "加载人才库失败",
  );
}

export function fetchResumePoolUploaders(slug: string): Promise<ResumePoolUploaderOption[]> {
  return apiRequest(
    listWorkspaceResumePoolUploaders({ path: { workspaceSlug: slug } }),
    "加载上传人列表失败",
  ).then((result) => result.records);
}

export function createResumePoolItem(
  slug: string,
  formData: FormData,
): Promise<ResumePoolListRecord> {
  return apiFetch<ResumePoolListRecord>(`/workspaces/${slug}/candidates/intake/resume-pool`, {
    body: formData,
    method: "POST",
  });
}

export function fetchResumePoolItem(slug: string, id: string): Promise<ResumePoolDetail | null> {
  return apiRequest(
    getWorkspaceResumePoolItem({ path: { id, workspaceSlug: slug } }),

    "加载简历详情失败",
    { allow404: true },
  );
}

/**
 * 拉取人才库简历详情（同工作区成员即可读，忽略 resumePool 读权限与可见范围配置）。
 * 仅供疑似重复简历对照弹窗使用 —— 查重查看忽略权限配置（产品决策）。
 * Permission-free pool detail used by the duplicate-resume comparison dialog;
 * mirrors GET /:id/review semantics (workspace membership only).
 */
export function fetchResumePoolItemReview(
  slug: string,
  id: string,
): Promise<ResumePoolDetail | null> {
  return apiRequest(
    getWorkspaceResumePoolReview({ path: { id, workspaceSlug: slug } }),

    "加载简历详情失败",
    { allow404: true },
  );
}

export function bindResumePoolItem(
  slug: string,
  id: string,
  jobDescriptionId: string,
): Promise<ResumePoolDetail> {
  return apiRequest(
    bindWorkspaceResumePoolItem({ body: { jobDescriptionId }, path: { id, workspaceSlug: slug } }),

    "绑定岗位失败",
  );
}

export async function fetchPublishedResumePoolJobDescriptions(
  slug: string,
): Promise<JobDescriptionListRecord[]> {
  const payload = await apiRequest(
    listRecruitingWorkspaceJobDescriptions({ path: { workspaceSlug: slug } }),
    "加载在招岗位列表失败",
  );
  return payload.records;
}

export function fetchResumePoolJobMatch(
  slug: string,
  id: string,
): Promise<ResumePoolJobMatchResult | null> {
  return apiRequest(
    getWorkspaceResumePoolJobMatch({ path: { id, workspaceSlug: slug } }),

    "加载岗位匹配结果失败",
  );
}

export function fetchResumePoolJobRecommendations(
  slug: string,
  id: string,
  topN: number,
): Promise<JobDescriptionRecommendationResult> {
  return apiRequest(
    recommendWorkspaceResumePoolJobs({ body: { topN }, path: { id, workspaceSlug: slug } }),

    "加载岗位推荐失败",
  );
}

export function fetchResumePoolDuplicateMatches(
  slug: string,
  id: string,
): Promise<{ matches: DedupMatchRecord[] }> {
  return apiRequest(
    listWorkspaceResumePoolDuplicateMatches({ path: { id, workspaceSlug: slug } }),

    "加载疑似重复简历失败",
  );
}

export function publishResumePoolItem(slug: string, id: string): Promise<ResumePoolListRecord> {
  return apiRequest(
    publishWorkspaceResumePoolItem({ path: { id, workspaceSlug: slug } }),

    "推送到公共简历池失败",
  );
}

export function retryResumePoolItemParse(slug: string, id: string): Promise<{ status: "queued" }> {
  return apiRequest(
    retryWorkspaceResumePoolParse({ path: { id, workspaceSlug: slug } }),

    "重新解析简历失败",
  );
}

export function importResumePoolItem(
  slug: string,
  id: string,
  input: ResumePoolImportInput,
): Promise<ResumePoolImportResult> {
  return apiRequest(
    importWorkspaceResumePoolItem({ body: input, path: { id, workspaceSlug: slug } }),

    "入库失败",
  );
}

export async function deleteResumePoolItem(slug: string, id: string): Promise<void> {
  await apiRequest(
    deleteWorkspaceResumePoolItem({ path: { id, workspaceSlug: slug } }),

    "删除简历失败",
  );
}
