import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import {
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";
import { reconcileBatchProgress } from "./batches";

export type ResumeParseRetryTarget =
  | { poolItemId: string; resumeRecordId?: never }
  | { poolItemId?: never; resumeRecordId: string };

export type ResumeParseRetryClaim =
  | {
      errorMessage: string;
      job: ResumeParseJobData;
      status: "claimed";
    }
  | { status: "not_failed" | "not_found" };

export type ResumeForceReparseClaim =
  | {
      job: ResumeParseJobData;
      previousStatus: "failed" | "ready" | "unparsed";
      status: "claimed";
    }
  | { status: "busy" | "not_found" | "no_file" };

export type ResumeParseRetryRequest = ResumeParseRetryTarget & {
  organizationId: string;
  requestedBy: string;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isResumeRecordRetryTarget(
  input: ResumeParseRetryTarget,
): input is { resumeRecordId: string } {
  return typeof input.resumeRecordId === "string";
}

async function claimUntrackedFailedResumeParseRetry(
  tx: Tx,
  input: ResumeParseRetryRequest,
): Promise<ResumeParseRetryClaim> {
  const targetsResumeRecord = isResumeRecordRetryTarget(input);
  const resumeRecordSources = targetsResumeRecord
    ? await tx
        .select({
          contentHash: studioInterview.resumeContentHash,
          createdBy: studioInterview.createdBy,
          fileName: studioInterview.resumeFileName,
          jobDescriptionId: studioInterview.jobDescriptionId,
          parseError: studioInterview.resumeParseError,
          parseStatus: studioInterview.resumeParseStatus,
          storageKey: studioInterview.resumeStorageKey,
        })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        )
        .limit(1)
        .for("update")
    : [];
  const poolItemSources = targetsResumeRecord
    ? []
    : await tx
        .select({
          contentHash: resumePoolItem.resumeContentHash,
          createdBy: resumePoolItem.createdBy,
          fileName: resumePoolItem.resumeFileName,
          jobDescriptionId: resumePoolItem.jobDescriptionId,
          parseError: resumePoolItem.resumeParseError,
          parseStatus: resumePoolItem.resumeParseStatus,
          scope: resumePoolItem.scope,
          storageKey: resumePoolItem.resumeStorageKey,
        })
        .from(resumePoolItem)
        .where(
          and(
            eq(resumePoolItem.id, input.poolItemId),
            eq(resumePoolItem.organizationId, input.organizationId),
          ),
        )
        .limit(1)
        .for("update");
  const source = targetsResumeRecord ? resumeRecordSources[0] : poolItemSources[0];
  if (!source) {
    return { status: "not_found" };
  }
  if (source.parseStatus !== "failed") {
    return { status: "not_failed" };
  }
  if (!source.storageKey) {
    return { status: "not_found" };
  }

  const batchId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const now = new Date();
  const resumePoolScope = targetsResumeRecord ? null : (poolItemSources[0]?.scope ?? null);
  const userId = source.createdBy ?? input.requestedBy;
  const batch: typeof resumeUploadBatch.$inferInsert = {
    createdAt: now,
    createdBy: userId,
    dedupPolicy: "create",
    id: batchId,
    jdMode: source.jobDescriptionId ? "bind" : "none",
    jobDescriptionId: source.jobDescriptionId,
    organizationId: input.organizationId,
    resumePoolScope,
    status: "pending",
    target: targetsResumeRecord ? "resume_library" : "resume_pool",
    totalCount: 1,
    updatedAt: now,
  };
  await tx.insert(resumeUploadBatch).values(batch);
  await tx.insert(resumeUploadBatchItem).values({
    attemptCount: 1,
    batchId,
    contentHash: source.contentHash,
    fileSize: 0,
    id: itemId,
    orderIndex: 0,
    organizationId: input.organizationId,
    originalFileName: source.fileName ?? "resume.pdf",
    poolItemId: targetsResumeRecord ? null : input.poolItemId,
    queuedAt: now,
    resumeRecordId: targetsResumeRecord ? input.resumeRecordId : null,
    status: "pending",
    storageKey: source.storageKey,
  });
  const targetUpdate = {
    resumeParseError: null,
    resumeParseStatus: "queued" as const,
    updatedAt: now,
  };
  await (targetsResumeRecord
    ? tx
        .update(studioInterview)
        .set(targetUpdate)
        .where(eq(studioInterview.id, input.resumeRecordId))
    : tx.update(resumePoolItem).set(targetUpdate).where(eq(resumePoolItem.id, input.poolItemId)));
  return {
    errorMessage: source.parseError ?? "简历解析失败。",
    job: {
      batchId,
      itemId,
      organizationId: input.organizationId,
      userId,
    },
    status: "claimed",
  };
}

export async function claimFailedResumeParseRetry(
  input: ResumeParseRetryRequest,
): Promise<ResumeParseRetryClaim> {
  const claim: ResumeParseRetryClaim = await db.transaction(async (tx) => {
    const targetsResumeRecord = isResumeRecordRetryTarget(input);
    const targetCondition = targetsResumeRecord
      ? eq(resumeUploadBatchItem.resumeRecordId, input.resumeRecordId)
      : eq(resumeUploadBatchItem.poolItemId, input.poolItemId);
    const [row] = await tx
      .select({
        batch: resumeUploadBatch,
        item: resumeUploadBatchItem,
      })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
      .where(
        and(
          targetCondition,
          eq(resumeUploadBatch.organizationId, input.organizationId),
          eq(resumeUploadBatch.target, targetsResumeRecord ? "resume_library" : "resume_pool"),
        ),
      )
      .orderBy(desc(resumeUploadBatch.createdAt), desc(resumeUploadBatchItem.queuedAt))
      .limit(1)
      .for("update");
    if (!row) {
      return claimUntrackedFailedResumeParseRetry(tx, input);
    }
    if (row.item.status !== "failed") {
      return { status: "not_failed" };
    }
    const now = new Date();
    const updatedTarget = targetsResumeRecord
      ? await tx
          .update(studioInterview)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
          .where(
            and(
              eq(studioInterview.id, input.resumeRecordId),
              eq(studioInterview.organizationId, input.organizationId),
              eq(studioInterview.resumeParseStatus, "failed"),
            ),
          )
          .returning({ id: studioInterview.id })
      : await tx
          .update(resumePoolItem)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
          .where(
            and(
              eq(resumePoolItem.id, input.poolItemId),
              eq(resumePoolItem.organizationId, input.organizationId),
              eq(resumePoolItem.resumeParseStatus, "failed"),
            ),
          )
          .returning({ id: resumePoolItem.id });
    if (updatedTarget.length === 0) {
      return { status: "not_failed" };
    }

    await tx
      .update(resumeUploadBatchItem)
      .set({
        errorMessage: null,
        finishedAt: null,
        queuedAt: now,
        startedAt: null,
        status: "pending",
      })
      .where(eq(resumeUploadBatchItem.id, row.item.id));
    await tx
      .update(resumeUploadBatch)
      .set({
        completedAt: null,
        failedCount: Math.max(0, row.batch.failedCount - 1),
        processedCount: Math.max(0, row.batch.processedCount - 1),
        status: row.batch.status === "running" ? "running" : "pending",
        updatedAt: now,
      })
      .where(eq(resumeUploadBatch.id, row.batch.id));

    return {
      errorMessage: row.item.errorMessage ?? "简历解析失败。",
      job: {
        batchId: row.batch.id,
        itemId: row.item.id,
        organizationId: row.batch.organizationId,
        userId: row.batch.createdBy,
      },
      status: "claimed",
    };
  });
  return claim;
}

export async function rollbackFailedResumeParseRetry(input: {
  errorMessage: string;
  job: ResumeParseJobData;
  target: ResumeParseRetryTarget & { organizationId: string };
}): Promise<void> {
  const rolledBack = await db.transaction(async (tx) => {
    const rows = await tx
      .update(resumeUploadBatchItem)
      .set({
        errorMessage: input.errorMessage,
        finishedAt: new Date(),
        status: "failed",
      })
      .where(
        and(
          eq(resumeUploadBatchItem.id, input.job.itemId),
          eq(resumeUploadBatchItem.status, "pending"),
        ),
      )
      .returning({ id: resumeUploadBatchItem.id });
    if (rows.length === 0) {
      return false;
    }

    if (isResumeRecordRetryTarget(input.target)) {
      await tx
        .update(studioInterview)
        .set({
          resumeParseError: input.errorMessage,
          resumeParseStatus: "failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(studioInterview.id, input.target.resumeRecordId),
            eq(studioInterview.organizationId, input.target.organizationId),
            eq(studioInterview.resumeParseStatus, "queued"),
          ),
        );
      return true;
    }
    await tx
      .update(resumePoolItem)
      .set({
        resumeParseError: input.errorMessage,
        resumeParseStatus: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(resumePoolItem.id, input.target.poolItemId),
          eq(resumePoolItem.organizationId, input.target.organizationId),
          eq(resumePoolItem.resumeParseStatus, "queued"),
        ),
      );
    return true;
  });
  if (rolledBack) {
    try {
      await reconcileBatchProgress(input.job.batchId);
    } catch (error) {
      console.warn("[resume-parse-retry] failed to reconcile rolled-back batch", {
        batchId: input.job.batchId,
        error,
      });
    }
  }
}

const FORCE_REPARSE_BUSY_STATUSES = new Set(["queued", "processing"]);

/**
 * Admin force reparse: re-queue an existing resume-library record for a full
 * async parse that replaces current structured fields. Unlike the one-shot
 * failed-retry path, this accepts ready/failed/unparsed as long as a file
 * exists and parse is not already in flight.
 */
export function claimForceResumeReparse(input: {
  organizationId: string;
  requestedBy: string;
  resumeRecordId: string;
}): Promise<ResumeForceReparseClaim> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        contentHash: studioInterview.resumeContentHash,
        createdBy: studioInterview.createdBy,
        fileName: studioInterview.resumeFileName,
        jobDescriptionId: studioInterview.jobDescriptionId,
        parseStatus: studioInterview.resumeParseStatus,
        storageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!source) {
      return { status: "not_found" };
    }
    if (!source.storageKey) {
      return { status: "no_file" };
    }
    if (FORCE_REPARSE_BUSY_STATUSES.has(source.parseStatus)) {
      return { status: "busy" };
    }
    const previousStatus: "failed" | "ready" | "unparsed" =
      source.parseStatus === "failed" || source.parseStatus === "unparsed"
        ? source.parseStatus
        : "ready";

    const batchId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const now = new Date();
    const userId = source.createdBy ?? input.requestedBy;
    await tx.insert(resumeUploadBatch).values({
      createdAt: now,
      createdBy: userId,
      dedupPolicy: "create",
      id: batchId,
      jdMode: source.jobDescriptionId ? "bind" : "none",
      jobDescriptionId: source.jobDescriptionId,
      organizationId: input.organizationId,
      resumePoolScope: null,
      status: "pending",
      target: "resume_library",
      totalCount: 1,
      updatedAt: now,
    });
    await tx.insert(resumeUploadBatchItem).values({
      // Keep attemptCount at 1 so assessment artifacts reset when the profile is replaced.
      attemptCount: 1,
      batchId,
      contentHash: source.contentHash,
      fileSize: 0,
      id: itemId,
      orderIndex: 0,
      organizationId: input.organizationId,
      originalFileName: source.fileName ?? "resume.pdf",
      poolItemId: null,
      queuedAt: now,
      resumeRecordId: input.resumeRecordId,
      status: "pending",
      storageKey: source.storageKey,
    });
    await tx
      .update(studioInterview)
      .set({
        resumeParseError: null,
        resumeParseStatus: "queued",
        updatedAt: now,
      })
      .where(eq(studioInterview.id, input.resumeRecordId));

    return {
      job: {
        batchId,
        bypassCache: true,
        itemId,
        organizationId: input.organizationId,
        userId,
      },
      previousStatus,
      status: "claimed",
    };
  });
}

export async function rollbackForceResumeReparse(input: {
  job: ResumeParseJobData;
  previousStatus: "failed" | "ready" | "unparsed";
  resumeRecordId: string;
  organizationId: string;
}): Promise<void> {
  const rolledBack = await db.transaction(async (tx) => {
    const rows = await tx
      .update(resumeUploadBatchItem)
      .set({
        errorMessage: "强制重新解析入队失败。",
        finishedAt: new Date(),
        status: "failed",
      })
      .where(
        and(
          eq(resumeUploadBatchItem.id, input.job.itemId),
          eq(resumeUploadBatchItem.status, "pending"),
        ),
      )
      .returning({ id: resumeUploadBatchItem.id });
    if (rows.length === 0) {
      return false;
    }
    await tx
      .update(studioInterview)
      .set({
        resumeParseStatus: input.previousStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
          eq(studioInterview.resumeParseStatus, "queued"),
        ),
      );
    return true;
  });
  if (rolledBack) {
    try {
      await reconcileBatchProgress(input.job.batchId);
    } catch (error) {
      console.warn("[resume-force-reparse] failed to reconcile rolled-back batch", {
        batchId: input.job.batchId,
        error,
      });
    }
  }
}
