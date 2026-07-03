import type {
  PaginatedResumePoolResult,
  ResumePoolDetail,
  ResumePoolImportInput,
  ResumePoolImportResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import { rpc } from "@/lib/client/rpc";
import type { DedupMatchRecord } from "./studio-interviews";
import { apiFetch } from "../client";
import { rpcFetch } from "../rpc-fetch";

export function fetchResumePoolItems(
  slug: string,
  scope: ResumePoolScope,
): Promise<PaginatedResumePoolResult> {
  return rpcFetch<PaginatedResumePoolResult>(
    rpc.api.w[":slug"].studio["resume-pool"].$get({
      param: { slug },
      query: { scope },
    }),
    "加载简历广场失败",
  );
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
  return rpcFetch<ResumePoolDetail>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].$get({
      param: { id, slug },
    }),
    "加载简历详情失败",
    { allow404: true },
  );
}

export function fetchResumePoolDuplicateMatches(
  slug: string,
  id: string,
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"]["duplicate-matches"].$get({
      param: { id, slug },
    }),
    "加载疑似重复简历失败",
  );
}

export function publishResumePoolItem(slug: string, id: string): Promise<ResumePoolListRecord> {
  return rpcFetch<ResumePoolListRecord>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].publish.$post({
      param: { id, slug },
    }),
    "推送到公共简历池失败",
  );
}

export function importResumePoolItem(
  slug: string,
  id: string,
  input: ResumePoolImportInput,
): Promise<ResumePoolImportResult> {
  return rpcFetch<ResumePoolImportResult>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].import.$post({
      json: input,
      param: { id, slug },
    }),
    "入库失败",
  );
}

export async function deleteResumePoolItem(slug: string, id: string): Promise<void> {
  await rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].$delete({
      param: { id, slug },
    }),
    "删除简历失败",
  );
}
