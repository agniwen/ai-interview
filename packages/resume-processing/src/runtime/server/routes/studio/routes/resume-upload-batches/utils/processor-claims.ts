import { and, eq } from "drizzle-orm";

import { db } from "../../../../../../lib/server/db/index";
import { resumeUploadBatch, resumeUploadBatchItem } from "@app/db-schema/schema";

export class BatchItemCancelledError extends Error {
  readonly batchId: string;
  readonly itemId: string;

  constructor(batchId: string, itemId: string) {
    super("简历上传任务已取消。");
    this.name = "BatchItemCancelledError";
    this.batchId = batchId;
    this.itemId = itemId;
  }
}

export async function loadClaimMissSnapshot(itemId: string) {
  const [row] = await db
    .select({
      batchId: resumeUploadBatchItem.batchId,
      startedAt: resumeUploadBatchItem.startedAt,
      status: resumeUploadBatchItem.status,
    })
    .from(resumeUploadBatchItem)
    .where(eq(resumeUploadBatchItem.id, itemId))
    .limit(1);
  return row ?? null;
}

export async function isBatchItemCancelled(batchId: string, itemId: string): Promise<boolean> {
  const [row] = await db
    .select({
      batchStatus: resumeUploadBatch.status,
      itemStatus: resumeUploadBatchItem.status,
    })
    .from(resumeUploadBatchItem)
    .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
    .where(and(eq(resumeUploadBatchItem.id, itemId), eq(resumeUploadBatchItem.batchId, batchId)))
    .limit(1);
  return !row || row.batchStatus === "cancelled" || row.itemStatus === "cancelled";
}

export async function assertBatchItemNotCancelled(batchId: string, itemId: string): Promise<void> {
  if (await isBatchItemCancelled(batchId, itemId)) {
    throw new BatchItemCancelledError(batchId, itemId);
  }
}

export async function releaseBatchItemForRetry(batchId: string, itemId: string): Promise<void> {
  await db
    .update(resumeUploadBatchItem)
    .set({ startedAt: null, status: "pending" })
    .where(
      and(
        eq(resumeUploadBatchItem.id, itemId),
        eq(resumeUploadBatchItem.batchId, batchId),
        eq(resumeUploadBatchItem.status, "processing"),
      ),
    );
}

type ClaimMissSnapshot = {
  batchId: string;
  startedAt: Date | null;
  status: string;
} | null;

const CLAIM_MISS_NOOP_STATUSES = new Set([
  "cancelled",
  "duplicate_skipped",
  "failed",
  "processing",
  "succeeded",
]);

export function getClaimMissRetryError(snapshot: ClaimMissSnapshot, itemId: string): Error | null {
  if (!snapshot) {
    return new Error(
      `简历解析任务 ${itemId} 未找到对应上传项；请检查 worker 的 DATABASE_URL 是否与 Web/API 一致。`,
    );
  }
  if (CLAIM_MISS_NOOP_STATUSES.has(snapshot.status)) {
    return null;
  }
  return new Error(
    `简历解析任务 ${itemId} 未能 claim 上传项（当前状态：${snapshot.status}），将交由队列重试。`,
  );
}

export function isBatchItemCancelledError(error: unknown): error is BatchItemCancelledError {
  return (
    error instanceof BatchItemCancelledError ||
    (error instanceof Error && error.name === "BatchItemCancelledError")
  );
}
