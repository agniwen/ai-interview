import {
  createRecruitingRecords,
  updateRecruitingRecords,
  deleteRecruitingRecords,
} from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../database";
import {
  resumePoolEvent,
  resumePoolItem,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
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
type BatchRow = typeof recruitingUploadBatch.$inferSelect;
type ItemRow = typeof recruitingUploadBatchItem.$inferSelect;
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
    resumeRecordId: row.recruitingRecordId,
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
    await tx.insert(recruitingUploadBatch).values({
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
      await createRecruitingRecords(
        tx,
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
    await tx.insert(recruitingUploadBatchItem).values(
      rows.map(
        ({ file, itemId, orderIndex, poolItemId, recordId }) =>
          ({
            batchId,
            contentHash: file.contentHash,
            fileSize: file.fileSize,
            id: itemId,
            orderIndex,
            organizationId: input.organizationId,
            originalFileName: file.originalFileName,
            poolItemId,
            queuedAt: now,
            recruitingRecordId: recordId,
            status: PENDING_BATCH_ITEM_STATUS,
            storageKey: file.storageKey,
          }) satisfies typeof recruitingUploadBatchItem.$inferInsert,
      ),
    );
  });
  return batchId;
}

export async function reconcileBatchProgress(batchId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(recruitingUploadBatch)
      .where(eq(recruitingUploadBatch.id, batchId))
      .limit(1);
    if (!batch) {
      return;
    }
    const counts = await tx
      .select({
        count: sql<number>`count(*)::int`,
        status: recruitingUploadBatchItem.status,
      })
      .from(recruitingUploadBatchItem)
      .where(eq(recruitingUploadBatchItem.batchId, batchId))
      .groupBy(recruitingUploadBatchItem.status);
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
      .update(recruitingUploadBatch)
      .set({
        completedAt: shouldComplete ? now : batch.completedAt,
        failedCount,
        processedCount,
        skippedCount,
        status: shouldComplete ? "completed" : batch.status,
        succeededCount,
        updatedAt: now,
      })
      .where(eq(recruitingUploadBatch.id, batchId));
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
    .from(recruitingUploadBatch)
    .where(
      and(
        eq(recruitingUploadBatch.id, batchId),
        eq(recruitingUploadBatch.organizationId, organizationId),
        eq(recruitingUploadBatch.createdBy, userId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const items = await db
    .select()
    .from(recruitingUploadBatchItem)
    .where(eq(recruitingUploadBatchItem.batchId, batchId))
    .orderBy(asc(recruitingUploadBatchItem.orderIndex));
  return { batch: toBatchDto(row), items: items.map(toItemDto) };
}

export async function loadActiveBatches(
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto[]> {
  const rows = await db
    .select()
    .from(recruitingUploadBatch)
    .where(
      and(
        eq(recruitingUploadBatch.organizationId, organizationId),
        eq(recruitingUploadBatch.createdBy, userId),
        inArray(recruitingUploadBatch.status, ACTIVE_BATCH_STATUSES),
      ),
    )
    .orderBy(desc(recruitingUploadBatch.createdAt));
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
    .from(recruitingUploadBatch)
    .where(
      and(
        eq(recruitingUploadBatch.organizationId, organizationId),
        eq(recruitingUploadBatch.createdBy, userId),
      ),
    )
    .orderBy(desc(recruitingUploadBatch.createdAt))
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
    eq(recruitingUploadBatchItem.status, "processing"),
    lt(
      recruitingUploadBatchItem.startedAt,
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
    .from(recruitingUploadBatchItem)
    .where(
      and(
        eq(recruitingUploadBatchItem.batchId, batchId),
        eq(recruitingUploadBatchItem.status, "pending"),
      ),
    )
    .orderBy(asc(recruitingUploadBatchItem.orderIndex))
    .limit(1)
    .for("update", { skipLocked: true });
  if (!row) {
    return null;
  }
  const now = new Date();
  await tx
    .update(recruitingUploadBatchItem)
    .set({
      attemptCount: row.attemptCount + 1,
      startedAt: now,
      status: "processing",
    })
    .where(eq(recruitingUploadBatchItem.id, row.id));
  if (row.recruitingRecordId) {
    await updateRecruitingRecords(tx, eq(recruitingRecordReadModel.id, row.recruitingRecordId), {
      resumeParseError: null,
      resumeParseStatus: "processing",
      updatedAt: now,
    });
  }
  if (row.poolItemId) {
    await tx
      .update(resumePoolItem)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
      .where(eq(resumePoolItem.id, row.poolItemId));
  }
  await tx
    .update(recruitingUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(recruitingUploadBatch.id, batchId), eq(recruitingUploadBatch.status, "pending")));
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
    .from(recruitingUploadBatchItem)
    .where(
      and(
        eq(recruitingUploadBatchItem.id, itemId),
        or(eq(recruitingUploadBatchItem.status, "pending"), staleProcessingCondition()),
      ),
    )
    .limit(1)
    .for("update", { skipLocked: true });
  if (!row) {
    return null;
  }
  const now = new Date();
  await tx
    .update(recruitingUploadBatchItem)
    .set({
      attemptCount: row.attemptCount + 1,
      startedAt: now,
      status: "processing",
    })
    .where(eq(recruitingUploadBatchItem.id, row.id));
  if (row.recruitingRecordId) {
    await updateRecruitingRecords(tx, eq(recruitingRecordReadModel.id, row.recruitingRecordId), {
      resumeParseError: null,
      resumeParseStatus: "processing",
      updatedAt: now,
    });
  }
  if (row.poolItemId) {
    await tx
      .update(resumePoolItem)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
      .where(eq(resumePoolItem.id, row.poolItemId));
  }
  await tx
    .update(recruitingUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(
      and(eq(recruitingUploadBatch.id, row.batchId), eq(recruitingUploadBatch.status, "pending")),
    );
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
      eq(recruitingUploadBatchItem.batchId, batchId),
      staleProcessingCondition(thresholdSeconds),
    );
    const [batch] = await tx
      .select({ id: recruitingUploadBatch.id })
      .from(recruitingUploadBatch)
      .where(
        and(
          eq(recruitingUploadBatch.id, batchId),
          eq(recruitingUploadBatch.organizationId, organizationId),
          eq(recruitingUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch) {
      return;
    }
    const orphanItems = await tx
      .select({
        poolItemId: recruitingUploadBatchItem.poolItemId,
        resumeRecordId: recruitingUploadBatchItem.recruitingRecordId,
      })
      .from(recruitingUploadBatchItem)
      .where(orphanCondition);
    const orphanRecordIds = orphanItems.flatMap((item) =>
      item.resumeRecordId ? [item.resumeRecordId] : [],
    );
    if (orphanRecordIds.length > 0) {
      await updateRecruitingRecords(tx, inArray(recruitingRecordReadModel.id, orphanRecordIds), {
        resumeParseError: null,
        resumeParseStatus: "queued",
        updatedAt: new Date(),
      });
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
      .update(recruitingUploadBatchItem)
      .set({ startedAt: null, status: "pending" })
      .where(orphanCondition);
    await tx
      .update(recruitingUploadBatch)
      .set({ status: "pending", updatedAt: new Date() })
      .where(
        and(eq(recruitingUploadBatch.id, batchId), eq(recruitingUploadBatch.status, "running")),
      );
  });
}

export async function reviveRetriableFailures(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ id: recruitingUploadBatch.id })
      .from(recruitingUploadBatch)
      .where(
        and(
          eq(recruitingUploadBatch.id, batchId),
          eq(recruitingUploadBatch.organizationId, organizationId),
          eq(recruitingUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch) {
      return;
    }
    await tx
      .update(recruitingUploadBatchItem)
      .set({
        errorMessage: null,
        finishedAt: null,
        startedAt: null,
        status: "pending",
      })
      .where(
        and(
          eq(recruitingUploadBatchItem.batchId, batchId),
          eq(recruitingUploadBatchItem.status, "failed"),
          inArray(recruitingUploadBatchItem.errorMessage, [...RETRIABLE_FAILURE_MESSAGES]),
        ),
      );
    await tx
      .update(recruitingUploadBatch)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(recruitingUploadBatch.id, batchId));
  });
  await reconcileBatchProgress(batchId);
}

export async function recoverIncompleteBatchItems(
  thresholdSeconds = resumeParseStaleThresholdSeconds(),
): Promise<ResumeParseJobData[]> {
  await db.transaction(async (tx) => {
    const staleItems = await tx
      .select({
        poolItemId: recruitingUploadBatchItem.poolItemId,
        resumeRecordId: recruitingUploadBatchItem.recruitingRecordId,
      })
      .from(recruitingUploadBatchItem)
      .innerJoin(
        recruitingUploadBatch,
        eq(recruitingUploadBatch.id, recruitingUploadBatchItem.batchId),
      )
      .where(
        and(
          inArray(recruitingUploadBatch.status, ["pending", "running"]),
          staleProcessingCondition(thresholdSeconds),
        ),
      );
    const staleRecordIds = staleItems.flatMap((item) =>
      item.resumeRecordId ? [item.resumeRecordId] : [],
    );
    const now = new Date();
    if (staleRecordIds.length > 0) {
      await updateRecruitingRecords(tx, inArray(recruitingRecordReadModel.id, staleRecordIds), {
        resumeParseError: null,
        resumeParseStatus: "queued",
        updatedAt: now,
      });
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
      .update(recruitingUploadBatchItem)
      .set({ startedAt: null, status: "pending" })
      .where(
        and(
          inArray(
            recruitingUploadBatchItem.batchId,
            tx
              .select({ id: recruitingUploadBatch.id })
              .from(recruitingUploadBatch)
              .where(inArray(recruitingUploadBatch.status, ["pending", "running"])),
          ),
          staleProcessingCondition(thresholdSeconds),
        ),
      );
  });

  return db
    .select({
      batchId: recruitingUploadBatchItem.batchId,
      itemId: recruitingUploadBatchItem.id,
      organizationId: recruitingUploadBatch.organizationId,
      userId: recruitingUploadBatch.createdBy,
    })
    .from(recruitingUploadBatchItem)
    .innerJoin(
      recruitingUploadBatch,
      eq(recruitingUploadBatch.id, recruitingUploadBatchItem.batchId),
    )
    .where(
      and(
        inArray(recruitingUploadBatch.status, ["pending", "running"]),
        eq(recruitingUploadBatchItem.status, "pending"),
      ),
    );
}

// 取消：未处理项 → cancelled，batch.status → cancelled。已 succeeded/failed/duplicate_skipped 不动。
// Cancel: pending/processing items become cancelled; batch status flips to cancelled.
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
      .from(recruitingUploadBatch)
      .where(
        and(
          eq(recruitingUploadBatch.id, batchId),
          eq(recruitingUploadBatch.organizationId, organizationId),
          eq(recruitingUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch || batch.status === "completed" || batch.status === "cancelled") {
      return;
    }
    const now = new Date();
    const cancellableItems = await tx
      .select({
        poolItemId: recruitingUploadBatchItem.poolItemId,
        resumeRecordId: recruitingUploadBatchItem.recruitingRecordId,
      })
      .from(recruitingUploadBatchItem)
      .where(
        and(
          eq(recruitingUploadBatchItem.batchId, batchId),
          inArray(recruitingUploadBatchItem.status, ["pending", "processing"]),
        ),
      );
    const recordIds = cancellableItems.flatMap((item) =>
      item.resumeRecordId ? [item.resumeRecordId] : [],
    );
    if (recordIds.length > 0) {
      await deleteRecruitingRecords(tx, inArray(recruitingRecordReadModel.id, recordIds));
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
      .update(recruitingUploadBatchItem)
      .set({ finishedAt: now, recruitingRecordId: null, status: "cancelled" })
      .where(
        and(
          eq(recruitingUploadBatchItem.batchId, batchId),
          inArray(recruitingUploadBatchItem.status, ["pending", "processing"]),
        ),
      );
    await tx
      .update(recruitingUploadBatch)
      .set({ completedAt: now, status: "cancelled", updatedAt: now })
      .where(eq(recruitingUploadBatch.id, batchId));
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

export { deleteBatch } from "./delete-batch";
