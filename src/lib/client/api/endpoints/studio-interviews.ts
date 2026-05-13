import "client-only";

/**
 * Studio 后台「面试管理」相关 API。
 * Studio admin "interview management" API.
 *
 * 这一组方法对应 `/api/w/:slug/studio/interviews/*` 路由族。JSON 端点全部已迁到
 * Hono RPC（{@link rpc}），错误以 {@link ApiError} 抛出，404 在适用处会被
 * 静默为 null。文件上传 (POST/PATCH 带 resume File) 仍在 dialog 组件中
 * 直接走 fetch + FormData，不在此文件内。
 *
 * Maps to the `/api/w/:slug/studio/interviews/*` route family. JSON endpoints now
 * use Hono RPC under the hood; errors raise {@link ApiError}, and 404s
 * become `null` where applicable. File-upload POST/PATCH stay on raw
 * fetch+FormData inside their dialog components.
 */

import type { CandidateFormSubmissionWithSnapshot } from "@/lib/shared/candidate-forms";
import type { StudioInterviewConversationReport } from "@/lib/shared/interview-session";
import type { PaginatedStudioInterviewRoundsResult } from "@/lib/shared/studio-interview-rounds";
// 仍作为 StudioCandidateRecord 的别名被 T4/T5 消费，DedupMatchRecord 等也用到。
// Still aliased to StudioCandidateRecord; consumed by remaining helpers in T4/T5.
import type { StudioInterviewRecord, StudioInterviewStatus } from "@/lib/shared/studio-interviews";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

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
 * 面试轮次列表分页参数。
 * Interview round list pagination / filter parameters.
 */
export interface StudioInterviewRoundListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

/**
 * 拉取面试轮次列表（支持分页 / 关键词 / 状态筛选）。
 * Fetch the interview round list (supports pagination / keyword / status filtering).
 */
export function fetchStudioInterviewRounds(
  slug: string,
  params: StudioInterviewRoundListParams = {},
): Promise<PaginatedStudioInterviewRoundsResult> {
  return rpcFetch<PaginatedStudioInterviewRoundsResult>(
    rpc.api.w[":slug"].studio.interviews.$get({
      param: { slug },
      query: {
        ...(params.page === undefined ? {} : { page: String(params.page) }),
        ...(params.pageSize === undefined ? {} : { pageSize: String(params.pageSize) }),
        ...(params.search ? { search: params.search } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    }),
    "加载面试列表失败",
  );
}

/**
 * 面试轮次概览计数（按状态分组）。
 * Interview round summary counts grouped by status.
 */
export interface InterviewRoundSummaryResponse {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
}

/**
 * 拉取轮次概览数据（各状态计数）。
 * Fetch the round summary (status counts).
 */
export function fetchStudioInterviewSummary(slug: string): Promise<InterviewRoundSummaryResponse> {
  return rpcFetch<InterviewRoundSummaryResponse>(
    rpc.api.w[":slug"].studio.interviews.summary.$get({ param: { slug } }),
    "加载概览失败",
  );
}

/**
 * 按姓名/邮箱/电话查重，任一字段命中即返回。
 * Look up potential duplicates by name / email / phone (any one suffices).
 */
export function fetchInterviewDedup(
  slug: string,
  input: {
    name: string | null;
    email: string | null;
    phone: string | null;
  },
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio.interviews["dedup-check"].$post({ json: input, param: { slug } }),
    "查重失败",
  );
}

/**
 * 拉取单条面试详情；不存在时返回 null。
 * Fetch a single interview by id; returns null when not found.
 */
export function fetchStudioInterview(
  slug: string,
  id: string,
): Promise<StudioInterviewRecord | null> {
  return rpcFetch<StudioInterviewRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"].$get({ param: { id, slug } }),
    "加载面试详情失败",
    { allow404: true },
  );
}

/**
 * 拉取面试报告列表（按时间倒序）。
 * Fetch the interview reports (newest first).
 */
export function fetchStudioInterviewReports(
  slug: string,
  id: string,
): Promise<StudioInterviewConversationReport[]> {
  return rpcFetch<StudioInterviewConversationReport[]>(
    rpc.api.w[":slug"].studio.interviews[":id"].reports.$get({ param: { id, slug } }),
    "加载面试报告失败",
  );
}

/**
 * 获取某轮录像的 S3 预签名播放 URL (10 分钟有效).
 * Fetch a 10-min presigned URL for the round's recording mp4.
 */
export function fetchStudioInterviewRecordingUrl(
  slug: string,
  id: string,
  conversationId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  return rpcFetch<{ url: string; expiresInSeconds: number }>(
    rpc.api.w[":slug"].studio.interviews[":id"].recordings[":conversationId"].$get({
      param: { conversationId, id, slug },
    }),
    "加载录像链接失败",
  );
}

/**
 * 拉取面试关联的表单回答（按提交时间倒序）。
 * Fetch the candidate form submissions for an interview (newest first).
 */
export async function fetchStudioInterviewFormSubmissions(
  slug: string,
  id: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const data = await rpcFetch<{ submissions: CandidateFormSubmissionWithSnapshot[] }>(
    rpc.api.w[":slug"].studio.interviews[":id"]["form-submissions"].$get({ param: { id, slug } }),
    "加载面试表单填写失败",
  );
  return data.submissions;
}

/**
 * 删除某次面试表单回答（重置候选人填写）。
 * Delete a candidate form submission (resets the candidate's fill).
 */
export function deleteStudioInterviewFormSubmission(
  slug: string,
  interviewId: string,
  submissionId: string,
): Promise<{ success: boolean }> {
  return rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio.interviews[":id"]["form-submissions"][":submissionId"].$delete({
      param: { id: interviewId, slug, submissionId },
    }),
    "删除答卷失败",
  );
}

/**
 * 重置一轮面试为「待开始」状态。
 * Reset a single interview round back to the "pending" state.
 */
export function resetStudioInterviewRound(
  slug: string,
  interviewId: string,
  roundId: string,
): Promise<StudioInterviewRecord> {
  return rpcFetch<StudioInterviewRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"].rounds[":roundId"].reset.$post({
      param: { id: interviewId, roundId, slug },
    }),
    "重置轮次失败",
  );
}

/**
 * 切换单轮面试的"允许面试者文本输入"开关。
 * Toggle the per-round "allow candidate text input" flag.
 */
export function updateStudioInterviewRound(
  slug: string,
  interviewId: string,
  roundId: string,
  payload: { allowTextInput: boolean },
): Promise<StudioInterviewRecord> {
  return rpcFetch<StudioInterviewRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"].rounds[":roundId"].$patch({
      json: payload,
      param: { id: interviewId, roundId, slug },
    }),
    "更新轮次设置失败",
  );
}

/**
 * 删除单条面试记录。
 * Delete a single interview record.
 */
export async function deleteStudioInterview(slug: string, id: string): Promise<void> {
  await rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio.interviews[":id"].$delete({ param: { id, slug } }),
    "删除面试失败",
  );
}

/**
 * 批量删除面试记录。
 * Bulk-delete interview records.
 */
export async function bulkDeleteStudioInterviews(
  slug: string,
  ids: string[],
): Promise<{ deleted: number; deletedCount?: number; success?: boolean }> {
  const data = await rpcFetch<{ deletedCount: number; success: boolean }>(
    rpc.api.w[":slug"].studio.interviews["bulk-delete"].$post({
      json: { ids: ids as [string, ...string[]] },
      param: { slug },
    }),
    "批量删除失败",
  );
  return { deleted: data.deletedCount, ...data };
}
