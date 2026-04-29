/**
 * Studio 后台「面试管理」相关 API。
 * Studio admin "interview management" API.
 *
 * 这一组方法对应 `/api/studio/interviews/*` 路由族。所有调用都走 {@link apiFetch}，
 * 错误以 {@link ApiError} 抛出，404 在适用处会被静默为 null。
 *
 * Maps to the `/api/studio/interviews/*` route family. All calls go through
 * {@link apiFetch}; errors raise {@link ApiError}, and 404s become `null` where
 * applicable.
 */

import type { CandidateFormSubmissionWithSnapshot } from "@/lib/candidate-forms";
import type { StudioInterviewConversationReport } from "@/lib/interview-session";
import type { StudioInterviewListRecord, StudioInterviewRecord } from "@/lib/studio-interviews";
import { apiFetch } from "../client";

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

/**
 * 拉取面试列表（支持分页 / 关键词 / 状态筛选）。
 * Fetch the interview list (supports pagination / keyword / status filtering).
 */
export function fetchStudioInterviews(
  params: StudioInterviewListParams = {},
): Promise<StudioInterviewListResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    search.set("pageSize", String(params.pageSize));
  }
  if (params.search) {
    search.set("search", params.search);
  }
  if (params.status) {
    search.set("status", params.status);
  }
  const query = search.toString();
  return apiFetch<StudioInterviewListResponse>(`/api/studio/interviews${query ? `?${query}` : ""}`);
}

/**
 * 拉取列表概览数据（按状态聚合的计数等）。
 * Fetch the list summary (status counts and other aggregates).
 */
export function fetchStudioInterviewSummary(): Promise<Record<string, unknown>> {
  return apiFetch("/api/studio/interviews/summary");
}

/**
 * 拉取单条面试详情；不存在时返回 null。
 * Fetch a single interview by id; returns null when not found.
 */
export function fetchStudioInterview(id: string): Promise<StudioInterviewRecord | null> {
  return apiFetch<StudioInterviewRecord | null>(
    `/api/studio/interviews/${encodeURIComponent(id)}`,
    { allow404: true },
  );
}

/**
 * 拉取面试报告列表（按时间倒序）。
 * Fetch the interview reports (newest first).
 */
export function fetchStudioInterviewReports(
  id: string,
): Promise<StudioInterviewConversationReport[]> {
  return apiFetch<StudioInterviewConversationReport[]>(
    `/api/studio/interviews/${encodeURIComponent(id)}/reports`,
  );
}

/**
 * 拉取面试关联的表单回答（按提交时间倒序）。
 * Fetch the candidate form submissions for an interview (newest first).
 */
export async function fetchStudioInterviewFormSubmissions(
  id: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const data = await apiFetch<{ submissions: CandidateFormSubmissionWithSnapshot[] }>(
    `/api/studio/interviews/${encodeURIComponent(id)}/form-submissions`,
  );
  return data.submissions;
}

/**
 * 删除某次面试表单回答（重置候选人填写）。
 * Delete a candidate form submission (resets the candidate's fill).
 */
export function deleteStudioInterviewFormSubmission(
  interviewId: string,
  submissionId: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/api/studio/interviews/${encodeURIComponent(interviewId)}/form-submissions/${encodeURIComponent(submissionId)}`,
    { method: "DELETE" },
  );
}

/**
 * 重置一轮面试为「待开始」状态。
 * Reset a single interview round back to the "pending" state.
 */
export function resetStudioInterviewRound(
  interviewId: string,
  roundId: string,
): Promise<StudioInterviewRecord> {
  return apiFetch<StudioInterviewRecord>(
    `/api/studio/interviews/${encodeURIComponent(interviewId)}/rounds/${encodeURIComponent(roundId)}/reset`,
    { method: "POST" },
  );
}

/**
 * 切换单轮面试的"允许面试者文本输入"开关。
 * Toggle the per-round "allow candidate text input" flag.
 */
export function updateStudioInterviewRound(
  interviewId: string,
  roundId: string,
  payload: { allowTextInput: boolean },
): Promise<StudioInterviewRecord> {
  return apiFetch<StudioInterviewRecord>(
    `/api/studio/interviews/${encodeURIComponent(interviewId)}/rounds/${encodeURIComponent(roundId)}`,
    { body: payload, method: "PATCH" },
  );
}

/**
 * 删除单条面试记录。
 * Delete a single interview record.
 */
export function deleteStudioInterview(id: string): Promise<void> {
  return apiFetch(`/api/studio/interviews/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * 批量删除面试记录。
 * Bulk-delete interview records.
 */
export function bulkDeleteStudioInterviews(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>("/api/studio/interviews/bulk-delete", {
    body: { ids },
    method: "POST",
  });
}
