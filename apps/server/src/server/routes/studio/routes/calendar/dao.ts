import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import type { RecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import {
  interviewConversation,
  interviewConversationTurn,
  jobDescription,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type {
  StudioAiCalendarEventPreview,
  StudioCalendarCandidate,
  StudioCalendarEvent,
  StudioCalendarInterviewer,
} from "@arc/shared/studio-calendar";
import type {
  HumanInterviewMeetingStatus,
  HumanInterviewRoundStatus,
} from "@arc/db-schema/studio-interviews";
import { buildAiCalendarEvents } from "./events";

const DEFAULT_INTERVIEW_DURATION_MS = 60 * 60 * 1000;

function serializeDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function resolveConversationDurationSecs({
  endedAt,
  recordingDurationSecs,
  startedAt,
}: {
  endedAt: Date | null;
  recordingDurationSecs: number | null;
  startedAt: Date | null;
}): number | null {
  if (recordingDurationSecs !== null) {
    return recordingDurationSecs;
  }
  if (!(startedAt && endedAt)) {
    return null;
  }
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

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

export async function listStudioCalendarEvents({
  end,
  organizationId,
  start,
  visibilityScope,
}: ListStudioCalendarEventsInput): Promise<StudioCalendarEvent[]> {
  if (visibilityScope.kind === "none") {
    return [];
  }

  const [candidateRows, aiRows, aiConversationRows] = await Promise.all([
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
    db
      .select({
        candidateName: studioInterview.candidateName,
        conversationId: interviewConversation.conversationId,
        endedAt: interviewConversation.endedAt,
        interviewRecordId: studioInterview.id,
        roundId: studioInterviewSchedule.id,
        roundLabel: studioInterviewSchedule.roundLabel,
        startedAt: interviewConversation.startedAt,
      })
      .from(interviewConversation)
      .innerJoin(
        studioInterviewSchedule,
        eq(studioInterviewSchedule.id, interviewConversation.scheduleEntryId),
      )
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .where(
        and(
          eq(interviewConversation.organizationId, organizationId),
          eq(studioInterviewSchedule.organizationId, organizationId),
          eq(studioInterview.organizationId, organizationId),
          isNotNull(interviewConversation.startedAt),
          isNotNull(interviewConversation.endedAt),
          gt(interviewConversation.endedAt, start),
          lt(interviewConversation.startedAt, end),
          visibilityScope.kind === "restricted"
            ? inArray(studioInterview.createdBy, visibilityScope.userIds)
            : undefined,
        ),
      )
      .orderBy(asc(interviewConversation.startedAt)),
  ]);

  const roundIds = candidateRows.map((row) => row.roundId);
  const aiRoundIds = aiRows.map((row) => row.roundId);
  const [interviewerRows, aiResultRoundRows] = await Promise.all([
    roundIds.length === 0
      ? []
      : db
          .select({
            id: user.id,
            name: user.name,
            roundId: studioHumanInterviewRoundInterviewer.roundId,
          })
          .from(studioHumanInterviewRoundInterviewer)
          .innerJoin(user, eq(user.id, studioHumanInterviewRoundInterviewer.userId))
          .where(inArray(studioHumanInterviewRoundInterviewer.roundId, roundIds))
          .orderBy(asc(user.name)),
    aiRoundIds.length === 0
      ? []
      : db
          .selectDistinct({ roundId: interviewConversation.scheduleEntryId })
          .from(interviewConversation)
          .where(
            and(
              eq(interviewConversation.organizationId, organizationId),
              inArray(interviewConversation.scheduleEntryId, aiRoundIds),
              isNotNull(interviewConversation.startedAt),
              isNotNull(interviewConversation.endedAt),
            ),
          ),
  ]);

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

  const aiEvents = buildAiCalendarEvents({
    conversationRows: aiConversationRows,
    roundIdsWithResults: aiResultRoundRows.flatMap((row) => (row.roundId ? [row.roundId] : [])),
    scheduledRows: aiRows,
  });

  return [...events.values(), ...aiEvents].toSorted(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );
}

export async function loadAiCalendarEventPreview({
  conversationId,
  organizationId,
  roundId,
  visibilityScope,
}: {
  conversationId?: string;
  organizationId: string;
  roundId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<StudioAiCalendarEventPreview | null> {
  if (
    visibilityScope.kind === "none" ||
    (visibilityScope.kind === "restricted" && visibilityScope.userIds.length === 0)
  ) {
    return null;
  }

  const [round] = await db
    .select({
      allowTextInput: studioInterviewSchedule.allowTextInput,
      candidateId: studioInterview.id,
      candidateName: studioInterview.candidateName,
      conversationId: studioInterviewSchedule.conversationId,
      disconnectedAt: studioInterviewSchedule.disconnectedAt,
      jobDescriptionName: jobDescription.name,
      roundId: studioInterviewSchedule.id,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduledAt: studioInterviewSchedule.scheduledAt,
      scheduledEndAt: studioInterviewSchedule.scheduledEndAt,
      sessionStartedAt: studioInterviewSchedule.sessionStartedAt,
      status: studioInterviewSchedule.status,
      targetRole: studioInterview.targetRole,
    })
    .from(studioInterviewSchedule)
    .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, studioInterview.jobDescriptionId),
        eq(jobDescription.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, organizationId),
        eq(studioInterview.organizationId, organizationId),
        visibilityScope.kind === "restricted"
          ? inArray(studioInterview.createdBy, visibilityScope.userIds)
          : undefined,
      ),
    )
    .limit(1);

  if (!round) {
    return null;
  }

  const selectedConversationId = conversationId ?? round.conversationId;
  const [result] = selectedConversationId
    ? await db
        .select({
          conversationId: interviewConversation.conversationId,
          endedAt: interviewConversation.endedAt,
          recordingDurationSecs: interviewConversation.recordingDurationSecs,
          reportStatus: interviewConversation.summaryStatus,
          startedAt: interviewConversation.startedAt,
          summary: interviewConversation.transcriptSummary,
          turnCount: sql<number>`greatest(
            ${count(interviewConversationTurn.id)},
            jsonb_array_length(${interviewConversation.transcript})
          )`.mapWith(Number),
        })
        .from(interviewConversation)
        .leftJoin(
          interviewConversationTurn,
          eq(interviewConversationTurn.conversationId, interviewConversation.conversationId),
        )
        .where(
          and(
            eq(interviewConversation.conversationId, selectedConversationId),
            eq(interviewConversation.scheduleEntryId, roundId),
            eq(interviewConversation.organizationId, organizationId),
          ),
        )
        .groupBy(
          interviewConversation.conversationId,
          interviewConversation.endedAt,
          interviewConversation.recordingDurationSecs,
          interviewConversation.summaryStatus,
          interviewConversation.startedAt,
          interviewConversation.transcript,
          interviewConversation.transcriptSummary,
        )
        .limit(1)
    : [];

  return {
    candidate: {
      id: round.candidateId,
      jobDescriptionName: round.jobDescriptionName,
      name: round.candidateName,
      targetRole: round.targetRole,
    },
    result: result
      ? {
          conversationId: result.conversationId,
          durationSecs: resolveConversationDurationSecs(result),
          endedAt: serializeDate(result.endedAt),
          reportStatus: result.reportStatus,
          startedAt: serializeDate(result.startedAt),
          summary: result.summary,
          turnCount: result.turnCount,
        }
      : null,
    round: {
      allowTextInput: round.allowTextInput,
      disconnectedAt: serializeDate(round.disconnectedAt),
      id: round.roundId,
      label: round.roundLabel,
      scheduledAt: serializeDate(round.scheduledAt),
      scheduledEndAt: serializeDate(round.scheduledEndAt),
      sessionStartedAt: serializeDate(round.sessionStartedAt),
      status: round.status,
    },
  };
}
