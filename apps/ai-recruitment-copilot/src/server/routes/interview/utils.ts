import type { parseScheduleEntriesInput } from "@arc/db-schema/studio-interviews";
import type { StudioCandidateRecord } from "@/lib/shared/studio-candidates";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import {
  buildCandidateInterviewView,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from "@/lib/shared/interview/interview-record";
import {
  parseResumeFastToProfile,
  ResumeAnalysisError,
} from "@/server/agents/resume-analysis-agent";
import { projectAttachmentToResumeProfile } from "@/server/agents/resume-parser-agent";
import {
  createAttachment,
  findAttachmentByContentHash,
  updateStructuredByHash,
} from "@/server/routes/chat/dao/chat-attachments";
import { generateResumeStructured } from "@/lib/server/resume-parse-pipeline";
import {
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
} from "@/server/routes/studio/routes/interview-questions/dao/bindings";
import { sha256HexOfBytes } from "@/lib/shared/file-hash";
import { buildAttachmentKeyByHash, putObjectBytes } from "@/lib/server/s3";

export type StudioInterviewRow = typeof studioInterview.$inferSelect;
export type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

// =====================================================================
// Candidate interview record loaders
// =====================================================================

export async function loadCandidateInterviewRecord(id: string, roundId: string) {
  const [record] = await db
    .select()
    .from(studioInterview)
    .where(eq(studioInterview.id, id))
    .limit(1);

  if (!record || record.status === "archived") {
    return null;
  }

  const scheduleEntries = await db
    .select()
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, id));

  const view = buildCandidateInterviewView(record, sortScheduleEntries(scheduleEntries), roundId);

  let jobDescriptionPrompt: string | null = null;
  let jobDescriptionName: string | null = null;
  const interviewers: { name: string; prompt: string; voice: string }[] = [];

  if (record.jobDescriptionId) {
    const [jdRow] = await db
      .select({
        name: jobDescription.name,
        prompt: jobDescription.prompt,
      })
      .from(jobDescription)
      .where(eq(jobDescription.id, record.jobDescriptionId))
      .limit(1);
    jobDescriptionPrompt = jdRow?.prompt ?? null;
    jobDescriptionName = jdRow?.name ?? null;

    const interviewerRows = await db
      .select({
        name: interviewer.name,
        prompt: interviewer.prompt,
        voice: interviewer.voice,
      })
      .from(jobDescriptionInterviewer)
      .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
      .where(eq(jobDescriptionInterviewer.jobDescriptionId, record.jobDescriptionId));

    interviewers.push(...interviewerRows);
  }

  // Aggregate preset questions from interview_question_template_binding rows
  // (replacing the legacy `jobDescription.presetQuestions` column). Each entry
  // is { content, difficulty } so the agent prompt can tag preset questions
  // with [easy]/[medium]/[hard] markers and apply per-difficulty follow-up
  // rules. ensureApplicableBindings lazily attaches templates created *after*
  // the interview was created (e.g. a new global template).
  await ensureApplicableBindings(id);
  const jobDescriptionPresetQuestions = await loadInterviewPresetQuestions(id);

  return {
    ...view,
    interviewers,
    jobDescriptionName,
    jobDescriptionPresetQuestions,
    jobDescriptionPrompt,
    organizationId: record.organizationId,
  };
}

export async function loadScheduleEntriesForRedirect(id: string) {
  const [record] = await db
    .select({ id: studioInterview.id, status: studioInterview.status })
    .from(studioInterview)
    .where(eq(studioInterview.id, id))
    .limit(1);

  if (!record || record.status === "archived") {
    return null;
  }

  const entries = await db
    .select()
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, id));

  const sorted = sortScheduleEntries(entries);
  const active = pickCurrentScheduleEntry(sorted);
  return active;
}

export function buildTokenErrorResponse() {
  return {
    error: "语音通话服务配置缺失，请联系管理员检查环境变量。",
  };
}

// =====================================================================
// Studio interview (management) helpers
// =====================================================================

export function normalizeResumeFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}

/**
 * 把简历 PDF 写入"统一注册表"（chat_attachment 表）并返回 storageKey
 * + contentHash + 命中时的 cachedResumeProfile。
 *
 * 1. 算 hash → 查 chat_attachment 是否已存在（任意用户、任意路径写入）。
 * 2. 命中：复用 storageKey；从 superset parsedStructured 投影到 ResumeProfile
 *    供调用方判断是否能跳过 parseResumeFast。**不**额外写 chat_attachment 行。
 * 3. 未命中：并行跑 parseResumeFastToProfile + S3 PUT。两者都成功才写一行
 *    chat_attachment（userId = 当前操作者）；S3 失败致命，parse 失败时不
 *    写注册行（避免污染），返回 cachedResumeProfile=null 让调用方兜底。
 *
 * Upload the candidate resume PDF into the unified registry (chat_attachment)
 * and return its storageKey, contentHash, and a cached ResumeProfile when the
 * registry already had this hash.
 *
 * Silently returns null when S3 isn't configured — the interview record still
 * persists, preview just won't be available for this row.
 */
