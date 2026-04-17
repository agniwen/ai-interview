import type { parseScheduleEntriesInput, StudioInterviewRecord } from "@/lib/studio-interviews";
import { eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { studioInterview, studioInterviewSchedule } from "@/lib/db/schema";
import {
  buildCandidateInterviewView,
  buildInterviewLink,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from "@/lib/interview/interview-record";
import { ResumeAnalysisError } from "@/server/agents/resume-analysis-agent";

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

  return buildCandidateInterviewView(record, sortScheduleEntries(scheduleEntries), roundId);
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
): StudioInterviewRecord {
  const scheduleEntries = sortScheduleEntries(
    scheduleRows.filter((schedule) => schedule.interviewRecordId === record.id),
  );

  return {
    ...record,
    interviewLink: buildInterviewLink(record.id),
    interviewQuestions: record.interviewQuestions ?? [],
    scheduleEntries,
  };
}

export async function loadRecordById(id: string) {
  const [record] = await db
    .select()
    .from(studioInterview)
    .where(eq(studioInterview.id, id))
    .limit(1);

  if (!record) {
    return null;
  }

  const scheduleEntries = await loadScheduleEntries([record.id]);
  return serializeRecord(record, scheduleEntries);
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
