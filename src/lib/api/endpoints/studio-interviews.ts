/**
 * Studio 后台「面试管理」相关 API。
 * Studio admin "interview management" API.
 *
 * 这一组方法对应 `/api/studio/interviews/*` 路由族。JSON 端点全部已迁到
 * Hono RPC（{@link rpc}），错误以 {@link ApiError} 抛出，404 在适用处会被
 * 静默为 null。文件上传 (POST/PATCH 带 resume File) 仍在 dialog 组件中
 * 直接走 fetch + FormData，不在此文件内。
 *
 * Maps to the `/api/studio/interviews/*` route family. JSON endpoints now
 * use Hono RPC under the hood; errors raise {@link ApiError}, and 404s
 * become `null` where applicable. File-upload POST/PATCH stay on raw
 * fetch+FormData inside their dialog components.
 */

import type { CandidateFormSubmissionWithSnapshot } from "@/lib/candidate-forms";
import type { StudioInterviewConversationReport } from "@/lib/interview-session";
import type {
  StudioInterviewListRecord,
  StudioInterviewRecord,
  StudioInterviewStatus,
} from "@/lib/studio-interviews";
import { rpc } from "@/lib/rpc";
import { ApiError } from "../errors";

/**
 * 身份维度查重命中字段。
 * Identity-dedup matched-field keys.
 */
export type DedupMatchedField = "name" | "email" | "phone";

/**
 * 身份维度查重单条命中。
 * A single identity-dedup match entry.
 */
export interface DedupMatchRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  status: StudioInterviewStatus;
  createdAt: string;
  matchedFields: DedupMatchedField[];
}

/**
 * 列表分页参数。
 * List pagination / filter parameters.
 */
export interface StudioInterviewListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export interface StudioInterviewListResponse {
  records: StudioInterviewListRecord[];
  total: number;
}

// 中文：通用响应解码 — 把 hc 的 Response-like 返回值转成 throw / value 模式。
// English: shared response decoder — turn hc's Response-like return into throw/value.
async function decode<T>(res: Response, errorFallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : null) ?? errorFallback;
    throw new ApiError(message, { payload: body, status: res.status });
  }
  return (await res.json()) as T;
}

/**
 * 拉取面试列表（支持分页 / 关键词 / 状态筛选）。
 * Fetch the interview list (supports pagination / keyword / status filtering).
 */
