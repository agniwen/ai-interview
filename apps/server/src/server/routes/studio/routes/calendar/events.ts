import type { ScheduleEntryStatus } from "@app/db-schema/studio-interviews";
import type { StudioAiCalendarEvent } from "@app/shared/studio-calendar";
import { buildInterviewCalendarTitle } from "@app/shared/interview-calendar";

export interface AiCalendarScheduledRow {
  candidateName: string;
  jobDescriptionName?: string | null;
  interviewRecordId: string;
  roundId: string;
  roundLabel: string;
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
  status: ScheduleEntryStatus;
}

export interface AiCalendarConversationRow {
  candidateName: string;
  jobDescriptionName?: string | null;
  conversationId: string;
  endedAt: Date | null;
  interviewRecordId: string;
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
            candidateName: row.candidateName,
            interviewRecordId: row.interviewRecordId,
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
            candidateName: row.candidateName,
            interviewRecordId: row.interviewRecordId,
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
