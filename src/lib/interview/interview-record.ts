import type { InterviewQuestion, ResumeProfile } from "@/lib/interview/types";
import type { ScheduleEntryStatus } from "@/lib/studio-interviews";
import { RECONNECT_GRACE_MS } from "@/lib/studio-interviews";

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
  allowTextInput: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  // 热重连相关字段（首次开始时填充，断连后用于续连判定）。
  // Hot-reconnect anchor fields populated on first start.
  liveKitRoomName: string | null;
  liveKitParticipantIdentity: string | null;
  sessionStartedAt: string | Date | null;
  disconnectedAt: string | Date | null;
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
  currentRoundAllowTextInput: boolean;
  // 当轮次处于 interrupted 且 disconnectedAt + 宽限期 > 现在时，给出可续连的截止时间 ISO 字符串。
  // ISO timestamp of the latest moment the candidate may rejoin; non-null only
  // while the round is "interrupted" within the 3-minute grace window.
  currentRoundRecoverableUntil: string | null;
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

  // Pick first pending / in_progress / interrupted round (by sortOrder).
  // interrupted 表示候选人临时断连仍可在 3 分钟宽限期内回归，视为活跃轮次。
  // "interrupted" still counts as the active round during the grace window.
  const activeEntry = sorted.find(
    (entry) =>
      entry.status === "pending" ||
      entry.status === "in_progress" ||
      entry.status === "interrupted",
  );

  if (activeEntry) {
    return activeEntry;
  }

  // All rounds are completed — return the last completed round.
  // 所有轮次都已完成时，返回最后一轮作为兜底。
  return sorted.at(-1) ?? null;
}

// 仅当 interrupted 且 disconnectedAt + 宽限期 仍在未来时，返回可续连截止 ISO 串。
// Returns the rejoin deadline ISO string only while the entry is "interrupted"
// AND disconnectedAt + grace > now; otherwise null.
function computeRecoverableUntil(entry: InterviewScheduleEntry | null): string | null {
  if (!entry || entry.status !== "interrupted" || !entry.disconnectedAt) {
    return null;
  }
  const disconnectedAtMs = new Date(entry.disconnectedAt).getTime();
  if (Number.isNaN(disconnectedAtMs)) {
    return null;
  }
  const deadlineMs = disconnectedAtMs + RECONNECT_GRACE_MS;
  if (deadlineMs <= Date.now()) {
    return null;
  }
  return new Date(deadlineMs).toISOString();
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
    currentRoundAllowTextInput: currentEntry?.allowTextInput ?? false,
    currentRoundId: currentEntry?.id ?? null,
    currentRoundLabel: currentEntry?.roundLabel ?? null,
    currentRoundRecoverableUntil: computeRecoverableUntil(currentEntry),
    currentRoundStatus: (currentEntry?.status as ScheduleEntryStatus) ?? null,
    currentRoundTime: currentEntry?.scheduledAt ?? null,
    id: record.id,
    interviewQuestions: record.interviewQuestions,
    resumeProfile: record.resumeProfile,
    status: record.status,
    targetRole: record.targetRole,
  };
}
