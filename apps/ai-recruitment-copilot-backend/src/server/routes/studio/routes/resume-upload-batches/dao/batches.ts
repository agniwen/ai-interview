import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { resumeUploadBatch, resumeUploadBatchItem, studioInterview } from "@arc/db-schema/schema";
import type { ResumeUploadBatchItemStatus, ResumeUploadBatchStatus } from "@arc/db-schema/schema";
import { DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS } from "@arc/shared/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeBatchItemDto,
} from "@arc/shared/bulk-resume-upload";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";

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
    contentHash: row.contentHash,
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
  files: { storageKey: string; originalFileName: string; fileSize: number; contentHash: string }[];
}

function candidateNameFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExt = trimmed.replace(/\.pdf$/i, "").trim();
  return withoutExt || "未解析简历";
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
    const rows = input.files.map((f, i) => ({
      file: f,
      itemId: crypto.randomUUID(),
      orderIndex: i,
      recordId: crypto.randomUUID(),
    }));
    await tx.insert(studioInterview).values(
      rows.map(({ file, recordId }) => ({
        candidateEmail: null,
        candidateName: candidateNameFromFileName(file.originalFileName),
        candidatePhone: null,
        createdAt: now,
        createdBy: input.userId,
        id: recordId,
        interviewQuestions: [],
        jobDescriptionId: input.jobDescriptionId,
        notes: null,
        organizationId: input.organizationId,
        resumeContentHash: file.contentHash,
        resumeFileName: file.originalFileName,
        resumeParseError: null,
        resumeParseStatus: "queued" as const,
        resumeParsedAt: null,
        resumeProfile: null,
        resumeStorageKey: file.storageKey,
        status: "draft" as const,
        targetRole: null,
        updatedAt: now,
      })),
    );
    await tx.insert(resumeUploadBatchItem).values(
      rows.map(({ file, itemId, orderIndex, recordId }) => ({
        batchId,
        contentHash: file.contentHash,
        fileSize: file.fileSize,
        id: itemId,
        orderIndex,
        organizationId: input.organizationId,
        originalFileName: file.originalFileName,
        queuedAt: now,
        resumeRecordId: recordId,
        status: "pending" as ResumeUploadBatchItemStatus,
        storageKey: file.storageKey,
      })),
    );
  });
  return batchId;
}

export async function reconcileBatchProgress(batchId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId))
      .limit(1);
    if (!batch) {
      return;
    }
    const counts = await tx
      .select({
        count: sql<number>`count(*)::int`,
        status: resumeUploadBatchItem.status,
      })
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId))
      .groupBy(resumeUploadBatchItem.status);
    const byStatus = new Map(counts.map((row) => [row.status, row.count]));
    const succeededCount = byStatus.get("succeeded") ?? 0;
    const failedCount = byStatus.get("failed") ?? 0;
    const skippedCount = byStatus.get("duplicate_skipped") ?? 0;
    const processedCount = succeededCount + failedCount + skippedCount;
    const now = new Date();
    const shouldComplete =
      batch.status !== "completed" &&
      batch.status !== "cancelled" &&
      processedCount === batch.totalCount;
    await tx
      .update(resumeUploadBatch)
      .set({
        completedAt: shouldComplete ? now : batch.completedAt,
        failedCount,
        processedCount,
        skippedCount,
        status: shouldComplete ? "completed" : batch.status,
        succeededCount,
        updatedAt: now,
      })
      .where(eq(resumeUploadBatch.id, batchId));
  });
}

export async function loadBatchDetail(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto | null> {
  await reconcileBatchProgress(batchId);
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
  const detail = await loadBatchDetail(row.id, organizationId, userId);
  if (!detail || !["pending", "running"].includes(detail.batch.status)) {
    return null;
  }
  return detail;
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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resumeParseStaleThresholdSeconds(): number {
  return parsePositiveInteger(
    process.env.RESUME_PARSE_STALE_PROCESSING_SECONDS,
    DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS,
  );
}

function staleProcessingCondition(thresholdSeconds = resumeParseStaleThresholdSeconds()) {
  return and(
    eq(resumeUploadBatchItem.status, "processing"),
    lt(
      resumeUploadBatchItem.startedAt,
      sql`now() - interval '${sql.raw(String(thresholdSeconds))} seconds'`,
    ),
  );
}

// 用 FOR UPDATE SKIP LOCKED 在事务内锁定一个 pending item，并把它标为 processing。
// 返回 null 时表示该 batch 已无待处理项（或被并发拿走）。
// 使用 drizzle 的 .for("update", { skipLocked: true }) 而不是 tx.execute(sql`...`)，
// 因为后者返回的行字段是 snake_case（storage_key / order_index / ...），
// 调用方按 camelCase 读会全部得到 undefined，触发 AWS SDK
// "No value provided for input HTTP label: Key" 之类的级联错误。
// Use drizzle's .for("update", { skipLocked: true }) instead of a raw
// tx.execute(sql`...`). The raw path returns snake_case columns and callers
// reading camelCase fields silently get undefined — which surfaces downstream
// as obscure errors like AWS SDK's "No value provided for input HTTP label: Key".
export async function claimNextPendingItem(tx: Tx, batchId: string): Promise<ItemRow | null> {
  const [row] = await tx
    .select()
    .from(resumeUploadBatchItem)
    .where(
      and(eq(resumeUploadBatchItem.batchId, batchId), eq(resumeUploadBatchItem.status, "pending")),
    )
    .orderBy(asc(resumeUploadBatchItem.orderIndex))
    .limit(1)
    .for("update", { skipLocked: true });
  if (!row) {
    return null;
  }
  const now = new Date();
  await tx
    .update(resumeUploadBatchItem)
    .set({ startedAt: now, status: "processing" })
    .where(eq(resumeUploadBatchItem.id, row.id));
  if (row.resumeRecordId) {
    await tx
      .update(studioInterview)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
      .where(eq(studioInterview.id, row.resumeRecordId));
  }
  await tx
    .update(resumeUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "pending")));
  return { ...row, startedAt: now, status: "processing" };
}

