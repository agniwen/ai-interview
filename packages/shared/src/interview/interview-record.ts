import type { InterviewQuestion, ResumeProfile } from "@arc/db-schema/interview/types";
import type {
  CandidateInterviewFeedback,
  CandidateInterviewFeedbackCategory,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";
import {
  buildCandidateInterviewFeedback,
  RECONNECT_GRACE_MS,
} from "@arc/db-schema/studio-interviews";
import type { ResumeReviewDimensionKey, ResumeReviewLoose } from "../resume-review";
import {
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
} from "../resume-review";

export interface CandidateAiReview {
  baseScore: number | null;
  conclusion: string;
  dimensions: {
    key: ResumeReviewDimensionKey;
    label: string;
    rationale: string;
    score: number;
  }[];
  strengths: {
    evidence: string | null;
    impact: string;
    point: string;
  }[];
}

export function buildCandidateAiReview(
  review: ResumeReviewLoose | null | undefined,
): CandidateAiReview | null {
  if (!review) {
    return null;
  }

  return {
    baseScore: getResumeReviewBaseScore(review),
    conclusion: review.overall.conclusion,
    dimensions: RESUME_REVIEW_DIMENSIONS.flatMap(({ key, label }) => {
      const dimension = getResumeReviewDimension(review, key);
      return dimension
        ? [{ key, label, rationale: dimension.rationale, score: dimension.score }]
        : [];
    }),
    strengths: review.strengths.map(({ evidence, impact, point }) => ({ evidence, impact, point })),
  };
}

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
  scheduledEndAt: string | Date | null;
  notes: string | null;
  sortOrder: number;
  conversationId: string | null;
  allowTextInput: boolean;
  candidateFeedbackCategories: CandidateInterviewFeedbackCategory[] | null;
  candidateFeedbackDetail: string | null;
  candidateFeedbackSubmittedAt: string | Date | null;
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
  aiReview: CandidateAiReview | null;
  candidateName: string;
  companyContext: string | null;
  targetRole: string | null;
  jobDescriptionDescription: string | null;
  jobDescriptionName: string | null;
  jobDescriptionPrompt: string | null;
  resumeProfile: ResumeProfile | null;
  interviewQuestions: InterviewQuestion[];
  currentRoundId: string | null;
  currentRoundLabel: string | null;
  currentRoundStatus: ScheduleEntryStatus | null;
  currentRoundTime: string | Date | null;
  currentRoundAllowTextInput: boolean;
  currentRoundFeedback: CandidateInterviewFeedback | null;
  // 当轮次处于 interrupted 且 disconnectedAt + 宽限期 > 现在时，给出可续连的截止时间 ISO 字符串。
  // ISO timestamp of the latest moment the candidate may rejoin; non-null only
  // while the round is "interrupted" within the 3-minute grace window.
  currentRoundRecoverableUntil: string | null;
  // 是否应当尝试自动续连：包括（a）interrupted 仍在窗口内、以及（b）in_progress
  // 但用户已离开页面（前端 disconnect/beforeunload beacon 可能未送达，导致状态没翻成
  // interrupted）。这两种情况用户回到页面都应直接续连同一房间。
  // Whether the candidate should auto-resume: covers (a) interrupted within
  // grace and (b) in_progress with stale anchors (beacon may not have made it
  // to the server before the page unloaded).
  currentRoundCanResume: boolean;
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

// 判定本轮是否应当自动续连：
// - in_progress + 已 mint anchor → 用户可能刚刚刷新但 disconnect 信号还没到服务端；
// - interrupted + 仍在 3 分钟宽限期内 → 标准热重连场景。
// pending 与 completed 都不算可续连（前者首次开始走正常按钮，后者已结束）。
// canResume covers both interrupted-in-window AND in_progress with anchors
// (when the disconnect/beforeunload beacon didn't reach the server in time).
function computeCanResume(entry: InterviewScheduleEntry | null): boolean {
  if (!entry) {
    return false;
  }
  if (entry.status === "in_progress" && entry.liveKitRoomName && entry.liveKitParticipantIdentity) {
    return true;
  }
  if (entry.status === "interrupted" && entry.disconnectedAt) {
    const disconnectedAtMs = new Date(entry.disconnectedAt).getTime();
    if (Number.isNaN(disconnectedAtMs)) {
      return false;
    }
    return disconnectedAtMs + RECONNECT_GRACE_MS > Date.now();
  }
  return false;
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
    resumeProfile: ResumeProfile | null;
    resumeReview: ResumeReviewLoose | null;
    interviewQuestions: InterviewQuestion[];
  },
  scheduleEntries: InterviewScheduleEntry[],
  roundId: string,
): CandidateInterviewView {
  const currentEntry = scheduleEntries.find((e) => e.id === roundId) ?? null;
  const currentRoundFeedback = buildCandidateInterviewFeedback({
    categories: currentEntry?.candidateFeedbackCategories ?? null,
    detail: currentEntry?.candidateFeedbackDetail ?? null,
    submittedAt: currentEntry?.candidateFeedbackSubmittedAt ?? null,
  });

  return {
    aiReview: buildCandidateAiReview(record.resumeReview),
    candidateName: record.candidateName,
    companyContext: null,
    currentRoundAllowTextInput: currentEntry?.allowTextInput ?? false,
    currentRoundCanResume: computeCanResume(currentEntry),
    currentRoundFeedback,
    currentRoundId: currentEntry?.id ?? null,
    currentRoundLabel: currentEntry?.roundLabel ?? null,
    currentRoundRecoverableUntil: computeRecoverableUntil(currentEntry),
    currentRoundStatus: currentEntry?.status ?? null,
    currentRoundTime: currentEntry?.scheduledAt ?? null,
    id: record.id,
    interviewQuestions: record.interviewQuestions,
    jobDescriptionDescription: null,
    jobDescriptionName: null,
    jobDescriptionPrompt: null,
    resumeProfile: record.resumeProfile,
    targetRole: record.targetRole,
  };
}
