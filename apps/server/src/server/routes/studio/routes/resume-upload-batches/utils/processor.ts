import { and, eq } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import {
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { ProcessNextResult } from "@arc/shared/bulk-resume-upload";
import { getObjectStream } from "@app/server/lib/server/s3";
import { parseResumeBytesToProfile } from "@app/server/server/agents/resume-analysis-agent";
import { isResumeParseCacheEnabled } from "@app/server/lib/server/resume-parse-cache-policy";
import { isResumeParseCacheSourceCompatible } from "@app/server/lib/server/resume-parse-provider";
import { isResumeStructuredSourceFileNameCompatible } from "@arc/db-schema/resume-parser-schema";
import type { toItemDto } from "@app/server/server/routes/studio/routes/resume-upload-batches/dao/batches";
import {
  claimNextPendingItem,
  claimPendingItemById,
  loadBatchDetail,
  reconcileBatchProgress,
  toBatchDto,
} from "@app/server/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { projectAttachmentToResumeProfile } from "@app/server/server/agents/resume-parser-agent";
import {
  findAttachmentByStorageKey,
  updateParseResultByHash,
} from "@app/server/server/routes/chat/dao/chat-attachments";
import {
  createResumePoolItem,
  markResumePoolItemParsed,
} from "@app/server/server/routes/studio/routes/resume-pool/dao";
import { createResumeRecordFromStorage } from "@app/server/server/routes/studio/routes/resumes/utils/create-from-storage";
import { syncResumeSkills } from "@app/server/server/routes/studio/routes/resumes/dao/skills";
import {
  completeParsedResumeEnrichment,
  defaultParsedResumeEnrichmentDependencies,
  generateParsedResumeQuestionsBestEffort,
} from "./parsed-resume-enrichment";
import type { ParsedResumeEnrichmentDependencies } from "./parsed-resume-enrichment";
import {
  assertBatchItemNotCancelled,
  getClaimMissRetryError,
  isBatchItemCancelled,
  isBatchItemCancelledError,
  loadClaimMissSnapshot,
  releaseBatchItemForRetry,
} from "./processor-claims";

export { getClaimMissRetryError } from "./processor-claims";

const ERROR_MESSAGE_MAX = 500;

function truncate(s: string): string {
  return s.length > ERROR_MESSAGE_MAX ? `${s.slice(0, ERROR_MESSAGE_MAX - 1)}…` : s;
}

function logStep(
  step: string,
  data: Record<string, boolean | number | string | null | undefined>,
): void {
  console.info("[bulk-upload-worker]", { step, ...data });
}

function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

type ItemRow = Awaited<ReturnType<typeof claimNextPendingItem>>;
type BatchRow = typeof resumeUploadBatch.$inferSelect;
type ParsedResume = Awaited<ReturnType<typeof parseResumeBytesToProfile>>;

export interface ResumeUploadBatchProcessorDependencies extends ParsedResumeEnrichmentDependencies {
  findAttachmentByStorageKey: typeof findAttachmentByStorageKey;
  getObjectStream: typeof getObjectStream;
  parseResumeBytesToProfile: typeof parseResumeBytesToProfile;
  projectAttachmentToResumeProfile: typeof projectAttachmentToResumeProfile;
  updateParseResultByHash: typeof updateParseResultByHash;
}

export const defaultResumeUploadBatchProcessorDependencies: ResumeUploadBatchProcessorDependencies =
  {
    ...defaultParsedResumeEnrichmentDependencies,
    findAttachmentByStorageKey,
    getObjectStream,
    parseResumeBytesToProfile,
    projectAttachmentToResumeProfile,
    updateParseResultByHash,
  };

interface ProcessingOutcome {
  autoMatchJobDescription: boolean;
  errorMessage: string | null;
  jobDescriptionId: string | null;
  succeededPoolItemId: string | null;
  succeededRecordId: string | null;
}

function fallbackItemDto(item: NonNullable<ItemRow>): ReturnType<typeof toItemDto> {
  return {
    batchId: item.batchId,
    contentHash: item.contentHash,
    dedupMatchSnapshot: item.dedupMatchSnapshot,
    errorMessage: item.errorMessage,
    fileSize: item.fileSize,
    finishedAt: item.finishedAt ? item.finishedAt.toISOString() : null,
    id: item.id,
    orderIndex: item.orderIndex,
    originalFileName: item.originalFileName,
    poolItemId: item.poolItemId,
    resumeRecordId: item.resumeRecordId,
    startedAt: item.startedAt ? item.startedAt.toISOString() : null,
    status: item.status,
  };
}

// 拿到 resumeProfile 的两条路径：
//   1) 命中注册表 → 投影 parsedStructured（零额外调用）
//   2) 未命中 / 投影失败 → 从 S3 拉 PDF 现场跑 parseResumeFastToProfile
// Two paths to obtaining resumeProfile: cache hit (projection) or live parse fallback.
// Admin force-reparse sets bypassCache so path 1 is skipped and S3 is re-parsed.
async function resolveResumeProfile(
  item: NonNullable<ItemRow>,
  options: { bypassCache?: boolean } = {},
  dependencies: ResumeUploadBatchProcessorDependencies = defaultResumeUploadBatchProcessorDependencies,
): Promise<{
  parsed: ParsedResume | null;
  resumeProfile: ParsedResume["resumeProfile"];
  resumeText: string | null;
}> {
  const startedAt = Date.now();
  if (options.bypassCache) {
    logStep("cache.lookup.bypassed", { itemId: item.id });
  } else if (isResumeParseCacheEnabled(process.env)) {
    logStep("cache.lookup.start", { itemId: item.id });
    const cached = await dependencies.findAttachmentByStorageKey(item.storageKey);
    const fromCache =
      cached?.parsedStructured &&
      isResumeParseCacheSourceCompatible(cached.parsedTextSource) &&
      isResumeStructuredSourceFileNameCompatible(cached.parsedStructured, item.originalFileName)
        ? dependencies.projectAttachmentToResumeProfile(cached.parsedStructured)
        : null;
    if (fromCache) {
      logStep("cache.lookup.hit", { durationMs: elapsed(startedAt), itemId: item.id });
      return { parsed: null, resumeProfile: fromCache, resumeText: cached?.parsedText ?? null };
    }
    logStep("cache.lookup.miss", { durationMs: elapsed(startedAt), itemId: item.id });
  } else {
    logStep("cache.lookup.disabled", { itemId: item.id });
  }
  const s3StartedAt = Date.now();
  logStep("s3.get.start", { itemId: item.id });
  const object = await dependencies.getObjectStream(item.storageKey);
  if (!object) {
    throw new Error("简历文件不可用（S3 对象缺失）。");
  }
  logStep("s3.get.done", {
    contentLength: object.contentLength,
    durationMs: elapsed(s3StartedAt),
    itemId: item.id,
  });
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  const parseStartedAt = Date.now();
  logStep("parse.start", { fileSize: bytes.byteLength, itemId: item.id });
  const parsed = await dependencies.parseResumeBytesToProfile({
    bytes,
    fileName: item.originalFileName,
    mediaType: object.contentType ?? "application/octet-stream",
  });
  logStep("parse.done", {
    durationMs: elapsed(parseStartedAt),
    hasProfile: Boolean(parsed.resumeProfile),
    itemId: item.id,
    pageCount: parsed.parsedPageCount,
    textSource: parsed.parsedTextSource,
  });
  if (item.contentHash) {
    const cacheWriteStartedAt = Date.now();
    logStep("cache.write.start", { itemId: item.id });
    await dependencies.updateParseResultByHash({
      contentHash: item.contentHash,
      parsedPageCount: parsed.parsedPageCount,
      parsedStatus: "ready",
      parsedStructured: parsed.parsedStructured,
      parsedText: parsed.parsedText,
      parsedTextSource: parsed.parsedTextSource,
    });
    logStep("cache.write.done", { durationMs: elapsed(cacheWriteStartedAt), itemId: item.id });
  }
  return { parsed, resumeProfile: parsed.resumeProfile, resumeText: parsed.parsedText };
}

async function upsertParsedResumeRecord({
  item,
  jobDescriptionId,
  organizationId,
  resumeProfile,
  resumeText,
  userId,
}: {
  item: NonNullable<ItemRow>;
  jobDescriptionId: string | null;
  organizationId: string;
  resumeProfile: ParsedResume["resumeProfile"];
  resumeText: string | null;
  userId: string;
}): Promise<string> {
  const startedAt = Date.now();
  logStep("record.upsert.start", {
    hasPlaceholder: Boolean(item.resumeRecordId),
    itemId: item.id,
  });
  if (!item.resumeRecordId) {
    const recordId = await createResumeRecordFromStorage({
      candidateEmail: null,
      candidateName: null,
      candidatePhone: null,
      contentHash: item.contentHash,
      jobDescriptionId,
      notes: null,
      organizationId,
      resumeFileName: item.originalFileName,
      resumeParseStatus: "processing",
      resumeProfile,
      resumeReview: null,
      resumeReviewError: null,
      resumeReviewStatus: "idle",
      resumeScreeningError: null,
      resumeScreeningResult: null,
      resumeScreeningStatus: "idle",
      resumeText,
      storageKey: item.storageKey,
      targetRole: null,
      userId,
    });
    logStep("record.upsert.done", {
      durationMs: elapsed(startedAt),
      itemId: item.id,
      recordId,
    });
    return recordId;
  }
  const recordId = item.resumeRecordId;

  const now = new Date();
  const assessmentReset =
    item.attemptCount > 1
      ? {}
      : {
          resumeReview: null,
          resumeReviewError: null,
          resumeReviewGeneratedAt: null,
          resumeReviewRunId: null,
          resumeReviewStatus: "idle" as const,
          resumeScreeningError: null,
          resumeScreeningEvaluatedAt: null,
          resumeScreeningResult: null,
          resumeScreeningStatus: "idle" as const,
        };
  await db.transaction(async (tx) => {
    await tx
      .update(studioInterview)
      .set({
        candidateEmail: resumeProfile?.email ?? null,
        candidateName: resumeProfile?.name || item.originalFileName,
        candidatePhone: resumeProfile?.phone ?? null,
        jobDescriptionId,
        notes: null,
        resumeContentHash: item.contentHash,
        resumeFileName: item.originalFileName,
        resumeParseError: null,
        resumeParseStatus: "processing",
        resumeParsedAt: now,
        resumeProfile,
        resumeStorageKey: item.storageKey,
        resumeText,
        targetRole: resumeProfile?.targetRoles?.[0] ?? null,
        updatedAt: now,
        ...assessmentReset,
      })
      .where(
        and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, organizationId)),
      );
    await syncResumeSkills(tx, {
      interviewId: recordId,
      organizationId,
      skills: resumeProfile?.skills,
    });
  });
  logStep("record.upsert.done", {
    durationMs: elapsed(startedAt),
    itemId: item.id,
    recordId,
  });
  return recordId;
}

