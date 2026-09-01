import {
  cancelWorkspaceResumeUploadBatch,
  createWorkspaceResumeUploadBatch,
  deleteWorkspaceResumeUploadBatch,
  getWorkspaceResumeUploadBatch,
  listActiveWorkspaceResumeUploadBatches,
  listWorkspaceResumeUploadBatches,
  listWorkspaceResumeUploadTaskInbox,
  processNextWorkspaceResumeUploadBatchItem,
  resumeWorkspaceResumeUploadBatch,
} from "@/lib/client/backend-api";

/**
 * 批量上传简历 API。映射到 `/workspaces/:workspaceSlug/candidates/intake/upload-batches/*`。
 * 单文件上传按项目约定走 apiFetch + FormData；其余 JSON 端点走 Hey API SDK。
 *
 * Bulk-resume-upload API — maps to `/workspaces/:workspaceSlug/candidates/intake/upload-batches/*`.
 * Single-file uploads use apiFetch + FormData by project convention; the rest
 * of the JSON endpoints go through the generated Hey API SDK.
 */

import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeUploadFileDescriptor,
  CreateBulkResumeBatchInput,
  ProcessNextResult,
} from "@arc/shared/bulk-resume-upload";
import type { UploadTaskInboxPage } from "@arc/shared/upload-task-inbox";
import { apiFetch } from "@/lib/client/api/client";

import { apiRequest } from "../rpc-fetch";

/**
 * 上传单个 PDF。返回 storageKey + contentHash + 原始文件名/大小。
 * Upload a single PDF. Returns storageKey + contentHash + original filename/size.
 */
export function uploadResumeForBulk(
  slug: string,
  file: File,
): Promise<BulkResumeUploadFileDescriptor> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<BulkResumeUploadFileDescriptor>(
    `/workspaces/${slug}/candidates/intake/upload-batches/uploads`,
    { body: fd, method: "POST" },
  );
}

/**
 * 创建批次。冲突 (409) 时 apiRequest 抛 ApiError，前端可读 payload.activeBatchId 处理。
 * Create a batch. On conflict (409) apiRequest throws ApiError; callers can read payload.activeBatchId.
 */
export function createBulkResumeBatch(
  slug: string,
  input: CreateBulkResumeBatchInput,
): Promise<BulkResumeBatchDetailDto> {
  return apiRequest(
    createWorkspaceResumeUploadBatch({ body: input, path: { workspaceSlug: slug } }),

    "创建批次失败",
  );
}

/**
 * 获取批次列表。
 * List all batches.
 */
export function listBulkResumeBatches(slug: string): Promise<BulkResumeBatchDto[]> {
  return apiRequest(
    listWorkspaceResumeUploadBatches({ path: { workspaceSlug: slug } }),
    "加载批次列表失败",
  );
}

/**
 * 获取当前活跃批次详情列表；无活跃批次时返回空数组。
 * Get active batch details; returns an empty array when there are no active batches.
 */
export function getActiveBulkResumeBatches(slug: string): Promise<BulkResumeBatchDetailDto[]> {
  return apiRequest(
    listActiveWorkspaceResumeUploadBatches({ path: { workspaceSlug: slug } }),
    "加载活跃批次失败",
  );
}

export function getUploadTaskInboxPage(
  slug: string,
  cursor: string | null,
): Promise<UploadTaskInboxPage> {
  return apiRequest(
    listWorkspaceResumeUploadTaskInbox({
      path: { workspaceSlug: slug },
      query: cursor ? { cursor } : {},
    }),

    "加载上传任务失败",
  );
}

export async function getActiveBulkResumeBatch(
  slug: string,
): Promise<BulkResumeBatchDetailDto | null> {
  const [first] = await getActiveBulkResumeBatches(slug);
  return first ?? null;
}

/**
 * 获取指定批次详情。
 * Get a specific batch by id.
 */
export function getBulkResumeBatchDetail(
  slug: string,
  batchId: string,
): Promise<BulkResumeBatchDetailDto> {
  return apiRequest(
    getWorkspaceResumeUploadBatch({ path: { id: batchId, workspaceSlug: slug } }),

    "加载批次详情失败",
  );
}

/**
 * 处理批次中的下一个文件。
 * Process the next item in the batch.
 */
export function processNextBulkResumeBatch(
  slug: string,
  batchId: string,
): Promise<ProcessNextResult> {
  return apiRequest(
    processNextWorkspaceResumeUploadBatchItem({ path: { id: batchId, workspaceSlug: slug } }),

    "处理失败",
  );
}

/**
 * 继续（恢复）暂停的批次。
 * Resume a paused batch.
 */
export function resumeBulkResumeBatch(
  slug: string,
  batchId: string,
): Promise<BulkResumeBatchDetailDto> {
  return apiRequest(
    resumeWorkspaceResumeUploadBatch({ path: { id: batchId, workspaceSlug: slug } }),

    "继续批次失败",
  );
}

/**
 * 取消批次。
 * Cancel a batch.
 */
export function cancelBulkResumeBatch(
  slug: string,
  batchId: string,
): Promise<BulkResumeBatchDetailDto> {
  return apiRequest(
    cancelWorkspaceResumeUploadBatch({ path: { id: batchId, workspaceSlug: slug } }),

    "取消批次失败",
  );
}

/**
 * 删除批次。
 * Delete a batch.
 */
export function deleteBulkResumeBatch(
  slug: string,
  batchId: string,
): Promise<{ success: boolean }> {
  return apiRequest(
    deleteWorkspaceResumeUploadBatch({ path: { id: batchId, workspaceSlug: slug } }),

    "删除批次失败",
  );
}
