import "client-only";

/**
 * 批量上传简历 API。映射到 `/api/w/:slug/studio/resume-upload-batches/*`。
 * 单文件上传走 apiFetch + FormData（hc 不支持 multipart）；其余 JSON 端点走 rpc + rpcFetch。
 *
 * Bulk-resume-upload API — maps to `/api/w/:slug/studio/resume-upload-batches/*`.
 * Single-file uploads go through apiFetch + FormData (hc does not support
 * multipart); the rest of the JSON endpoints go through rpc + rpcFetch.
 */

import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeUploadFileDescriptor,
  CreateBulkResumeBatchInput,
  ProcessNextResult,
} from "@/lib/shared/bulk-resume-upload";
import { apiFetch } from "@/lib/client/api/client";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

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
    `/api/w/${slug}/studio/resume-upload-batches/uploads`,
    { body: fd, method: "POST" },
  );
}

/**
 * 创建批次。冲突 (409) 时 rpcFetch 抛 ApiError，前端可读 payload.activeBatchId 处理。
 * Create a batch. On conflict (409) rpcFetch throws ApiError; callers can read payload.activeBatchId.
 */
export function createBulkResumeBatch(
  slug: string,
  input: CreateBulkResumeBatchInput,
): Promise<BulkResumeBatchDetailDto> {
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"].$post({
      json: input,
      param: { slug },
    }),
    "创建批次失败",
  );
}

/**
 * 获取批次列表。
 * List all batches.
 */
export function listBulkResumeBatches(slug: string): Promise<BulkResumeBatchDto[]> {
  return rpcFetch<BulkResumeBatchDto[]>(
    rpc.api.w[":slug"].studio["resume-upload-batches"].$get({ param: { slug } }),
    "加载批次列表失败",
  );
}

/**
 * 获取当前活跃批次详情；无活跃批次时返回 null。
 * Get the active batch detail; returns null when there is no active batch.
 */
export function getActiveBulkResumeBatch(slug: string): Promise<BulkResumeBatchDetailDto | null> {
  return rpcFetch<BulkResumeBatchDetailDto | null>(
    rpc.api.w[":slug"].studio["resume-upload-batches"].active.$get({ param: { slug } }),
    "加载活跃批次失败",
  );
}

/**
 * 获取指定批次详情。
 * Get a specific batch by id.
 */
export function getBulkResumeBatchDetail(
  slug: string,
  batchId: string,
): Promise<BulkResumeBatchDetailDto> {
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"].$get({
      param: { id: batchId, slug },
    }),
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
  return rpcFetch<ProcessNextResult>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"]["process-next"].$post({
      param: { id: batchId, slug },
    }),
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
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"].resume.$post({
      param: { id: batchId, slug },
    }),
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
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"].cancel.$post({
      param: { id: batchId, slug },
    }),
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
  return rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"].$delete({
      param: { id: batchId, slug },
    }),
    "删除批次失败",
  );
}