// S3 から PDF を取得してパースし、閲覧可能な基本レコードまで永続化する。
// Fetch and parse the PDF, then persist the base record needed for immediate viewing.
async function fetchAndParse(
  item: NonNullable<ItemRow>,
  batchRow: BatchRow,
  organizationId: string,
  userId: string,
  options: { bypassCache?: boolean } = {},
  dependencies: ResumeUploadBatchProcessorDependencies = defaultResumeUploadBatchProcessorDependencies,
): Promise<{
  autoMatchJobDescription: boolean;
  jobDescriptionId: string | null;
  succeededPoolItemId: string | null;
  succeededRecordId: string | null;
}> {
  if (!item.storageKey || item.storageKey.length === 0) {
    // 防御性检查：理论上 Zod + chat_attachment notNull 都已校验，但兜底一次
    // 给出可读错误信息，避免被 AWS SDK 抛"No value provided for input HTTP label: Key"。
    // Defensive: storageKey should be guaranteed non-empty by zod + chat_attachment
    // notNull, but guard once more so we surface a readable message instead of the
    // AWS SDK "No value provided for input HTTP label: Key" stack trace.
    throw new Error("简历文件存储路径为空，无法读取。请重试上传。");
  }

  const { resumeProfile, resumeText } = await resolveResumeProfile(item, options, dependencies);
  await assertBatchItemNotCancelled(batchRow.id, item.id);

  const autoMatchJobDescription = batchRow.jdMode === "auto";
  const jobDescriptionId = batchRow.jdMode === "bind" ? batchRow.jobDescriptionId : null;

  if (batchRow.target === "resume_pool") {
    let { poolItemId } = item;
    await assertBatchItemNotCancelled(batchRow.id, item.id);
    if (poolItemId) {
      await markResumePoolItemParsed({
        actorId: userId,
        jobDescriptionId,
        notes: null,
        organizationId,
        poolItemId,
        resumeParseStatus: "ready",
        resumeProfile,
        resumeText,
      });
    } else {
      poolItemId = await createResumePoolItem({
        candidateEmail: null,
        candidateName: null,
        candidatePhone: null,
        contentHash: item.contentHash,
        createdBy: userId,
        jobDescriptionId,
        notes: null,
        organizationId,
        resumeFileName: item.originalFileName,
        resumeParseStatus: "ready",
        resumeProfile,
        resumeText,
        scope: batchRow.resumePoolScope ?? "private",
        storageKey: item.storageKey,
        targetRole: null,
      });
    }
    return {
      autoMatchJobDescription,
      jobDescriptionId,
      succeededPoolItemId: poolItemId,
      succeededRecordId: null,
    };
  }

  const succeededRecordId = await upsertParsedResumeRecord({
    item,
    jobDescriptionId,
    organizationId,
    resumeProfile,
    resumeText,
    userId,
  });
  return {
    autoMatchJobDescription,
    jobDescriptionId,
    succeededPoolItemId: null,
    succeededRecordId,
  };
}

