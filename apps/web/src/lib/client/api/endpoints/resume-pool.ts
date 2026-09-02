import type {
  JobDescriptionListRecord,
  JobDescriptionRecommendationResult,
} from "@app/shared/job-descriptions";
import type {
  PaginatedResumePoolResult,
  ResumePoolDetail,
  ResumePoolImportInput,
  ResumePoolImportResult,
  ResumePoolJobMatchResult,
  ResumePoolListRecord,
  ResumePoolUploaderOption,
} from "@app/shared/resume-pool";
import type { ResumePoolScope } from "@app/db-schema/schema";
import { rpc } from "@/lib/client/rpc";
import type { DedupMatchRecord } from "./studio-interviews";
import { apiFetch } from "../client";
import { rpcFetch } from "../rpc-fetch";

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
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"].$get({
      param: { slug },
      query: {
        ...options,
        limit: options.limit?.toString(),
        offset: options.offset?.toString(),
        scope,
      },
    }),
    "加载人才库失败",
  );
}

export function fetchResumePoolUploaders(slug: string): Promise<ResumePoolUploaderOption[]> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"].uploaders.$get({ param: { slug } }),
    "加载上传人列表失败",
  ).then((result) => result.records);
}

export function createResumePoolItem(
  slug: string,
  formData: FormData,
): Promise<ResumePoolListRecord> {
  return apiFetch<ResumePoolListRecord>(`/api/w/${slug}/studio/resume-pool`, {
    body: formData,
    method: "POST",
  });
}

export function fetchResumePoolItem(slug: string, id: string): Promise<ResumePoolDetail | null> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].$get({
      param: { id, slug },
    }),
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
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].review.$get({
      param: { id, slug },
    }),
    "加载简历详情失败",
    { allow404: true },
  );
}

export function bindResumePoolItem(
  slug: string,
  id: string,
  jobDescriptionId: string,
): Promise<ResumePoolDetail> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].bind.$post({
      json: { jobDescriptionId },
      param: { id, slug },
    }),
    "绑定岗位失败",
  );
}

export async function fetchPublishedResumePoolJobDescriptions(
  slug: string,
): Promise<JobDescriptionListRecord[]> {
  const payload = await rpcFetch(
    rpc.api.w[":slug"].studio["job-descriptions"].recruiting.$get({ param: { slug } }),
    "加载在招岗位列表失败",
  );
  return payload.records;
}

export function fetchResumePoolJobMatch(
  slug: string,
  id: string,
): Promise<ResumePoolJobMatchResult | null> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"]["job-match"].$get({
      param: { id, slug },
    }),
    "加载岗位匹配结果失败",
  );
}

export function fetchResumePoolJobRecommendations(
  slug: string,
  id: string,
  topN: number,
): Promise<JobDescriptionRecommendationResult> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].recommendations.$post({
      json: { topN },
      param: { id, slug },
    }),
    "加载岗位推荐失败",
  );
}

export function fetchResumePoolDuplicateMatches(
  slug: string,
  id: string,
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"]["duplicate-matches"].$get({
      param: { id, slug },
    }),
    "加载疑似重复简历失败",
  );
}

export function publishResumePoolItem(slug: string, id: string): Promise<ResumePoolListRecord> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].publish.$post({
      param: { id, slug },
    }),
    "推送到公共简历池失败",
  );
}

export function retryResumePoolItemParse(slug: string, id: string): Promise<{ status: "queued" }> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"]["retry-parse"].$post({
      param: { id, slug },
    }),
    "重新解析简历失败",
  );
}

export function importResumePoolItem(
  slug: string,
  id: string,
  input: ResumePoolImportInput,
): Promise<ResumePoolImportResult> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].import.$post({
      json: input,
      param: { id, slug },
    }),
    "入库失败",
  );
}

export async function deleteResumePoolItem(slug: string, id: string): Promise<void> {
  await rpcFetch(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].$delete({
      param: { id, slug },
    }),
    "删除简历失败",
  );
}
