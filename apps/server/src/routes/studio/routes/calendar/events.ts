import type {
  HumanInterviewEvaluationStatus,
  HumanInterviewMeetingStatus,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  ScheduleEntryStatus,
} from "@app/db-schema/studio-interviews";
import { aggregateHumanInterviewOutcomes } from "@app/meeting-processing/human-interview";
import type {
  StudioAiCalendarEvent,
  StudioCalendarEvaluationConclusion,
  StudioCalendarEvent,
} from "@app/shared/studio-calendar";
import { buildInterviewCalendarTitle } from "@app/shared/interview-calendar";

/**
 * 真人轮次的决定性结论，与评价提交流程同一规则：已锁定的通过/未通过优先，否则按提交顺序取
 * 第一个通过/未通过，其余已提交评价为待定；没有任何提交时为未评价。
 * / The same rule the submission flow uses: a locked pass/fail wins, else the first decisive
 * submission, else inconclusive; with nothing submitted the round is unevaluated.
 */
export function resolveHumanRoundConclusion({
  evaluationStatus,
  outcome,
  submittedOutcomes,
}: {
  evaluationStatus: HumanInterviewEvaluationStatus;
  outcome: HumanInterviewRoundOutcome | null;
  /** 已提交评价的结论，按提交时间升序。/ Submitted outcomes in submission order. */
  submittedOutcomes: (HumanInterviewRoundOutcome | null)[];
}): StudioCalendarEvaluationConclusion {
  const roundSubmitted = evaluationStatus === "submitted" && outcome !== null;
  if (roundSubmitted && (outcome === "pass" || outcome === "fail")) {
    return outcome;
  }
  if (submittedOutcomes.length > 0) {
    return aggregateHumanInterviewOutcomes(submittedOutcomes);
  }
  return roundSubmitted ? outcome : "none";
}

/** AI 轮次只有人工决定的结论；AI 报告本身不给出通过与否。/ Only a human decision concludes an AI round. */
export function resolveAiRoundConclusion(
  reviewOutcome: "pass" | "fail" | null,
): StudioCalendarEvaluationConclusion {
  return reviewOutcome ?? "none";
}

export interface AiCalendarScheduledRow {
  candidateName: string;
  jobDescriptionId?: string | null;
  jobDescriptionName?: string | null;
  interviewRecordId: string;
  roundId: string;
  reviewOutcome?: "pass" | "fail" | null;
  roundLabel: string;
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
  status: ScheduleEntryStatus;
}

export interface AiCalendarConversationRow {
  candidateName: string;
  jobDescriptionId?: string | null;
  jobDescriptionName?: string | null;
  conversationId: string;
  endedAt: Date | null;
  interviewRecordId: string;
  reviewOutcome?: "pass" | "fail" | null;
  roundId: string;
  roundLabel: string;
  startedAt: Date | null;
}

function resolveAiEventStatus(status: ScheduleEntryStatus): StudioAiCalendarEvent["status"] {
  if (status === "completed") {
    return "ended";
  }
  return status === "in_progress" || status === "interrupted" ? "in_progress" : "scheduled";
}

export function resolveHumanCalendarEventStatus(
  meetingStatus: HumanInterviewMeetingStatus | null,
  roundStatus: HumanInterviewRoundStatus,
): StudioCalendarEvent["status"] {
  if (
    meetingStatus === "in_progress" ||
    meetingStatus === "ended" ||
    meetingStatus === "not_held"
  ) {
    return meetingStatus;
  }
  return roundStatus === "completed" ? "ended" : "scheduled";
}

export function buildAiCalendarEvents({
  conversationRows,
  roundIdsWithResults = [],
  scheduledRows,
}: {
  conversationRows: AiCalendarConversationRow[];
  roundIdsWithResults?: string[];
  scheduledRows: AiCalendarScheduledRow[];
}): StudioAiCalendarEvent[] {
  const completeConversationRows = conversationRows.filter((row) => row.startedAt && row.endedAt);
  const roundsWithResults = new Set([
    ...roundIdsWithResults,
    ...completeConversationRows.map((row) => row.roundId),
  ]);
  const resultEvents = completeConversationRows.flatMap((row): StudioAiCalendarEvent[] => {
    if (!(row.startedAt && row.endedAt)) {
      return [];
    }
    return [
      {
        candidates: [
          {
            canOpenRecruitingRecord: true,
            candidateAvatarVersion: null,
            candidateName: row.candidateName,
            evaluationConclusion: resolveAiRoundConclusion(row.reviewOutcome ?? null),
            interviewRecordId: row.interviewRecordId,
            jobDescriptionId: row.jobDescriptionId ?? null,
            jobDescriptionName: row.jobDescriptionName ?? null,
            roundId: row.roundId,
            roundLabel: row.roundLabel,
          },
        ],
        conversationId: row.conversationId,
        endAt: row.endedAt.toISOString(),
        id: `ai-result:${row.conversationId}`,
        kind: "ai",
        source: "result",
        startAt: row.startedAt.toISOString(),
        status: "ended",
        title: buildInterviewCalendarTitle([row]),
      },
    ];
  });
  const scheduledEvents = scheduledRows.flatMap((row): StudioAiCalendarEvent[] => {
    if (
      !row.scheduledAt ||
      !row.scheduledEndAt ||
      (row.status === "completed" && roundsWithResults.has(row.roundId))
    ) {
      return [];
    }
    return [
      {
        candidates: [
          {
            canOpenRecruitingRecord: true,
            candidateAvatarVersion: null,
            candidateName: row.candidateName,
            evaluationConclusion: resolveAiRoundConclusion(row.reviewOutcome ?? null),
            interviewRecordId: row.interviewRecordId,
            jobDescriptionId: row.jobDescriptionId ?? null,
            jobDescriptionName: row.jobDescriptionName ?? null,
            roundId: row.roundId,
            roundLabel: row.roundLabel,
          },
        ],
        conversationId: null,
        endAt: row.scheduledEndAt.toISOString(),
        id: `ai:${row.roundId}`,
        kind: "ai",
        source: "scheduled",
        startAt: row.scheduledAt.toISOString(),
        status: resolveAiEventStatus(row.status),
        title: buildInterviewCalendarTitle([row]),
      },
    ];
  });

  return [...resultEvents, ...scheduledEvents].toSorted(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );
}