export async function storeInterviewResume(
  _interviewRecordId: string,
  file: File,
  userId: string,
  organizationId: string,
): Promise<{
  storageKey: string;
  contentHash: string;
  cachedResumeProfile: ResumeProfile | null;
} | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = await sha256HexOfBytes(bytes);

    // 命中既有 chat_attachment 行（已过滤 failed）。三种子情况：
    //   3A. 已有完整结构化 → 投影返回 cached profile（投影失败 = 历史脏数据，落到 3B）。
    //   3B. 仅 OCR 文本可用 → 只跑 generateResumeStructured 一步，
    //       结果通过 updateStructuredByHash 回填同 hash 所有行。
    //   3C. 既没 structured 也没 text（理论上不应发生）→ 落到 miss 分支重跑完整 parse。
    // Registry hit (failed rows already excluded). Three sub-cases:
    //   3A. parsedStructured present → project to cached ResumeProfile;
    //       if projection fails (legacy malformed row), fall through to 3B
    //       so we still benefit from the cached OCR text.
    //   3B. only OCR text available → run structured extraction only and
    //       backfill all rows sharing the hash via updateStructuredByHash.
    //   3C. neither structured nor text (shouldn't happen in practice) → fall
    //       through to the miss branch and re-run the full parse.
    const existing = await findAttachmentByContentHash(contentHash);
    if (existing?.parsedStructured) {
      const cached = projectAttachmentToResumeProfile(existing.parsedStructured);
      if (cached) {
        return {
          cachedResumeProfile: cached,
          contentHash,
          storageKey: existing.storageKey,
        };
      }
      // 投影失败：parsedStructured 是历史脏数据。继续往下走 3B/3C 分支兜底。
      // Projection failed (legacy malformed structured). Fall through to 3B/3C.
    }
    if (existing?.parsedText && existing.parsedText.trim().length > 0) {
      try {
        const structured = await generateResumeStructured(existing.parsedText);
        await updateStructuredByHash(contentHash, structured);
        return {
          cachedResumeProfile: projectAttachmentToResumeProfile(structured),
          contentHash,
          storageKey: existing.storageKey,
        };
      } catch (error) {
        // 结构化失败但 OCR 文本还在。不把行标 failed —— OCR 部分依然有效，
        // 下次还能再尝试结构化。返回 cachedResumeProfile=null 让上层走 fallback。
        // Structured failed but OCR text is still good. Don't mark the row
        // failed — the OCR data remains valid for a retry. Return null so the
        // caller falls back to the standard analysis path.
        console.error("[studio-interview] structured-from-text failed:", error);
        return {
          cachedResumeProfile: null,
          contentHash,
          storageKey: existing.storageKey,
        };
      }
    }

    // 未命中：parse + PUT 并行。
    // Miss: parse + PUT in parallel.
    const storageKey = await buildAttachmentKeyByHash(contentHash, "pdf");
    const [putOutcome, parseOutcome] = await Promise.allSettled([
      putObjectBytes({
        body: bytes,
        contentType: file.type || "application/pdf",
        storageKey,
      }),
      parseResumeFastToProfile(file),
    ]);

    if (putOutcome.status === "rejected") {
      console.error("[studio-interview] failed to upload resume to S3:", putOutcome.reason);
      return null;
    }

    if (parseOutcome.status === "rejected") {
      // S3 已写字节但 parse 失败：不写 chat_attachment 行（避免污染注册表）。
      // 调用方拿到 cachedResumeProfile=null，会兜底跑 analyzeResumeFile，
      // 那次失败再让上层 ResumeAnalysisError 处理。
      // S3 wrote bytes but parse failed: skip chat_attachment write to keep
      // the registry clean. Caller falls back to analyzeResumeFile, whose
      // failure will surface as ResumeAnalysisError upstream.
      console.error(
        "[studio-interview] resume parse failed (S3 PUT succeeded):",
        parseOutcome.reason,
      );
      return { cachedResumeProfile: null, contentHash, storageKey };
    }

    const parsed = parseOutcome.value;
    await createAttachment({
      contentHash,
      filename: file.name.slice(0, 255) || "resume.pdf",
      id: crypto.randomUUID(),
      mediaType: file.type || "application/pdf",
      organizationId,
      parsedAt: new Date(),
      parsedPageCount: parsed.parsedPageCount,
      parsedStatus: "ready",
      parsedStructured: parsed.parsedStructured,
      parsedText: parsed.parsedText,
      parsedTextSource: parsed.parsedTextSource,
      size: file.size,
      storageKey,
      userId,
    });

    return {
      cachedResumeProfile: parsed.resumeProfile,
      contentHash,
      storageKey,
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    console.error("[studio-interview] failed to upload resume to S3:", error);
    return null;
  }
}

