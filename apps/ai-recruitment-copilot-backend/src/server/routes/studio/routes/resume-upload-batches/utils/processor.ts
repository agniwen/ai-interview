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
import { queryInterviewDedup } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";

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

// 拿到 resumeProfile 的两条路径：
//   1) 命中注册表 → 投影 parsedStructured（零额外调用）
//   2) 未命中 / 投影失败 → 从 S3 拉 PDF 现场跑 parseResumeFastToProfile
// Two paths to obtaining resumeProfile: cache hit (projection) or live parse fallback.
async function resolveResumeProfile(
  item: NonNullable<ItemRow>,
): Promise<{ parsed: ParsedResume | null; resumeProfile: ParsedResume["resumeProfile"] }> {
  const startedAt = Date.now();
  if (isResumeParseCacheEnabled(process.env)) {
    logStep("cache.lookup.start", { itemId: item.id });
    const cached = await findAttachmentByStorageKey(item.storageKey);
    const fromCache = cached?.parsedStructured
      ? projectAttachmentToResumeProfile(cached.parsedStructured)
      : null;
    if (fromCache) {
      logStep("cache.lookup.hit", { durationMs: elapsed(startedAt), itemId: item.id });
      return { parsed: null, resumeProfile: fromCache };
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
    mediaType: object.contentType ?? "application/pdf",
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
  return { parsed, resumeProfile: parsed.resumeProfile };
}

async function upsertParsedResumeRecord({
  item,
  jobDescriptionId,
  notes,
  organizationId,
  resumeProfile,
  userId,
}: {
  item: NonNullable<ItemRow>;
  jobDescriptionId: string | null;
  notes: string | null;
  organizationId: string;
  resumeProfile: ParsedResume["resumeProfile"];
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
        resumeStorageKey: item.storageKey,
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
}): Promise<string | null> {
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
      reviewChars: review.length,
    });
    return review || null;
  } catch (error) {
    console.error("[bulk-upload] resume review generation failed:", error);
    logStep("review.generate.error", {
      errorMessage: truncate(error instanceof Error ? error.message : String(error)),
      itemId: input.itemId,
    });
    return null;
  }
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

  const { resumeProfile } = await resolveResumeProfile(item);

  if (batchRow.target === "resume_pool") {
    let { poolItemId } = item;
    if (poolItemId) {
      await markResumePoolItemParsed({
        actorId: userId,
        organizationId,
        poolItemId,
        resumeProfile,
      });
    } else {
      poolItemId = await createResumePoolItem({
        candidateEmail: null,
        candidateName: null,
        candidatePhone: null,
        contentHash: item.contentHash,
        createdBy: userId,
        jobDescriptionId: null,
        notes: null,
        organizationId,
        resumeFileName: item.originalFileName,
        resumeProfile,
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

  // 查重 / Dedup check
  if (batchRow.dedupPolicy === "skip") {
    const dedupStartedAt = Date.now();
    logStep("dedup.start", { itemId: item.id });
    const matches = await queryInterviewDedup(organizationId, {
      email: resumeProfile?.email ?? null,
      name: resumeProfile?.name ?? null,
      phone: resumeProfile?.phone ?? null,
    });
    logStep("dedup.done", {
      durationMs: elapsed(dedupStartedAt),
      itemId: item.id,
      matchCount: matches.length,
    });
    if (matches.length > 0) {
      return {
        dedupSnapshot: matches,
        isDuplicateSkip: true,
        succeededPoolItemId: null,
        succeededRecordId: null,
      };
    }
  }

  // jdMode 分支：
  //   "bind" → 直接用 batch.jobDescriptionId
  //   "auto" → 复用已解析的 resumeProfile + 全部在招岗位，调用 matchJobDescriptionForResume
  //            agent 选一个最匹配的；只有 0 个候选岗位或 agent 无匹配时回退到 null
  //   "none" → 不绑定
  // 注意：auto 路径不会重新解析 PDF，沿用上面 parseResumeFastToProfile 的结果。
  //
  // jdMode dispatch:
  //   "bind" → use batch.jobDescriptionId verbatim
  //   "auto" → reuse the already-parsed resumeProfile to run the JD-match agent
  //            against this org's JD list; falls back to null when there are no
  //            JDs or the agent returns no match
  //   "none" → no JD binding
  // The auto path does NOT re-parse the PDF — it reuses the profile parsed above.
  let jobDescriptionId: string | null = null;
  if (batchRow.jdMode === "bind") {
    ({ jobDescriptionId } = batchRow);
  } else if (batchRow.jdMode === "auto" && resumeProfile) {
    try {
      const jdStartedAt = Date.now();
      logStep("jd.match.start", { itemId: item.id });
      const jds = await listAllJobDescriptions(organizationId);
      const match = await matchJobDescriptionForResume(resumeProfile, jds);
      jobDescriptionId = match?.jobDescriptionId ?? null;
      logStep("jd.match.done", {
        candidateCount: jds.length,
        durationMs: elapsed(jdStartedAt),
        itemId: item.id,
        matched: Boolean(jobDescriptionId),
      });
    } catch (error) {
      // 自动匹配失败不算致命错误：简历仍然入库，只是不绑定岗位。
      // Auto-match failure is non-fatal: the resume still gets imported, just without a JD.
      console.error("[bulk-upload] auto JD match failed:", error);
    }
  }
  const notes = await generateReviewForParsedResume({
    itemId: item.id,
    jobDescriptionId,
    organizationId,
    resumeProfile,
  });
  const succeededRecordId = await upsertParsedResumeRecord({
    item,
    jobDescriptionId,
    notes,
    organizationId,
    resumeProfile,
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
      await tx
        .update(resumeUploadBatchItem)
        .set({
          dedupMatchSnapshot: outcome.dedupSnapshot as never,
          finishedAt: now,
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
    outcome = { ...outcome, ...result };
  } catch (error) {
    outcome.errorMessage = truncate(error instanceof Error ? error.message : String(error));
    logStep("item.process.error", {
      batchId: batchRow.id,
      errorMessage: outcome.errorMessage,
      itemId: item.id,
    });
  }

  await writeOutcome(item, batchRow.id, outcome);

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
