import type { InterviewQuestion, ResumeProfile } from "@/lib/interview/types";
import type { ScheduleEntryStatus } from "@/lib/studio-interviews";

/**
 * 单轮面试安排记录（来自数据库 schedule_entries 表的视图）。
 * A single interview round entry (a view over the `schedule_entries` table).
 */
export interface InterviewScheduleEntry {
  id: string;
  interviewRecordId: string;
  roundLabel: string;
  status: ScheduleEntryStatus;
  scheduledAt: string | Date | null;
  notes: string | null;
  sortOrder: number;
  conversationId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * 候选人侧面试视图：聚合"当前轮次"等派生字段，便于前端直接渲染。
 * Candidate-side view of an interview, with derived "current round" fields.
 */
export interface CandidateInterviewView {
  id: string;
  candidateName: string;
  targetRole: string | null;
  status: string;
  resumeProfile: ResumeProfile | null;
  interviewQuestions: InterviewQuestion[];
  currentRoundId: string | null;
  currentRoundLabel: string | null;
  currentRoundStatus: ScheduleEntryStatus | null;
  currentRoundTime: string | Date | null;
}

/**
 * 拼装候选人面试链接；带 `roundId` 时跳到具体轮次页。
 * Build a candidate interview link; appends `roundId` when provided.
 */
export function buildInterviewLink(id: string, roundId?: string) {
  return roundId ? `/interview/${id}/${roundId}` : `/interview/${id}`;
}

/**
 * 按 `sortOrder` 升序排列轮次记录（不修改入参）。
 * Sort schedule entries by `sortOrder` ascending without mutating the input.
 */
export function sortScheduleEntries<T extends { sortOrder: number }>(entries: T[]) {
  return entries.toSorted((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * 选出"当前应进行的轮次"：优先返回首个 pending / in_progress；全部完成时返回最后一轮。
 * Pick the "currently active round": first pending / in_progress entry; if none,
 * falls back to the last completed one.
 */
export function pickCurrentScheduleEntry<
  T extends { sortOrder: number; status: string; scheduledAt: string | Date | null },
>(entries: T[]) {
  const sorted = sortScheduleEntries(entries);

  // Pick first pending or in_progress round (by sortOrder).
  // 取按顺序排在最前的 pending / in_progress 轮次。
  const activeEntry = sorted.find(
    (entry) => entry.status === "pending" || entry.status === "in_progress",
  );

  if (activeEntry) {
    return activeEntry;
  }

  // All rounds are completed — return the last completed round.
  // 所有轮次都已完成时，返回最后一轮作为兜底。
  return sorted.at(-1) ?? null;
}

/**
 * 把 server 端记录 + 轮次 + 当前 roundId 组装成候选人侧视图。
 * Build the candidate-facing view from a server record, schedule entries, and the
 * currently selected round id.
 */
export function buildCandidateInterviewView(
  record: {
    id: string;
    candidateName: string;
    targetRole: string | null;
    status: string;
    resumeProfile: ResumeProfile | null;
    interviewQuestions: InterviewQuestion[];
  },
  scheduleEntries: InterviewScheduleEntry[],
  roundId: string,
): CandidateInterviewView {
  const currentEntry = scheduleEntries.find((e) => e.id === roundId) ?? null;

  return {
    candidateName: record.candidateName,
    currentRoundId: currentEntry?.id ?? null,
    currentRoundLabel: currentEntry?.roundLabel ?? null,
    currentRoundStatus: (currentEntry?.status as ScheduleEntryStatus) ?? null,
    currentRoundTime: currentEntry?.scheduledAt ?? null,
    id: record.id,
    interviewQuestions: record.interviewQuestions,
    resumeProfile: record.resumeProfile,
    status: record.status,
    targetRole: record.targetRole,
  };
}