// 結果を DB に書き戻し、batch カウンターを更新する。
// Write the outcome back to DB and update batch counters.
async function writeOutcome(
  item: NonNullable<ItemRow>,
  batchId: string,
  outcome: {
    errorMessage: string | null;
    succeededPoolItemId: string | null;
    succeededRecordId: string | null;
  },
): Promise<void> {
  const startedAt = Date.now();
  let outcomeStatus = "succeeded";
  if (outcome.errorMessage) {
    outcomeStatus = "failed";
  }
  logStep("outcome.write.start", {
    batchId,
    itemId: item.id,
    status: outcomeStatus,
  });
  await db.transaction(async (tx) => {
    const now = new Date();
    if (outcome.errorMessage) {
      if (item.resumeRecordId) {
        await tx
          .update(studioInterview)
          .set({
            resumeParseError: outcome.errorMessage,
            resumeParseStatus: "failed",
            updatedAt: now,
          })
          .where(eq(studioInterview.id, item.resumeRecordId));
      }
      if (item.poolItemId) {
        await tx
          .update(resumePoolItem)
          .set({
            resumeParseError: outcome.errorMessage,
            resumeParseStatus: "failed",
            updatedAt: now,
          })
          .where(eq(resumePoolItem.id, item.poolItemId));
      }
      await tx
        .update(resumeUploadBatchItem)
        .set({ errorMessage: outcome.errorMessage, finishedAt: now, status: "failed" })
        .where(eq(resumeUploadBatchItem.id, item.id));
    } else {
      await tx
        .update(resumeUploadBatchItem)
        .set({
          finishedAt: now,
          poolItemId: outcome.succeededPoolItemId,
          resumeRecordId: outcome.succeededRecordId,
          status: "succeeded",
        })
        .where(eq(resumeUploadBatchItem.id, item.id));
    }

    // 完了チェック: processed == total かつ terminal でなければ completed にする。
    // Completion check: if processed == total and not terminal, flip to completed.
  });
  logStep("outcome.write.done", {
    batchId,
    durationMs: elapsed(startedAt),
    itemId: item.id,
    status: outcomeStatus,
  });
  const reconcileStartedAt = Date.now();
  logStep("batch.reconcile.start", { batchId, itemId: item.id });
  await reconcileBatchProgress(batchId);
  logStep("batch.reconcile.done", {
    batchId,
    durationMs: elapsed(reconcileStartedAt),
    itemId: item.id,
  });
}