export async function claimPendingItemById(tx: Tx, itemId: string): Promise<ItemRow | null> {
  const [row] = await tx
    .select()
    .from(resumeUploadBatchItem)
    .where(
      and(
        eq(resumeUploadBatchItem.id, itemId),
        or(eq(resumeUploadBatchItem.status, "pending"), staleProcessingCondition()),
      ),
    )
    .limit(1)
    .for("update", { skipLocked: true });
  if (!row) {
    return null;
  }
  const now = new Date();
  await tx
    .update(resumeUploadBatchItem)
    .set({
      attemptCount: row.attemptCount + 1,
      startedAt: now,
      status: "processing",
    })
    .where(eq(resumeUploadBatchItem.id, row.id));
  if (row.resumeRecordId) {
    await tx
      .update(studioInterview)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
      .where(eq(studioInterview.id, row.resumeRecordId));
  }
  await tx
    .update(resumeUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(resumeUploadBatch.id, row.batchId), eq(resumeUploadBatch.status, "pending")));
  return {
    ...row,
    attemptCount: row.attemptCount + 1,
    startedAt: now,
    status: "processing",
  };
}

// 复活中断项：把 startedAt 已超过阈值的 processing items 设回 pending。
// Revive interrupted items: processing items older than the stale threshold go
// back to pending. The threshold defaults to 15 minutes so long OCR/review work
// is not mistaken for an interrupted worker.
export async function reviveOrphans(
  batchId: string,
  organizationId: string,
  userId: string,
  thresholdSeconds = resumeParseStaleThresholdSeconds(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const orphanCondition = and(
      eq(resumeUploadBatchItem.batchId, batchId),
      staleProcessingCondition(thresholdSeconds),
    );
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
    const orphanItems = await tx
      .select({ resumeRecordId: resumeUploadBatchItem.resumeRecordId })
      .from(resumeUploadBatchItem)
      .where(orphanCondition);
    const orphanRecordIds = orphanItems.flatMap((item) =>
      item.resumeRecordId ? [item.resumeRecordId] : [],
    );
    if (orphanRecordIds.length > 0) {
      await tx
        .update(studioInterview)
        .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: new Date() })
        .where(inArray(studioInterview.id, orphanRecordIds));
    }
    await tx
      .update(resumeUploadBatchItem)
      .set({ startedAt: null, status: "pending" })
      .where(orphanCondition);
    await tx
      .update(resumeUploadBatch)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "running")));
  });
}

export async function recoverIncompleteBatchItems(
  thresholdSeconds = resumeParseStaleThresholdSeconds(),
): Promise<ResumeParseJobData[]> {
  await db.transaction(async (tx) => {
    const staleItems = await tx
      .select({
        resumeRecordId: resumeUploadBatchItem.resumeRecordId,
      })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
      .where(
        and(
          inArray(resumeUploadBatch.status, ["pending", "running"]),
          staleProcessingCondition(thresholdSeconds),
        ),
      );
    const staleRecordIds = staleItems.flatMap((item) =>
      item.resumeRecordId ? [item.resumeRecordId] : [],
    );
    const now = new Date();
    if (staleRecordIds.length > 0) {
      await tx
        .update(studioInterview)
        .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
        .where(inArray(studioInterview.id, staleRecordIds));
    }
    await tx
      .update(resumeUploadBatchItem)
      .set({ startedAt: null, status: "pending" })
      .where(
        and(
          inArray(
            resumeUploadBatchItem.batchId,
            tx
              .select({ id: resumeUploadBatch.id })
              .from(resumeUploadBatch)
              .where(inArray(resumeUploadBatch.status, ["pending", "running"])),
          ),
          staleProcessingCondition(thresholdSeconds),
        ),
      );
  });

  return db
    .select({
      batchId: resumeUploadBatchItem.batchId,
      itemId: resumeUploadBatchItem.id,
      organizationId: resumeUploadBatch.organizationId,
      userId: resumeUploadBatch.createdBy,
    })
    .from(resumeUploadBatchItem)
    .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
    .where(
      and(
        inArray(resumeUploadBatch.status, ["pending", "running"]),
        eq(resumeUploadBatchItem.status, "pending"),
      ),
    );
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
    const cancellableItems = await tx
      .select({ resumeRecordId: resumeUploadBatchItem.resumeRecordId })
      .from(resumeUploadBatchItem)
      .where(
        and(
          eq(resumeUploadBatchItem.batchId, batchId),
          inArray(resumeUploadBatchItem.status, ["pending", "processing"]),
        ),
      );
    const recordIds = cancellableItems.flatMap((item) =>
      item.resumeRecordId ? [item.resumeRecordId] : [],
    );
    if (recordIds.length > 0) {
      await tx.delete(studioInterview).where(inArray(studioInterview.id, recordIds));
    }
    await tx
      .update(resumeUploadBatchItem)
      .set({ finishedAt: now, resumeRecordId: null, status: "cancelled" })
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
