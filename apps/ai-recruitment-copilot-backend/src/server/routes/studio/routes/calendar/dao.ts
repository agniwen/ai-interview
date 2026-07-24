import { and, asc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type {
  StudioCalendarCandidate,
  StudioCalendarEvent,
  StudioCalendarInterviewer,
} from "@arc/shared/studio-calendar";
import type {
  HumanInterviewMeetingStatus,
  HumanInterviewRoundStatus,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";

const DEFAULT_INTERVIEW_DURATION_MS = 60 * 60 * 1000;

interface ListStudioCalendarEventsInput {
  end: Date;
  organizationId: string;
  start: Date;
  visibilityScope: RecruitingVisibilityScope;
}

function resolveEndAt(startAt: Date, endedAt: Date | null): Date {
  if (endedAt && endedAt > startAt) {
    return endedAt;
  }
  return new Date(startAt.getTime() + DEFAULT_INTERVIEW_DURATION_MS);
}

function eventIdFor(row: { meetingId: string | null; roundId: string }) {
  return row.meetingId ?? row.roundId;
}

function resolveEventStatus(
  meetingStatus: HumanInterviewMeetingStatus | null,
  roundStatus: HumanInterviewRoundStatus,
): StudioCalendarEvent["status"] {
  if (meetingStatus === "in_progress" || meetingStatus === "ended") {
    return meetingStatus;
  }
  return roundStatus === "completed" ? "ended" : "scheduled";
}

function resolveAiEventStatus(status: ScheduleEntryStatus): StudioCalendarEvent["status"] {
  if (status === "completed") {
    return "ended";
  }
  return status === "in_progress" || status === "interrupted" ? "in_progress" : "scheduled";
}

export async function listStudioCalendarEvents({
  end,
  organizationId,
  start,
  visibilityScope,
}: ListStudioCalendarEventsInput): Promise<StudioCalendarEvent[]> {
  if (visibilityScope.kind === "none") {
    return [];
  }

  const [candidateRows, aiRows] = await Promise.all([
    db
      .select({
        candidateName: studioInterview.candidateName,
        endedAt: studioHumanInterviewMeeting.endedAt,
        format: studioHumanInterviewRound.format,
        interviewRecordId: studioInterview.id,
        location: studioHumanInterviewRound.location,
        meetingId: studioHumanInterviewMeeting.id,
        meetingStatus: studioHumanInterviewMeeting.status,
        meetingTitle: studioHumanInterviewMeeting.title,
        meetingUrl: studioHumanInterviewRound.meetingUrl,
        roundId: studioHumanInterviewRound.id,
        roundLabel: studioHumanInterviewRound.label,
        roundStatus: studioHumanInterviewRound.status,
        scheduledAt: studioHumanInterviewRound.scheduledAt,
        startedAt: studioHumanInterviewMeeting.startedAt,
      })
      .from(studioHumanInterviewRound)
      .leftJoin(
        studioHumanInterviewMeetingRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .leftJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
      )
      .innerJoin(
        studioInterview,
        eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId),
      )
      .where(
        and(
          eq(studioHumanInterviewRound.organizationId, organizationId),
          ne(studioHumanInterviewRound.status, "cancelled"),
          or(
            isNull(studioHumanInterviewMeeting.status),
            ne(studioHumanInterviewMeeting.status, "cancelled"),
          ),
          gte(studioHumanInterviewRound.scheduledAt, start),
          lt(studioHumanInterviewRound.scheduledAt, end),
          visibilityScope.kind === "restricted"
            ? inArray(studioInterview.createdBy, visibilityScope.userIds)
            : undefined,
        ),
      )
      .orderBy(
        asc(studioHumanInterviewRound.scheduledAt),
        asc(studioHumanInterviewRound.sortOrder),
      ),
    db
      .select({
        candidateName: studioInterview.candidateName,
        interviewRecordId: studioInterview.id,
        roundId: studioInterviewSchedule.id,
        roundLabel: studioInterviewSchedule.roundLabel,
        scheduledAt: studioInterviewSchedule.scheduledAt,
        scheduledEndAt: studioInterviewSchedule.scheduledEndAt,
        status: studioInterviewSchedule.status,
      })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .where(
        and(
          eq(studioInterviewSchedule.organizationId, organizationId),
          gte(studioInterviewSchedule.scheduledAt, start),
          lt(studioInterviewSchedule.scheduledAt, end),
          visibilityScope.kind === "restricted"
            ? inArray(studioInterview.createdBy, visibilityScope.userIds)
            : undefined,
        ),
      )
      .orderBy(asc(studioInterviewSchedule.scheduledAt), asc(studioInterviewSchedule.sortOrder)),
  ]);

  const roundIds = candidateRows.map((row) => row.roundId);
  const interviewerRows =
    roundIds.length === 0
      ? []
      : await db
          .select({
            id: user.id,
            name: user.name,
            roundId: studioHumanInterviewRoundInterviewer.roundId,
          })
          .from(studioHumanInterviewRoundInterviewer)
          .innerJoin(user, eq(user.id, studioHumanInterviewRoundInterviewer.userId))
          .where(inArray(studioHumanInterviewRoundInterviewer.roundId, roundIds))
          .orderBy(asc(user.name));

  const candidatesByEvent = new Map<string, StudioCalendarCandidate[]>();
  for (const row of candidateRows) {
    const eventId = eventIdFor(row);
    const candidates = candidatesByEvent.get(eventId) ?? [];
    candidates.push({
      candidateName: row.candidateName,
      interviewRecordId: row.interviewRecordId,
      roundId: row.roundId,
      roundLabel: row.roundLabel,
    });
    candidatesByEvent.set(eventId, candidates);
  }

  const eventIdByRound = new Map(candidateRows.map((row) => [row.roundId, eventIdFor(row)]));
  const interviewersByEvent = new Map<string, StudioCalendarInterviewer[]>();
  for (const row of interviewerRows) {
    const eventId = eventIdByRound.get(row.roundId);
    if (!eventId) {
      continue;
    }
    const interviewers = interviewersByEvent.get(eventId) ?? [];
    if (!interviewers.some((interviewer) => interviewer.id === row.id)) {
      interviewers.push({ id: row.id, name: row.name });
    }
    interviewersByEvent.set(eventId, interviewers);
  }

  const events = new Map<string, StudioCalendarEvent>();
  for (const row of candidateRows) {
    const eventId = eventIdFor(row);
    if (!row.scheduledAt || events.has(eventId)) {
      continue;
    }
    const startAt = row.startedAt ?? row.scheduledAt;
    events.set(eventId, {
      candidates: candidatesByEvent.get(eventId) ?? [],
      endAt: resolveEndAt(startAt, row.endedAt).toISOString(),
      format: row.format,
      id: eventId,
      interviewers: interviewersByEvent.get(eventId) ?? [],
      kind: "human",
      location: row.location,
      meetingUrl: row.meetingUrl,
      startAt: startAt.toISOString(),
      status: resolveEventStatus(row.meetingStatus, row.roundStatus),
      title: row.meetingTitle ?? row.roundLabel,
    });
  }

  const aiEvents = aiRows.flatMap((row): StudioCalendarEvent[] => {
    if (!row.scheduledAt || !row.scheduledEndAt) {
      return [];
    }
    return [
      {
        candidates: [
          {
            candidateName: row.candidateName,
            interviewRecordId: row.interviewRecordId,
            roundId: row.roundId,
            roundLabel: row.roundLabel,
          },
        ],
        endAt: row.scheduledEndAt.toISOString(),
        id: `ai:${row.roundId}`,
        kind: "ai",
        startAt: row.scheduledAt.toISOString(),
        status: resolveAiEventStatus(row.status),
        title: row.roundLabel,
      },
    ];
  });

  return [...events.values(), ...aiEvents].toSorted(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );
}