// 单行构造拆分：避免上层 map 函数的圈复杂度过高，并方便在 PATCH 编辑时
// 透传 conversationId、热重连锚点等已存在字段。
// Single-row builder, kept separate so callers stay under complexity limits
// and so existing fields (conversationId, hot-reconnect anchors) carry through.
// oxlint-disable-next-line complexity -- Pure data-shape mapping with many nullable carry-overs from the existing row.
function buildSingleScheduleRow(
  entry: ReturnType<typeof parseScheduleEntriesInput>[number],
  index: number,
  orgId: string,
  interviewRecordId: string,
  now: Date,
  existingMap: Map<string, StudioInterviewScheduleRow>,
) {
  const existing = entry.id ? existingMap.get(entry.id.trim()) : undefined;

  return {
    allowTextInput: entry.allowTextInput ?? false,
    conversationId: existing?.conversationId ?? null,
    createdAt: existing?.createdAt ?? now,
    disconnectedAt: existing?.disconnectedAt ?? null,
    id: entry.id?.trim() || crypto.randomUUID(),
    interviewRecordId,
    liveKitParticipantIdentity: existing?.liveKitParticipantIdentity ?? null,
    liveKitRoomName: existing?.liveKitRoomName ?? null,
    notes: entry.notes?.trim() || null,
    organizationId: existing?.organizationId ?? orgId,
    roundLabel: entry.roundLabel.trim(),
    scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt) : null,
    sessionStartedAt: existing?.sessionStartedAt ?? null,
    sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : index,
    status: existing?.status ?? ("pending" as const),
    updatedAt: now,
  };
}

export function buildScheduleRows(
  orgId: string,
  interviewRecordId: string,
  entries: ReturnType<typeof parseScheduleEntriesInput>,
  now: Date,
  existingRows?: StudioInterviewScheduleRow[],
) {
  const existingMap = new Map((existingRows ?? []).map((row) => [row.id, row]));

  return entries.map((entry, index) =>
    buildSingleScheduleRow(entry, index, orgId, interviewRecordId, now, existingMap),
  );
}

export function loadScheduleEntries(interviewIds: string[]): Promise<StudioInterviewScheduleRow[]> {
  if (interviewIds.length === 0) {
    return Promise.resolve([]);
  }

  return db
    .select()
    .from(studioInterviewSchedule)
    .where(inArray(studioInterviewSchedule.interviewRecordId, interviewIds));
}

// serializeRecord は候補者レベルのフィールドのみ返す（scheduleEntries・interviewLink は round 側）。
// serializeRecord returns only candidate-level fields (scheduleEntries and interviewLink now
// belong to the round-side type).
export function serializeRecord(
  record: StudioInterviewRow,
  _scheduleRows: StudioInterviewScheduleRow[],
  jobDescriptionName: string | null = null,
): StudioCandidateRecord {
  return {
    candidateEmail: record.candidateEmail,
    candidateName: record.candidateName,
    candidatePhone: record.candidatePhone,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    createdBy: record.createdBy,
    creatorName: null,
    creatorOrganizationName: null,
    id: record.id,
    interviewQuestions: record.interviewQuestions ?? [],
    jobDescriptionId: record.jobDescriptionId,
    jobDescriptionName,
    notes: record.notes,
    resumeContentHash: record.resumeContentHash,
    resumeFileName: record.resumeFileName,
    resumeProfile: record.resumeProfile as StudioCandidateRecord["resumeProfile"],
    resumeStorageKey: record.resumeStorageKey,
    status: record.status,
    targetRole: record.targetRole,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}

export async function loadRecordById(id: string, organizationId?: string) {
  const where = organizationId
    ? and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId))
    : eq(studioInterview.id, id);

  const [row] = await db
    .select({
      jobDescriptionName: jobDescription.name,
      record: studioInterview,
    })
    .from(studioInterview)
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(where)
    .limit(1);

  if (!row) {
    return null;
  }

  return serializeRecord(row.record, [], row.jobDescriptionName);
}

export function toBadRequest(error: unknown) {
  if (error instanceof ResumeAnalysisError) {
    return { error: error.message, stage: error.stage, status: 500 };
  }

  if (error instanceof Error) {
    const status = error.message.includes("PDF") || error.message.includes("MB") ? 400 : 400;
    return { error: error.message, status };
  }

  return { error: "表单校验失败。", status: 400 };
}
