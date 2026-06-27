import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { ProcessNextResult } from "@arc/shared/bulk-resume-upload";
import { getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  generateResumeReview,
  parseResumeBytesToProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { ResumeReviewGenerationResult } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { isResumeParseCacheEnabled } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-cache-policy";
import {
  claimNextPendingItem,
  claimPendingItemById,
  loadBatchDetail,
  reconcileBatchProgress,
  toBatchDto,
  toItemDto,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import { projectAttachmentToResumeProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-parser-agent";
import {
  findAttachmentByStorageKey,
  updateParseResultByHash,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import {
  listAllJobDescriptions,
  loadJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  createResumePoolItem,
  markResumePoolItemParsed,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { createResumeRecordFromStorage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage";
import { syncResumeSkills } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";

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

class BatchItemCancelledError extends Error {
  readonly batchId: string;
  readonly itemId: string;

  constructor(batchId: string, itemId: string) {
    super("简历上传任务已取消。");
    this.name = "BatchItemCancelledError";
    this.batchId = batchId;
    this.itemId = itemId;
  }
}

async function loadClaimMissSnapshot(itemId: string) {
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

async function isBatchItemCancelled(batchId: string, itemId: string): Promise<boolean> {
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

async function assertBatchItemNotCancelled(batchId: string, itemId: string): Promise<void> {
  if (await isBatchItemCancelled(batchId, itemId)) {
    throw new BatchItemCancelledError(batchId, itemId);
  }
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

// 拿到 resumeProfile 的两条路径：
//   1) 命中注册表 → 投影 parsedStructured（零额外调用）
//   2) 未命中 / 投影失败 → 从 S3 拉 PDF 现场跑 parseResumeFastToProfile
// Two paths to obtaining resumeProfile: cache hit (projection) or live parse fallback.
async function resolveResumeProfile(item: NonNullable<ItemRow>): Promise<{
  parsed: ParsedResume | null;
  resumeProfile: ParsedResume["resumeProfile"];
  resumeText: string | null;
}> {
  const startedAt = Date.now();
  if (isResumeParseCacheEnabled(process.env)) {
    logStep("cache.lookup.start", { itemId: item.id });
    const cached = await findAttachmentByStorageKey(item.storageKey);
    const fromCache = cached?.parsedStructured
      ? projectAttachmentToResumeProfile(cached.parsedStructured)
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
  const object = await getObjectStream(item.storageKey);
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
  const parsed = await parseResumeBytesToProfile({
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
    await updateParseResultByHash({
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
  notes,
  organizationId,
  resumeReview,
  resumeProfile,
  resumeText,
  userId,
}: {
  item: NonNullable<ItemRow>;
  jobDescriptionId: string | null;
  notes: string | null;
  organizationId: string;
  resumeReview: ResumeReviewGenerationResult["structuredReview"] | null;
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
      notes,
      organizationId,
      resumeFileName: item.originalFileName,
      resumeProfile,
      resumeReview,
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
  await db.transaction(async (tx) => {
    await tx
      .update(studioInterview)
      .set({
        candidateEmail: resumeProfile?.email ?? null,
        candidateName: resumeProfile?.name || item.originalFileName,
        candidatePhone: resumeProfile?.phone ?? null,
        jobDescriptionId,
        notes,
        resumeContentHash: item.contentHash,
        resumeFileName: item.originalFileName,
        resumeParseError: null,
        resumeParseStatus: "ready",
        resumeParsedAt: now,
        resumeProfile,
        resumeReview,
        resumeStorageKey: item.storageKey,
        resumeText,
        targetRole: resumeProfile?.targetRoles?.[0] ?? null,
        updatedAt: now,
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

async function buildJobDescriptionReviewContext(
  organizationId: string,
  jobDescriptionId: string | null,
): Promise<string | null> {
  if (!jobDescriptionId) {
    return null;
  }
  const jd = await loadJobDescriptionById(organizationId, jobDescriptionId);
  if (!jd) {
    return null;
  }
  return [
    `岗位名称：${jd.name}`,
    jd.description ? `岗位描述：${jd.description}` : null,
    `岗位 Prompt：\n${jd.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function generateReviewForParsedResume(input: {
  itemId: string;
  jobDescriptionId: string | null;
  organizationId: string;
  resumeProfile: ParsedResume["resumeProfile"];
}): Promise<ResumeReviewGenerationResult | null> {
  try {
    const startedAt = Date.now();
    logStep("review.generate.start", {
      hasJobDescription: Boolean(input.jobDescriptionId),
      itemId: input.itemId,
    });
    const jobDescription = await buildJobDescriptionReviewContext(
      input.organizationId,
      input.jobDescriptionId,
    );
    const review = await generateResumeReview({
      jobDescription,
      resumeProfile: input.resumeProfile,
    });
    logStep("review.generate.done", {
      durationMs: elapsed(startedAt),
      itemId: input.itemId,
      reviewChars: review.review.length,
    });
    return review.review ? review : null;
  } catch (error) {
    console.error("[bulk-upload] resume review generation failed:", error);
    logStep("review.generate.error", {
      errorMessage: truncate(error instanceof Error ? error.message : String(error)),
      itemId: input.itemId,
    });
    return null;
  }
}

async function resolveJobDescriptionId(input: {
  batchRow: BatchRow;
  itemId: string;
  organizationId: string;
  resumeProfile: ParsedResume["resumeProfile"];
}): Promise<string | null> {
  if (input.batchRow.jdMode === "bind") {
    return input.batchRow.jobDescriptionId;
  }
  if (input.batchRow.jdMode !== "auto" || !input.resumeProfile) {
    return null;
  }
  try {
    const jdStartedAt = Date.now();
    logStep("jd.match.start", { itemId: input.itemId });
    const jds = await listAllJobDescriptions(input.organizationId);
    const match = await matchJobDescriptionForResume(input.resumeProfile, jds);
    const jobDescriptionId = match?.jobDescriptionId ?? null;
    await assertBatchItemNotCancelled(input.batchRow.id, input.itemId);
    logStep("jd.match.done", {
      candidateCount: jds.length,
      durationMs: elapsed(jdStartedAt),
      itemId: input.itemId,
      matched: Boolean(jobDescriptionId),
    });
    return jobDescriptionId;
  } catch (error) {
    if (error instanceof BatchItemCancelledError) {
      throw error;
    }
    // 自动匹配失败不算致命错误：简历仍然入库，只是不绑定岗位。
    // Auto-match failure is non-fatal: the resume still gets imported, just without a JD.
    console.error("[bulk-upload] auto JD match failed:", error);
    return null;
  }
}

async function findDuplicateSkipSnapshot(input: {
  batchRow: BatchRow;
  itemId: string;
  organizationId: string;
  resumeProfile: ParsedResume["resumeProfile"];
}) {
  const shouldSkipDuplicates =
    input.batchRow.dedupPolicy === "skip" &&
    (input.batchRow.target !== "resume_pool" || input.batchRow.resumePoolScope === "private");
  if (!shouldSkipDuplicates) {
    return null;
  }

  const dedupStartedAt = Date.now();
  logStep("dedup.start", { itemId: input.itemId });
  const matches = await findSemanticResumeDuplicates({
    email: input.resumeProfile?.email ?? null,
    name: input.resumeProfile?.name ?? null,
    organizationId: input.organizationId,
    phone: input.resumeProfile?.phone ?? null,
    resumeProfile: input.resumeProfile,
  });
  logStep("dedup.done", {
    durationMs: elapsed(dedupStartedAt),
    itemId: input.itemId,
    matchCount: matches.length,
  });
  return matches.length > 0 ? matches : null;
}

// S3 から PDF を取得してパースし、作成すべき studio_interview の情報を返す。
// Fetch PDF from S3, parse it, and return the info needed to create a studio_interview.
async function fetchAndParse(
  item: NonNullable<ItemRow>,
  batchRow: BatchRow,
  organizationId: string,
  userId: string,
): Promise<{
  succeededPoolItemId: string | null;
  succeededRecordId: string | null;
  dedupSnapshot: unknown;
  isDuplicateSkip: boolean;
}> {
  if (!item.storageKey || item.storageKey.length === 0) {
    // 防御性检查：理论上 Zod + chat_attachment notNull 都已校验，但兜底一次
    // 给出可读错误信息，避免被 AWS SDK 抛"No value provided for input HTTP label: Key"。
    // Defensive: storageKey should be guaranteed non-empty by zod + chat_attachment
    // notNull, but guard once more so we surface a readable message instead of the
    // AWS SDK "No value provided for input HTTP label: Key" stack trace.
    throw new Error("简历文件存储路径为空，无法读取。请重试上传。");
  }

  const { resumeProfile, resumeText } = await resolveResumeProfile(item);
  await assertBatchItemNotCancelled(batchRow.id, item.id);

  const dedupSnapshot = await findDuplicateSkipSnapshot({
    batchRow,
    itemId: item.id,
    organizationId,
    resumeProfile,
  });
  await assertBatchItemNotCancelled(batchRow.id, item.id);
  if (dedupSnapshot) {
    return {
      dedupSnapshot,
      isDuplicateSkip: true,
      succeededPoolItemId: null,
      succeededRecordId: null,
    };
  }

  const jobDescriptionId = await resolveJobDescriptionId({
    batchRow,
    itemId: item.id,
    organizationId,
    resumeProfile,
  });
  const shouldGenerateReview = batchRow.target !== "resume_pool" || Boolean(jobDescriptionId);
  const reviewResult = shouldGenerateReview
    ? await generateReviewForParsedResume({
        itemId: item.id,
        jobDescriptionId,
        organizationId,
        resumeProfile,
      })
    : null;
  await assertBatchItemNotCancelled(batchRow.id, item.id);

  if (batchRow.target === "resume_pool") {
    let { poolItemId } = item;
    await assertBatchItemNotCancelled(batchRow.id, item.id);
    if (poolItemId) {
      await markResumePoolItemParsed({
        actorId: userId,
        jobDescriptionId,
        notes: reviewResult?.review ?? null,
        organizationId,
        poolItemId,
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
        notes: reviewResult?.review ?? null,
        organizationId,
        resumeFileName: item.originalFileName,
        resumeProfile,
        resumeText,
        scope: batchRow.resumePoolScope ?? "private",
        storageKey: item.storageKey,
        targetRole: null,
      });
    }
    return {
      dedupSnapshot: null,
      isDuplicateSkip: false,
      succeededPoolItemId: poolItemId,
      succeededRecordId: null,
    };
  }

  const succeededRecordId = await upsertParsedResumeRecord({
    item,
    jobDescriptionId,
    notes: reviewResult?.review ?? null,
    organizationId,
    resumeProfile,
    resumeReview: reviewResult?.structuredReview ?? null,
    resumeText,
    userId,
  });
  return {
    dedupSnapshot: null,
    isDuplicateSkip: false,
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
    dedupSnapshot: unknown;
    errorMessage: string | null;
    isDuplicateSkip: boolean;
    succeededPoolItemId: string | null;
    succeededRecordId: string | null;
  },
): Promise<void> {
  const startedAt = Date.now();
  let outcomeStatus = "succeeded";
  if (outcome.errorMessage) {
    outcomeStatus = "failed";
  } else if (outcome.isDuplicateSkip) {
    outcomeStatus = "duplicate_skipped";
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
    } else if (outcome.isDuplicateSkip) {
      if (item.resumeRecordId) {
        await tx.delete(studioInterview).where(eq(studioInterview.id, item.resumeRecordId));
      }
      if (item.poolItemId) {
        await tx.delete(resumePoolItem).where(eq(resumePoolItem.id, item.poolItemId));
      }
      await tx
        .update(resumeUploadBatchItem)
        .set({
          dedupMatchSnapshot: outcome.dedupSnapshot as never,
          finishedAt: now,
          poolItemId: null,
          resumeRecordId: null,
          status: "duplicate_skipped",
        })
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

async function loadCancelledProcessResult(
  item: NonNullable<ItemRow>,
  batchRow: BatchRow,
  startedAt: number,
): Promise<ProcessNextResult | null> {
  const detail = await loadBatchDetail(batchRow.id, batchRow.organizationId, batchRow.createdBy);
  if (!detail) {
    return null;
  }
  const updatedItem = detail.items.find((i) => i.id === item.id) ?? toItemDto(item as never);
  logStep("item.process.cancelled", {
    batchId: batchRow.id,
    batchStatus: detail.batch.status,
    durationMs: elapsed(startedAt),
    itemId: item.id,
    itemStatus: updatedItem.status,
  });
  return {
    batch: detail.batch,
    done: detail.batch.status === "completed" || detail.batch.status === "cancelled",
    item: updatedItem,
  };
}

async function processClaimedItem(
  item: NonNullable<ItemRow>,
  batchRow: BatchRow,
): Promise<ProcessNextResult | null> {
  const startedAt = Date.now();
  logStep("item.process.start", {
    batchId: batchRow.id,
    itemId: item.id,
    jdMode: batchRow.jdMode,
    target: batchRow.target,
  });
  let outcome: {
    dedupSnapshot: unknown;
    errorMessage: string | null;
    isDuplicateSkip: boolean;
    succeededPoolItemId: string | null;
    succeededRecordId: string | null;
  } = {
    dedupSnapshot: null,
    errorMessage: null,
    isDuplicateSkip: false,
    succeededPoolItemId: null,
    succeededRecordId: null,
  };

  try {
    const result = await fetchAndParse(item, batchRow, batchRow.organizationId, batchRow.createdBy);
    await assertBatchItemNotCancelled(batchRow.id, item.id);
    outcome = { ...outcome, ...result };
  } catch (error) {
    if (error instanceof BatchItemCancelledError) {
      return loadCancelledProcessResult(item, batchRow, startedAt);
    }
    outcome.errorMessage = truncate(error instanceof Error ? error.message : String(error));
    logStep("item.process.error", {
      batchId: batchRow.id,
      errorMessage: outcome.errorMessage,
      itemId: item.id,
    });
  }

  await writeOutcome(item, batchRow.id, outcome);
  const indexedSourceId = outcome.succeededRecordId ?? outcome.succeededPoolItemId;
  if (!(outcome.errorMessage || indexedSourceId === null)) {
    await enqueueResumeSemanticIndexJobBestEffort({
      organizationId: batchRow.organizationId,
      sourceId: indexedSourceId,
      sourceType: outcome.succeededRecordId ? "studio_interview" : "resume_pool_item",
    });
  }

  const detail = await loadBatchDetail(batchRow.id, batchRow.organizationId, batchRow.createdBy);
  if (!detail) {
    return null;
  }
  const updatedItem = detail.items.find((i) => i.id === item.id) ?? toItemDto(item as never);
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
    done: detail.batch.status === "completed",
    item: updatedItem,
  };
}

export async function processBatchItem(itemId: string): Promise<ProcessNextResult | null> {
  const startedAt = Date.now();
  logStep("job.claim.start", { itemId });
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
  return processClaimedItem(claimed.item, claimed.batchRow);
}

// 処理一個 pending item：拉 S3 → parse → 查重 → 創建 studio_interview → 更新 batch counter。
// 整個流程對調用方暴露一次 HTTP 調用的語義；如果 batch 已經無 pending item，
// 返回 done=true 並把 batch 標 completed（若還未標）。
//
// Process one pending item: pull from S3 → parse → dedup check → create
// studio_interview → update batch counters. Exposed as a single HTTP call's
// worth of work to the caller. When no pending item remains, returns done=true
// and marks the batch completed if not already.
export async function processNextItem(
  batchId: string,
  organizationId: string,
  userId: string,
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
    return { batch: detail.batch, done: detail.batch.status === "completed", item: null };
  }

  return processClaimedItem(claimed.item, claimed.batchRow);
}

export { toBatchDto };
