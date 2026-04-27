import type { parseScheduleEntriesInput, StudioInterviewRecord } from "@/lib/studio-interviews";
import { eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import {
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/db/schema";
import {
  buildCandidateInterviewView,
  buildInterviewLink,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from "@/lib/interview/interview-record";
import { ResumeAnalysisError } from "@/server/agents/resume-analysis-agent";
import {
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
} from "@/server/queries/interview-question-templates";
import { buildInterviewResumeKey, putObjectBytes } from "@/lib/s3";

export type StudioInterviewRow = typeof studioInterview.$inferSelect;
export type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

// =====================================================================
// Cache tag helper
// =====================================================================

export function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  } catch {
    // updateTag may throw in certain route handler contexts — non-critical
  }
}

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
  const interviewers: { name: string; prompt: string; voice: string }[] = [];

  if (record.jobDescriptionId) {
    const [jdRow] = await db
      .select({
        prompt: jobDescription.prompt,
      })
      .from(jobDescription)
      .where(eq(jobDescription.id, record.jobDescriptionId))
      .limit(1);
    jobDescriptionPrompt = jdRow?.prompt ?? null;

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
  // (replacing the legacy `jobDescription.presetQuestions` column). Field name
  // and shape kept as `string[]` so the LiveKit agent's metadata contract is
  // unchanged. ensureApplicableBindings lazily attaches templates created
  // *after* the interview was created (e.g. a new global template) so they
  // also flow into the agent's metadata.
  await ensureApplicableBindings(id);
  const jobDescriptionPresetQuestions = await loadInterviewPresetQuestions(id);

  return {
    ...view,
    interviewers,
    jobDescriptionPresetQuestions,
    jobDescriptionPrompt,
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
 * Upload the candidate resume PDF to S3 and return the storage key.
 * Silently returns null when S3 isn't configured — the interview record still
 * persists, preview just won't be available for this row.
 */
export async function storeInterviewResume(
  interviewRecordId: string,
  file: File,
): Promise<string | null> {
  try {
    const storageKey = await buildInterviewResumeKey(interviewRecordId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await putObjectBytes({
      body: bytes,
      contentType: file.type || "application/pdf",
      storageKey,
    });
    return storageKey;
  } catch (error) {
    console.error("[studio-interview] failed to upload resume to S3:", error);
    return null;
  }
}

export function buildScheduleRows(
  interviewRecordId: string,
  entries: ReturnType<typeof parseScheduleEntriesInput>,
  now: Date,
  existingRows?: StudioInterviewScheduleRow[],
) {
  const existingMap = new Map((existingRows ?? []).map((row) => [row.id, row]));

  return entries.map((entry, index) => {
    const existing = entry.id ? existingMap.get(entry.id.trim()) : undefined;

    return {
      conversationId: existing?.conversationId ?? null,
      createdAt: existing?.createdAt ?? now,
      id: entry.id?.trim() || crypto.randomUUID(),
      interviewRecordId,
      notes: entry.notes?.trim() || null,
      roundLabel: entry.roundLabel.trim(),
      scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt) : null,
      sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : index,
      status: existing?.status ?? ("pending" as const),
      updatedAt: now,
    };
  });
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

export function serializeRecord(
  record: StudioInterviewRow,
  scheduleRows: StudioInterviewScheduleRow[],
  jobDescriptionName: string | null = null,
): StudioInterviewRecord {
  const scheduleEntries = sortScheduleEntries(
    scheduleRows.filter((schedule) => schedule.interviewRecordId === record.id),
  );

  return {
    ...record,
    interviewLink: buildInterviewLink(record.id),
    interviewQuestions: record.interviewQuestions ?? [],
    jobDescriptionName,
    scheduleEntries,
  };
}

export async function loadRecordById(id: string) {
  const [row] = await db
    .select({
      jobDescriptionName: jobDescription.name,
      record: studioInterview,
    })
    .from(studioInterview)
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(eq(studioInterview.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const scheduleEntries = await loadScheduleEntries([row.record.id]);
  return serializeRecord(row.record, scheduleEntries, row.jobDescriptionName);
}

export function toBadRequest(error: unknown) {
  if (error instanceof ResumeAnalysisError) {
    return { error: error.message, stage: error.stage, status: 500 };
  }

  if (error instanceof Error) {
    const status = error.message.includes("PDF") || error.message.includes("10 MB") ? 400 : 400;
    return { error: error.message, status };
  }

  return { error: "表单校验失败。", status: 400 };
}
