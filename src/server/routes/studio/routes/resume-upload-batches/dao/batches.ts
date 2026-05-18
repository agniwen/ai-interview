import "server-only";

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { resumeUploadBatch, resumeUploadBatchItem } from "@/lib/shared/db/schema";
import type { ResumeUploadBatchItemStatus, ResumeUploadBatchStatus } from "@/lib/shared/db/schema";
import { ORPHAN_THRESHOLD_SECONDS } from "@/lib/shared/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeBatchItemDto,
} from "@/lib/shared/bulk-resume-upload";

type BatchRow = typeof resumeUploadBatch.$inferSelect;
type ItemRow = typeof resumeUploadBatchItem.$inferSelect;

export function toBatchDto(row: BatchRow): BulkResumeBatchDto {
  return {
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    dedupPolicy: row.dedupPolicy,
    failedCount: row.failedCount,
    id: row.id,
    jdMode: row.jdMode,
    jobDescriptionId: row.jobDescriptionId,
    processedCount: row.processedCount,
    skippedCount: row.skippedCount,
    status: row.status,
    succeededCount: row.succeededCount,
    totalCount: row.totalCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toItemDto(row: ItemRow): BulkResumeBatchItemDto {
  return {
    batchId: row.batchId,
    errorMessage: row.errorMessage,
    fileSize: row.fileSize,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    id: row.id,
    orderIndex: row.orderIndex,
    originalFileName: row.originalFileName,
    resumeRecordId: row.resumeRecordId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status: row.status,
  };
}

export interface CreateBatchInput {
  organizationId: string;
  userId: string;
  jdMode: "bind" | "auto" | "none";
  jobDescriptionId: string | null;
  dedupPolicy: "skip" | "create";
  files: { storageKey: string; originalFileName: string; fileSize: number }[];
}

// 创建 batch + 关联 items 一并写入。活跃批次冲突会在 partial unique index 处抛错。
// Create a batch plus all items in one transaction. Active-batch conflict bubbles
// up from the partial unique index as a Postgres unique-violation error.
export async function insertBatchWithItems(input: CreateBatchInput): Promise<string> {
  const batchId = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(resumeUploadBatch).values({
      createdAt: now,
      createdBy: input.userId,
      dedupPolicy: input.dedupPolicy,
      id: batchId,
      jdMode: input.jdMode,
      jobDescriptionId: input.jobDescriptionId,
      organizationId: input.organizationId,
      status: "pending",
      totalCount: input.files.length,
      updatedAt: now,
    });
    await tx.insert(resumeUploadBatchItem).values(
      input.files.map((f, i) => ({
        batchId,
        fileSize: f.fileSize,
        id: crypto.randomUUID(),
        orderIndex: i,
        organizationId: input.organizationId,
        originalFileName: f.originalFileName,
        status: "pending" as ResumeUploadBatchItemStatus,
        storageKey: f.storageKey,
      })),
    );
  });
  return batchId;
}

export async function loadBatchDetail(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto | null> {
  const [row] = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.id, batchId),
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const items = await db
    .select()
    .from(resumeUploadBatchItem)
    .where(eq(resumeUploadBatchItem.batchId, batchId))
    .orderBy(asc(resumeUploadBatchItem.orderIndex));
  return { batch: toBatchDto(row), items: items.map(toItemDto) };
}

export async function loadActiveBatch(
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto | null> {
  const [row] = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
        inArray(resumeUploadBatch.status, ["pending", "running"] as ResumeUploadBatchStatus[]),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return loadBatchDetail(row.id, organizationId, userId);
}

export async function listBatches(
  organizationId: string,
  userId: string,
  limit = 20,
): Promise<BulkResumeBatchDto[]> {
  const rows = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
      ),
    )
    .orderBy(desc(resumeUploadBatch.createdAt))
    .limit(limit);
  return rows.map(toBatchDto);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 用 FOR UPDATE SKIP LOCKED 在事务内锁定一个 pending item，并把它标为 processing。
// 返回 null 时表示该 batch 已无待处理项（或被并发拿走）。
// Locks one pending item with FOR UPDATE SKIP LOCKED and flips it to processing,
// inside the caller-supplied transaction. Returns null when no pending item remains
// (or it was concurrently claimed elsewhere).
export async function claimNextPendingItem(tx: Tx, batchId: string): Promise<ItemRow | null> {
  const result = await tx.execute(sql`
    select * from ${resumeUploadBatchItem}
    where ${resumeUploadBatchItem.batchId} = ${batchId}
      and ${resumeUploadBatchItem.status} = 'pending'
    order by ${resumeUploadBatchItem.orderIndex} asc
    limit 1
    for update skip locked
  `);
  const [row] = (result as unknown as { rows: ItemRow[] }).rows;
  if (!row) {
    return null;
  }
  const now = new Date();
  await tx
    .update(resumeUploadBatchItem)
    .set({ startedAt: now, status: "processing" })
    .where(eq(resumeUploadBatchItem.id, row.id));
  await tx
    .update(resumeUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "pending")));
  return { ...row, startedAt: now, status: "processing" };
}

// 复活孤儿：把 startedAt 已过 60s 的 processing items 设回 pending；batch.status running → pending。
// Revive orphans: processing items older than 60s go back to pending; batch.status
// rolls back from running to pending so the banner UI consistently shows "paused".
export async function reviveOrphans(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ id: resumeUploadBatch.id })
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, batchId),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch) {
      return;
    }
    await tx
      .update(resumeUploadBatchItem)
      .set({ startedAt: null, status: "pending" })
      .where(
        and(
          eq(resumeUploadBatchItem.batchId, batchId),
          eq(resumeUploadBatchItem.status, "processing"),
          lt(
            resumeUploadBatchItem.startedAt,
            sql`now() - interval '${sql.raw(String(ORPHAN_THRESHOLD_SECONDS))} seconds'`,
          ),
        ),
      );
    await tx
      .update(resumeUploadBatch)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "running")));
  });
}

// 取消：未处理项 → cancelled，batch.status → cancelled。已 succeeded/failed/duplicate_skipped 不动。
// Cancel: pending/processing items become cancelled; batch status flips to cancelled.
// Already-terminal items are untouched, so any inserted studio_interview rows survive.
export async function cancelBatch(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  let cancelled = false;
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, batchId),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch || batch.status === "completed" || batch.status === "cancelled") {
      return;
    }
    const now = new Date();
    await tx
      .update(resumeUploadBatchItem)
      .set({ finishedAt: now, status: "cancelled" })
      .where(
        and(
          eq(resumeUploadBatchItem.batchId, batchId),
          inArray(resumeUploadBatchItem.status, ["pending", "processing"]),
        ),
      );
    await tx
      .update(resumeUploadBatch)
      .set({ completedAt: now, status: "cancelled", updatedAt: now })
      .where(eq(resumeUploadBatch.id, batchId));
    cancelled = true;
  });
  return cancelled;
}

// 仅允许删除已 completed / cancelled 的批次。items 通过 cascade 一并删，
// studio_interview 行不动（resume_record_id 的 FK 为 ON DELETE SET NULL）。
// Delete is only allowed for terminal batches. Items cascade out; studio_interview
// rows survive because the FK is ON DELETE SET NULL.
export async function deleteBatch(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.id, batchId),
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
        inArray(resumeUploadBatch.status, ["completed", "cancelled"]),
      ),
    )
    .returning({ id: resumeUploadBatch.id });
  return result.length > 0;
}
