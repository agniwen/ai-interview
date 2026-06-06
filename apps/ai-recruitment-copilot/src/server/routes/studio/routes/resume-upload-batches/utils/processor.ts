import { and, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { resumeUploadBatch, resumeUploadBatchItem } from "@arc/db-schema/schema";
import type { ProcessNextResult } from "@/lib/shared/bulk-resume-upload";
import { getObjectStream } from "@/lib/server/s3";
import { parseResumeFastToProfile } from "@/server/agents/resume-analysis-agent";
import {
  claimNextPendingItem,
  loadBatchDetail,
  toBatchDto,
  toItemDto,
} from "@/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { matchJobDescriptionForResume } from "@/server/agents/job-description-match-agent";
import { projectAttachmentToResumeProfile } from "@/server/agents/resume-parser-agent";
import { findAttachmentByStorageKey } from "@/server/routes/chat/dao/chat-attachments";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { createResumeRecordFromStorage } from "@/server/routes/studio/routes/resumes/utils/create-from-storage";
import { queryInterviewDedup } from "@/server/routes/studio/routes/interviews/dao/studio-interviews";

const ERROR_MESSAGE_MAX = 500;

function truncate(s: string): string {
  return s.length > ERROR_MESSAGE_MAX ? `${s.slice(0, ERROR_MESSAGE_MAX - 1)}…` : s;
}

type ItemRow = Awaited<ReturnType<typeof claimNextPendingItem>>;

// 拿到 resumeProfile 的两条路径：
//   1) 命中注册表 → 投影 parsedStructured（零额外调用）
//   2) 未命中 / 投影失败 → 从 S3 拉 PDF 现场跑 parseResumeFastToProfile
// Two paths to obtaining resumeProfile: cache hit (projection) or live parse fallback.
async function resolveResumeProfile(item: NonNullable<ItemRow>) {
  const cached = await findAttachmentByStorageKey(item.storageKey);
  const fromCache = cached?.parsedStructured
    ? projectAttachmentToResumeProfile(cached.parsedStructured)
    : null;
  if (fromCache) {
    return fromCache;
  }
  const object = await getObjectStream(item.storageKey);
  if (!object) {
    throw new Error("简历文件不可用（S3 对象缺失）。");
  }
  const arrayBuffer = await new Response(object.body).arrayBuffer();
  const file = new File([new Uint8Array(arrayBuffer)], item.originalFileName, {
    type: object.contentType ?? "application/pdf",
  });
  const parsed = await parseResumeFastToProfile(file);
  return parsed.resumeProfile;
}

// S3 から PDF を取得してパースし、作成すべき studio_interview の情報を返す。
// Fetch PDF from S3, parse it, and return the info needed to create a studio_interview.
async function fetchAndParse(
  item: NonNullable<ItemRow>,
  batchRow: { dedupPolicy: string; jdMode: string; jobDescriptionId: string | null },
  organizationId: string,
  userId: string,
): Promise<{ succeededRecordId: string | null; dedupSnapshot: unknown; isDuplicateSkip: boolean }> {
  if (!item.storageKey || item.storageKey.length === 0) {
    // 防御性检查：理论上 Zod + chat_attachment notNull 都已校验，但兜底一次
    // 给出可读错误信息，避免被 AWS SDK 抛"No value provided for input HTTP label: Key"。
    // Defensive: storageKey should be guaranteed non-empty by zod + chat_attachment
    // notNull, but guard once more so we surface a readable message instead of the
    // AWS SDK "No value provided for input HTTP label: Key" stack trace.
    throw new Error("简历文件存储路径为空，无法读取。请重试上传。");
  }

  const resumeProfile = await resolveResumeProfile(item);

  // 查重 / Dedup check
  if (batchRow.dedupPolicy === "skip") {
    const matches = await queryInterviewDedup(organizationId, {
      email: resumeProfile?.email ?? null,
      name: resumeProfile?.name ?? null,
      phone: resumeProfile?.phone ?? null,
    });
    if (matches.length > 0) {
      return { dedupSnapshot: matches, isDuplicateSkip: true, succeededRecordId: null };
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
      const jds = await listAllJobDescriptions(organizationId);
      const match = await matchJobDescriptionForResume(resumeProfile, jds);
      jobDescriptionId = match?.jobDescriptionId ?? null;
    } catch (error) {
      // 自动匹配失败不算致命错误：简历仍然入库，只是不绑定岗位。
      // Auto-match failure is non-fatal: the resume still gets imported, just without a JD.
      console.error("[bulk-upload] auto JD match failed:", error);
    }
  }
  const succeededRecordId = await createResumeRecordFromStorage({
    candidateEmail: null,
    candidateName: null,
    candidatePhone: null,
    contentHash: null,
    jobDescriptionId,
    notes: null,
    organizationId,
    resumeFileName: item.originalFileName,
    resumeProfile,
    storageKey: item.storageKey,
    targetRole: null,
    userId,
  });
  return { dedupSnapshot: null, isDuplicateSkip: false, succeededRecordId };
}

// 結果を DB に書き戻し、batch カウンターを更新する。
// Write the outcome back to DB and update batch counters.
async function writeOutcome(
  item: NonNullable<ItemRow>,
  batchId: string,
  batchRow: {
    failedCount: number;
    processedCount: number;
    skippedCount: number;
    succeededCount: number;
  },
  outcome: {
    dedupSnapshot: unknown;
    errorMessage: string | null;
    isDuplicateSkip: boolean;
    succeededRecordId: string | null;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    if (outcome.errorMessage) {
      await tx
        .update(resumeUploadBatchItem)
        .set({ errorMessage: outcome.errorMessage, finishedAt: now, status: "failed" })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({
          failedCount: batchRow.failedCount + 1,
          processedCount: batchRow.processedCount + 1,
          updatedAt: now,
        })
        .where(eq(resumeUploadBatch.id, batchId));
    } else if (outcome.isDuplicateSkip) {
      await tx
        .update(resumeUploadBatchItem)
        .set({
          dedupMatchSnapshot: outcome.dedupSnapshot as never,
          finishedAt: now,
          status: "duplicate_skipped",
        })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({
          processedCount: batchRow.processedCount + 1,
          skippedCount: batchRow.skippedCount + 1,
          updatedAt: now,
        })
        .where(eq(resumeUploadBatch.id, batchId));
    } else {
      await tx
        .update(resumeUploadBatchItem)
        .set({
          finishedAt: now,
          resumeRecordId: outcome.succeededRecordId,
          status: "succeeded",
        })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({
          processedCount: batchRow.processedCount + 1,
          succeededCount: batchRow.succeededCount + 1,
          updatedAt: now,
        })
        .where(eq(resumeUploadBatch.id, batchId));
    }

    // 完了チェック: processed == total かつ terminal でなければ completed にする。
    // Completion check: if processed == total and not terminal, flip to completed.
    const [refreshed] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId))
      .limit(1);
    if (
      refreshed &&
      refreshed.processedCount === refreshed.totalCount &&
      refreshed.status === "running"
    ) {
      await tx
        .update(resumeUploadBatch)
        .set({ completedAt: now, status: "completed", updatedAt: now })
        .where(eq(resumeUploadBatch.id, batchId));
    }
  });
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

  const { item } = claimed;
  const { batchRow } = claimed;

  // 2) Outside the transaction: fetch S3 + parse + dedup + (optionally) create record.
  let outcome: {
    dedupSnapshot: unknown;
    errorMessage: string | null;
    isDuplicateSkip: boolean;
    succeededRecordId: string | null;
  } = {
    dedupSnapshot: null,
    errorMessage: null,
    isDuplicateSkip: false,
    succeededRecordId: null,
  };

  try {
    const result = await fetchAndParse(item, batchRow, organizationId, userId);
    outcome = { ...outcome, ...result };
  } catch (error) {
    outcome.errorMessage = truncate(error instanceof Error ? error.message : String(error));
  }

  // 3) Write outcome + bump counters.
  await writeOutcome(item, batchId, batchRow, outcome);

  // 4) Reload detail to return current state.
  const detail = await loadBatchDetail(batchId, organizationId, userId);
  if (!detail) {
    // Defensive: shouldn't happen.
    return null;
  }
  const updatedItem = detail.items.find((i) => i.id === item.id) ?? toItemDto(item as never);
  return {
    batch: detail.batch,
    done: detail.batch.status === "completed",
    item: updatedItem,
  };
}

export { toBatchDto };
