import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../database";
import {
  resumePoolEvent,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@app/db-schema/schema";
import type {
  ResumePoolScope,
  ResumePoolSourceChannel,
  ResumeUploadBatchItemStatus,
  ResumeUploadBatchStatus,
  ResumeUploadBatchTarget,
} from "@app/db-schema/schema";
import { DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS } from "@app/shared/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeBatchItemDto,
} from "@app/shared/bulk-resume-upload";
import type { ResumeParseJobData } from "@app/resume-parse-queue/resume-parse";
import { deleteDuplicateMatchesForSource } from "../semantic/resume/duplicate-matches";

type BatchRow = typeof resumeUploadBatch.$inferSelect;
type ItemRow = typeof resumeUploadBatchItem.$inferSelect;

const RETRIABLE_FAILURE_MESSAGES = ["简历文件不可用（S3 对象缺失）。"] as const;
const ACTIVE_BATCH_STATUSES: ResumeUploadBatchStatus[] = ["pending", "running"];
const PENDING_BATCH_ITEM_STATUS: ResumeUploadBatchItemStatus = "pending";

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
    resumePoolScope: row.resumePoolScope,
    skippedCount: row.skippedCount,
    status: row.status,
    succeededCount: row.succeededCount,
    target: row.target,
    totalCount: row.totalCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toItemDto(row: ItemRow): BulkResumeBatchItemDto {
  return {
    batchId: row.batchId,
    contentHash: row.contentHash,
    dedupMatchSnapshot: row.dedupMatchSnapshot,
    errorMessage: row.errorMessage,
    fileSize: row.fileSize,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    id: row.id,
    orderIndex: row.orderIndex,
    originalFileName: row.originalFileName,
    poolItemId: row.poolItemId,
    resumeRecordId: row.resumeRecordId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status: row.status,
  };
}