function isTerminalBatchStatus(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

async function loadCancelledProcessResult(
  item: NonNullable<ItemRow>,
  batchRow: BatchRow,
  startedAt: number,
): Promise<ProcessNextResult | null> {
  const detail = await loadBatchDetail(batchRow.id, batchRow.organizationId, batchRow.createdBy);
  if (!detail) {
    return null;
  }
  const updatedItem = detail.items.find((i) => i.id === item.id) ?? fallbackItemDto(item);
  logStep("item.process.cancelled", {
    batchId: batchRow.id,
    batchStatus: detail.batch.status,
    durationMs: elapsed(startedAt),
    itemId: item.id,
    itemStatus: updatedItem.status,
  });
  return {
    batch: detail.batch,
    done: isTerminalBatchStatus(detail.batch.status),
    item: updatedItem,
  };
}

async function processClaimedItem(
  item: NonNullable<ItemRow>,
  batchRow: BatchRow,
  options: { bypassCache?: boolean; retryParseFailure?: boolean } = {},
  dependencies: ResumeUploadBatchProcessorDependencies = defaultResumeUploadBatchProcessorDependencies,
): Promise<ProcessNextResult | null> {
  const startedAt = Date.now();
  logStep("item.process.start", {
    batchId: batchRow.id,
    bypassCache: Boolean(options.bypassCache),
    itemId: item.id,
    jdMode: batchRow.jdMode,
    target: batchRow.target,
  });
  let outcome: ProcessingOutcome = {
    autoMatchJobDescription: false,
    errorMessage: null,
    jobDescriptionId: null,
    succeededPoolItemId: null,
    succeededRecordId: null,
  };

  try {
    const result = await fetchAndParse(
      item,
      batchRow,
      batchRow.organizationId,
      batchRow.createdBy,
      options,
      dependencies,
    );
    await assertBatchItemNotCancelled(batchRow.id, item.id);
    outcome = { ...outcome, ...result };
  } catch (error) {
    if (isBatchItemCancelledError(error)) {
      return loadCancelledProcessResult(item, batchRow, startedAt);
    }
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    if (options.retryParseFailure) {
      await releaseBatchItemForRetry(batchRow.id, item.id);
      throw normalizedError;
    }
    outcome.errorMessage = truncate(normalizedError.message);
    logStep("item.process.error", {
      batchId: batchRow.id,
      errorMessage: outcome.errorMessage,
      itemId: item.id,
    });
  }

  // Cancel can land after parse/error handling but before outcome write — never
  // overwrite cancelled items with succeeded/failed, and signal the worker to stop.
  if (await isBatchItemCancelled(batchRow.id, item.id)) {
    return loadCancelledProcessResult(item, batchRow, startedAt);
  }

  if (!outcome.errorMessage) {
    try {
      await generateParsedResumeQuestionsBestEffort(
        {
          organizationId: batchRow.organizationId,
          resumeRecordId: outcome.succeededRecordId,
        },
        dependencies,
      );
      if (await isBatchItemCancelled(batchRow.id, item.id)) {
        return loadCancelledProcessResult(item, batchRow, startedAt);
      }
      await completeParsedResumeEnrichment(
        {
          ...outcome,
          generationToken: item.id,
          organizationId: batchRow.organizationId,
        },
        dependencies,
      );
    } catch (error) {
      await releaseBatchItemForRetry(batchRow.id, item.id);
      throw error;
    }
  }
  await writeOutcome(item, batchRow.id, outcome);

  const detail = await loadBatchDetail(batchRow.id, batchRow.organizationId, batchRow.createdBy);
  if (!detail) {
    return null;
  }
  const updatedItem = detail.items.find((i) => i.id === item.id) ?? fallbackItemDto(item);
  logStep("item.process.done", {
    batchId: batchRow.id,
    batchStatus: detail.batch.status,
    durationMs: elapsed(startedAt),
    itemId: item.id,
    itemStatus: updatedItem.status,
    processedCount: detail.batch.processedCount,
    totalCount: detail.batch.totalCount,
  });
  return {
    batch: detail.batch,
    // cancelled batches are also terminal — worker must not keep polling items.
    done: isTerminalBatchStatus(detail.batch.status),
    item: updatedItem,
  };
}

export async function processBatchItem(
  itemId: string,
  options: { bypassCache?: boolean; retryParseFailure?: boolean } = {},
  dependencies: ResumeUploadBatchProcessorDependencies = defaultResumeUploadBatchProcessorDependencies,
): Promise<ProcessNextResult | null> {
  const startedAt = Date.now();
  logStep("job.claim.start", { bypassCache: Boolean(options.bypassCache), itemId });
  const claimed = await db.transaction(async (tx) => {
    const item = await claimPendingItemById(tx, itemId);
    if (!item) {
      return null;
    }
    const [batchRow] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, item.batchId))
      .limit(1);
    if (!batchRow || batchRow.status === "cancelled" || batchRow.status === "completed") {
      return null;
    }
    return { batchRow, item };
  });

  if (!claimed) {
    const snapshot = await loadClaimMissSnapshot(itemId);
    logStep("job.claim.empty", {
      batchId: snapshot?.batchId,
      durationMs: elapsed(startedAt),
      itemFound: Boolean(snapshot),
      itemId,
      itemStartedAt: snapshot?.startedAt?.toISOString(),
      itemStatus: snapshot?.status,
    });
    const retryError = getClaimMissRetryError(snapshot, itemId);
    if (retryError) {
      throw retryError;
    }
    return null;
  }
  logStep("job.claim.done", {
    batchId: claimed.batchRow.id,
    durationMs: elapsed(startedAt),
    itemId: claimed.item.id,
  });
  return processClaimedItem(claimed.item, claimed.batchRow, options, dependencies);
}

