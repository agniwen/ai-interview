import "client-only";

/**
 * Studio 后台「简历库」API。映射到 `/api/w/:slug/studio/resumes/*`。
 * 文件上传 (POST/PATCH 带 resume File) 由对话框组件直接用 fetch + FormData，
 * 不在本文件内（与 studio-interviews 同样的约定）。
 *
 * Resume library API — maps to `/api/w/:slug/studio/resumes/*`. File-upload
 * POST/PATCH stay on raw fetch+FormData inside their dialog components, same
 * convention as studio-interviews.
 */

import type { InterviewQuestion } from "@/lib/shared/interview/types";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@/lib/shared/studio-interview-rounds";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
} from "@/lib/shared/studio-resumes";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";
import type { DedupMatchRecord } from "./studio-interviews";

export interface ResumeListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * 拉取简历列表（支持分页 / 关键词 / 排序）。
 * Fetch the resume list (supports pagination / keyword / sorting).
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
        ...(params.search ? { search: params.search } : {}),
        ...(params.sortBy ? { sortBy: params.sortBy } : {}),
        ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
      },
    }),
    "加载简历列表失败",
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

/**
 * 按姓名/邮箱/电话查重，任一字段命中即返回。
 * Look up potential duplicates by name / email / phone (any one suffices).
 */
export function fetchResumeDedup(
  slug: string,
  input: { name: string | null; email: string | null; phone: string | null },
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio.resumes["dedup-check"].$post({ json: input, param: { slug } }),
    "查重失败",
  );
}

/**
 * 从简历库「发起 AI 面试」：把（可能被用户编辑过的）面试题写回该简历行，
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