export interface CreateBatchInput {
  organizationId: string;
  userId: string;
  jdMode: "bind" | "auto" | "none";
  jobMatchRequestedAt?: Date | null;
  jobDescriptionId: string | null;
  dedupPolicy: "skip" | "create";
  referralTargetRole?: string | null;
  resumePoolScope?: ResumePoolScope | null;
  sourceChannel?: ResumePoolSourceChannel | null;
  target?: ResumeUploadBatchTarget;
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
  const target = input.target ?? "resume_library";
  const scope = input.resumePoolScope ?? "private";
  await db.transaction(async (tx) => {
    await tx.insert(resumeUploadBatch).values({
      createdAt: now,
      createdBy: input.userId,
      dedupPolicy: input.dedupPolicy,
      id: batchId,
      jdMode: input.jdMode,
      jobDescriptionId: input.jobDescriptionId,
      jobMatchRequestedAt: input.jobMatchRequestedAt ?? null,
      organizationId: input.organizationId,
      resumePoolScope: target === "resume_pool" ? scope : null,
      status: "pending",
      target,
      totalCount: input.files.length,
      updatedAt: now,
    });
    const rows = input.files.map((f, i) => ({
      file: f,
      itemId: crypto.randomUUID(),
      orderIndex: i,
      poolItemId: target === "resume_pool" ? crypto.randomUUID() : null,
      recordId: target === "resume_library" ? crypto.randomUUID() : null,
    }));
    const placeholderRows = rows.filter(
      (row): row is typeof row & { recordId: string } => row.recordId !== null,
    );
    if (placeholderRows.length > 0) {
      await tx.insert(studioInterview).values(
        placeholderRows.map(({ file, recordId }) => ({
          candidateEmail: null,
          candidateName: candidateNameFromFileName(file.originalFileName),
          candidatePhone: null,
          createdAt: now,
          createdBy: input.userId,
          id: recordId,
          interviewQuestions: [],
          jobDescriptionId: input.jdMode === "bind" ? input.jobDescriptionId : null,
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
    }
    const poolRows = rows.filter(
      (row): row is typeof row & { poolItemId: string } => row.poolItemId !== null,
    );
    if (poolRows.length > 0) {
      await tx.insert(resumePoolItem).values(
        poolRows.map(({ file, poolItemId }) => ({
          candidateEmail: null,
          candidateName: candidateNameFromFileName(file.originalFileName),
          candidatePhone: null,
          createdAt: now,
          createdBy: input.userId,
          id: poolItemId,
          jobDescriptionId: input.jdMode === "bind" ? input.jobDescriptionId : null,
          notes: null,
          organizationId: input.organizationId,
          publishedAt: scope === "public" ? now : null,
          publishedBy: scope === "public" ? input.userId : null,
          resumeContentHash: file.contentHash,
          resumeFileName: file.originalFileName,
          resumeParseError: null,
          resumeParseStatus: "queued" as const,
          resumeParsedAt: null,
          resumeProfile: null,
          resumeStorageKey: file.storageKey,
          scope,
          skillsNormalized: [],
          sourceChannel: input.sourceChannel ?? null,
          sourceOrganizationId: scope === "public" ? input.organizationId : null,
          sourcePoolItemId: null,
          sourceUserId: scope === "public" ? input.userId : null,
          status: "active" as const,
          targetRole: input.referralTargetRole?.trim() || null,
          updatedAt: now,
        })),
      );
      await tx.insert(resumePoolEvent).values(
        poolRows.map(({ poolItemId }) => ({
          actorId: input.userId,
          createdAt: now,
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          poolItemId,
          type: "created" as const,
        })),
      );
      if (input.jdMode === "bind" && input.jobDescriptionId) {
        const bindingMode =
          input.sourceChannel === "referral" || input.sourceChannel === "mail_ingest"
            ? "automatic"
            : "manual";
        await tx.insert(resumePoolEvent).values(
          poolRows.map(({ poolItemId }) => ({
            actorId: input.userId,
            createdAt: now,
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            payload: {
              bindingMode,
              fromJobDescriptionId: null,
              source: input.sourceChannel === "referral" ? "referral" : "batch_fixed_job",
              toJobDescriptionId: input.jobDescriptionId,
            },
            poolItemId,
            type: "bound" as const,
          })),
        );
      }
    }
    await tx.insert(resumeUploadBatchItem).values(
      rows.map(({ file, itemId, orderIndex, poolItemId, recordId }) => ({
        batchId,
        contentHash: file.contentHash,
        fileSize: file.fileSize,
        id: itemId,
        orderIndex,
        organizationId: input.organizationId,
        originalFileName: file.originalFileName,
        poolItemId,
        queuedAt: now,
        resumeRecordId: recordId,
        status: PENDING_BATCH_ITEM_STATUS,
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

export async function loadActiveBatches(
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto[]> {
  const rows = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
        inArray(resumeUploadBatch.status, ACTIVE_BATCH_STATUSES),
      ),
    )
    .orderBy(desc(resumeUploadBatch.createdAt));
  const details = await Promise.all(
    rows.map((row) => loadBatchDetail(row.id, organizationId, userId)),
  );
  return details.filter(
    (detail): detail is BulkResumeBatchDetailDto =>
      detail !== null && ["pending", "running"].includes(detail.batch.status),
  );
}

export async function loadActiveBatch(
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto | null> {
  const [detail] = await loadActiveBatches(organizationId, userId);
  return detail ?? null;
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
  if (row.poolItemId) {
    await tx
      .update(resumePoolItem)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
      .where(eq(resumePoolItem.id, row.poolItemId));
  }
  await tx
    .update(resumeUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "pending")));
  return {
    ...row,
    attemptCount: row.attemptCount + 1,
    startedAt: now,
    status: "processing",
  };
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
  if (row.poolItemId) {
    await tx
      .update(resumePoolItem)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
      .where(eq(resumePoolItem.id, row.poolItemId));
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
      .select({
        poolItemId: resumeUploadBatchItem.poolItemId,
        resumeRecordId: resumeUploadBatchItem.resumeRecordId,
      })
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
    const orphanPoolItemIds = orphanItems.flatMap((item) =>
      item.poolItemId ? [item.poolItemId] : [],
    );
    if (orphanPoolItemIds.length > 0) {
      await tx
        .update(resumePoolItem)
        .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: new Date() })
        .where(inArray(resumePoolItem.id, orphanPoolItemIds));
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

export async function reviveRetriableFailures(
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
      .set({
        errorMessage: null,
        finishedAt: null,
        startedAt: null,
        status: "pending",
      })
      .where(
        and(
          eq(resumeUploadBatchItem.batchId, batchId),
          eq(resumeUploadBatchItem.status, "failed"),
          inArray(resumeUploadBatchItem.errorMessage, [...RETRIABLE_FAILURE_MESSAGES]),
        ),
      );
    await tx
      .update(resumeUploadBatch)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(resumeUploadBatch.id, batchId));
  });
  await reconcileBatchProgress(batchId);
}

export async function recoverIncompleteBatchItems(
  thresholdSeconds = resumeParseStaleThresholdSeconds(),
): Promise<ResumeParseJobData[]> {
  await db.transaction(async (tx) => {
    const staleItems = await tx
      .select({
        poolItemId: resumeUploadBatchItem.poolItemId,
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
    const stalePoolItemIds = staleItems.flatMap((item) =>
      item.poolItemId ? [item.poolItemId] : [],
    );
    if (stalePoolItemIds.length > 0) {
      await tx
        .update(resumePoolItem)
        .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
        .where(inArray(resumePoolItem.id, stalePoolItemIds));
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
  let cancelledPoolItemIds: string[] = [];
  let cancelledRecordIds: string[] = [];
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
      .select({
        poolItemId: resumeUploadBatchItem.poolItemId,
        resumeRecordId: resumeUploadBatchItem.resumeRecordId,
      })
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
      cancelledRecordIds = recordIds;
    }
    const poolItemIds = cancellableItems.flatMap((item) =>
      item.poolItemId ? [item.poolItemId] : [],
    );
    if (poolItemIds.length > 0) {
      await tx
        .update(resumePoolItem)
        .set({ status: "archived", updatedAt: now })
        .where(inArray(resumePoolItem.id, poolItemIds));
      cancelledPoolItemIds = poolItemIds;
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
  for (const recordId of cancelledRecordIds) {
    await deleteDuplicateMatchesForSource({
      organizationId,
      sourceId: recordId,
      sourceType: "studio_interview",
    });
  }
  for (const poolItemId of cancelledPoolItemIds) {
    await deleteDuplicateMatchesForSource({
      organizationId,
      sourceId: poolItemId,
      sourceType: "resume_pool_item",
    });
  }
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