// 処理一個 pending item：拉 S3 → parse → 創建可閲覧記録 → 派發 enrichment → 更新 batch counter。
// 整個流程對調用方暴露一次 HTTP 調用的語義；如果 batch 已經無 pending item，
// 返回 done=true 並把 batch 標 completed（若還未標）。
//
// Process one pending item: pull from S3 → parse → persist a viewable record →
// enqueue enrichment → update batch counters. Exposed as a single HTTP call's
// worth of work to the caller. When no pending item remains, returns done=true
// and marks the batch completed if not already.
export async function processNextItem(
  batchId: string,
  organizationId: string,
  userId: string,
  dependencies: ResumeUploadBatchProcessorDependencies = defaultResumeUploadBatchProcessorDependencies,
): Promise<ProcessNextResult | null> {
  // 1) Claim next item inside a transaction.
  const claimed = await db.transaction(async (tx) => {
    const [batchRow] = await tx
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
    if (!batchRow) {
      return null;
    }
    if (batchRow.status === "cancelled" || batchRow.status === "completed") {
      return { batchRow, item: null };
    }
    const item = await claimNextPendingItem(tx, batchId);
    return { batchRow, item };
  });

  if (!claimed) {
    return null;
  }

  // No pending item — handle completion.
  if (!claimed.item) {
    const detail = await loadBatchDetail(batchId, organizationId, userId);
    if (!detail) {
      return null;
    }
    const isComplete =
      detail.batch.processedCount === detail.batch.totalCount &&
      detail.batch.status !== "completed" &&
      detail.batch.status !== "cancelled";
    if (isComplete) {
      const now = new Date();
      await db
        .update(resumeUploadBatch)
        .set({ completedAt: now, status: "completed", updatedAt: now })
        .where(eq(resumeUploadBatch.id, batchId));
      const fresh = await loadBatchDetail(batchId, organizationId, userId);
      return { batch: fresh?.batch ?? detail.batch, done: true, item: null };
    }
    return {
      batch: detail.batch,
      done: isTerminalBatchStatus(detail.batch.status),
      item: null,
    };
  }

  return processClaimedItem(claimed.item, claimed.batchRow, {}, dependencies);
}

export function createResumeUploadBatchProcessor(
  dependencies: ResumeUploadBatchProcessorDependencies,
) {
  return {
    processBatchItem: (
      itemId: string,
      options: { bypassCache?: boolean; retryParseFailure?: boolean } = {},
    ) => processBatchItem(itemId, options, dependencies),
    processNextItem: (batchId: string, organizationId: string, userId: string) =>
      processNextItem(batchId, organizationId, userId, dependencies),
  };
}

export { toBatchDto };