export async function fetchStudioInterviews(
  params: StudioInterviewListParams = {},
): Promise<StudioInterviewListResponse> {
  const res = await rpc.api.studio.interviews.$get({
    query: {
      ...(params.page === undefined ? {} : { page: String(params.page) }),
      ...(params.pageSize === undefined ? {} : { pageSize: String(params.pageSize) }),
      ...(params.search ? { search: params.search } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
  });
  return decode<StudioInterviewListResponse>(res, "加载面试列表失败");
}

/**
 * 拉取列表概览数据（按状态聚合的计数等）。
 * Fetch the list summary (status counts and other aggregates).
 */
export async function fetchStudioInterviewSummary(): Promise<Record<string, unknown>> {
  const res = await rpc.api.studio.interviews.summary.$get();
  return decode<Record<string, unknown>>(res, "加载概览失败");
}

/**
 * 按姓名/邮箱/电话查重，任一字段命中即返回。
 * Look up potential duplicates by name / email / phone (any one suffices).
 */
export async function fetchInterviewDedup(input: {
  name: string | null;
  email: string | null;
  phone: string | null;
}): Promise<{ matches: DedupMatchRecord[] }> {
  const res = await rpc.api.studio.interviews["dedup-check"].$post({ json: input });
  return decode<{ matches: DedupMatchRecord[] }>(res, "查重失败");
}

/**
 * 拉取单条面试详情；不存在时返回 null。
 * Fetch a single interview by id; returns null when not found.
 */
export async function fetchStudioInterview(id: string): Promise<StudioInterviewRecord | null> {
  const res = await rpc.api.studio.interviews[":id"].$get({ param: { id } });
  if (res.status === 404) {
    return null;
  }
  return decode<StudioInterviewRecord>(res, "加载面试详情失败");
}

/**
 * 拉取面试报告列表（按时间倒序）。
 * Fetch the interview reports (newest first).
 */
export async function fetchStudioInterviewReports(
  id: string,
): Promise<StudioInterviewConversationReport[]> {
  const res = await rpc.api.studio.interviews[":id"].reports.$get({ param: { id } });
  return decode<StudioInterviewConversationReport[]>(res, "加载面试报告失败");
}

/**
 * 获取某轮录像的 S3 预签名播放 URL (10 分钟有效).
 * Fetch a 10-min presigned URL for the round's recording mp4.
 */
export async function fetchStudioInterviewRecordingUrl(
  id: string,
  conversationId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const res = await rpc.api.studio.interviews[":id"].recordings[":conversationId"].$get({
    param: { conversationId, id },
  });
  return decode<{ url: string; expiresInSeconds: number }>(res, "加载录像链接失败");
}

/**
 * 拉取面试关联的表单回答（按提交时间倒序）。
 * Fetch the candidate form submissions for an interview (newest first).
 */
export async function fetchStudioInterviewFormSubmissions(
  id: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const res = await rpc.api.studio.interviews[":id"]["form-submissions"].$get({
    param: { id },
  });
  const data = await decode<{ submissions: CandidateFormSubmissionWithSnapshot[] }>(
    res,
    "加载面试表单填写失败",
  );
  return data.submissions;
}

/**
 * 删除某次面试表单回答（重置候选人填写）。
 * Delete a candidate form submission (resets the candidate's fill).
 */
export async function deleteStudioInterviewFormSubmission(
  interviewId: string,
  submissionId: string,
): Promise<{ success: boolean }> {
  const res = await rpc.api.studio.interviews[":id"]["form-submissions"][":submissionId"].$delete({
    param: { id: interviewId, submissionId },
  });
  return decode<{ success: boolean }>(res, "删除答卷失败");
}

/**
 * 重置一轮面试为「待开始」状态。
 * Reset a single interview round back to the "pending" state.
 */
export async function resetStudioInterviewRound(
  interviewId: string,
  roundId: string,
): Promise<StudioInterviewRecord> {
  const res = await rpc.api.studio.interviews[":id"].rounds[":roundId"].reset.$post({
    param: { id: interviewId, roundId },
  });
  return decode<StudioInterviewRecord>(res, "重置轮次失败");
}

/**
 * 切换单轮面试的"允许面试者文本输入"开关。
 * Toggle the per-round "allow candidate text input" flag.
 */
export async function updateStudioInterviewRound(
  interviewId: string,
  roundId: string,
  payload: { allowTextInput: boolean },
): Promise<StudioInterviewRecord> {
  const res = await rpc.api.studio.interviews[":id"].rounds[":roundId"].$patch({
    json: payload,
    param: { id: interviewId, roundId },
  });
  return decode<StudioInterviewRecord>(res, "更新轮次设置失败");
}

/**
 * 删除单条面试记录。
 * Delete a single interview record.
 */
export async function deleteStudioInterview(id: string): Promise<void> {
  const res = await rpc.api.studio.interviews[":id"].$delete({ param: { id } });
  await decode<{ success: boolean }>(res, "删除面试失败");
}

/**
 * 批量删除面试记录。
 * Bulk-delete interview records.
 */
export async function bulkDeleteStudioInterviews(
  ids: string[],
): Promise<{ deleted: number; deletedCount?: number; success?: boolean }> {
  const res = await rpc.api.studio.interviews["bulk-delete"].$post({
    json: { ids: ids as [string, ...string[]] },
  });
  const data = await decode<{ deletedCount: number; success: boolean }>(res, "批量删除失败");
  return { deleted: data.deletedCount, ...data };
}
