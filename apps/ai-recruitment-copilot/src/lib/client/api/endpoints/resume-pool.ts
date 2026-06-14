import type {
  PaginatedResumePoolResult,
  ResumePoolImportInput,
  ResumePoolImportResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import { rpc } from "@/lib/client/rpc";
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

export function publishResumePoolItem(slug: string, id: string): Promise<ResumePoolListRecord> {
  return rpcFetch<ResumePoolListRecord>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].publish.$post({
      param: { id, slug },
    }),
    "推送到简历广场失败",
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
