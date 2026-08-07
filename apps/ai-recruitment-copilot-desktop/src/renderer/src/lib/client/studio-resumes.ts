import type { PaginatedResumeLibraryResult } from "@arc/shared/studio-resumes";
import { apiJson } from "./rpc-fetch";
import { apiUrl } from "./rpc";

export interface ResumeListParams {
  knownTotal?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * 招聘台简历列表（分页 / 关键词 / 排序）。
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
  if (params.search) {
    query.set("search", params.search);
  }
  if (params.sortBy) {
    query.set("sortBy", params.sortBy);
  }
  if (params.sortOrder) {
    query.set("sortOrder", params.sortOrder);
  }

  const qs = query.toString();
  const path = `/api/w/${encodeURIComponent(slug)}/studio/resumes${qs ? `?${qs}` : ""}`;
  return apiJson<PaginatedResumeLibraryResult>(apiUrl(path), "加载简历列表失败");
}
