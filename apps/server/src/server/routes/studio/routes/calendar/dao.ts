import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  and,
  asc,
  count,
  eq,
  exists,
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
import { db } from "../../../../../lib/server/db/index";
import type { RecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import {
  aiInterviewConversation,
  aiInterviewConversationTurn,
  jobDescription,
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import type {
  StudioAiCalendarEventPreview,
  StudioCalendarCandidate,
  StudioCalendarEvent,
  StudioCalendarInterviewer,
} from "@app/shared/studio-calendar";
import { buildAiCalendarEvents, resolveHumanCalendarEventStatus } from "./events";
import { buildInterviewCalendarTitle } from "@app/shared/interview-calendar";
import {
  buildInterviewerInviteToken,
  buildInviteExpiry,
} from "../interviews/dao/human-interview-meeting-access";

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
  viewerUserId: string;
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

function canOpenRecruitingRecord(
  createdBy: string | null,
  visibilityScope: RecruitingVisibilityScope,
): boolean {
  return (
    visibilityScope.kind === "all" ||
    (visibilityScope.kind === "restricted" &&
      createdBy !== null &&
      visibilityScope.userIds.includes(createdBy))
  );
}

function uniqueMeetingIds(rows: { meetingId: string | null }[]): string[] {
  return [...new Set(rows.flatMap((row) => (row.meetingId ? [row.meetingId] : [])))];
}

function listViewerMeetingAssignments(
  meetingIds: string[],
  organizationId: string,
  viewerUserId: string,
) {
  if (meetingIds.length === 0) {
    return [];
  }
  return db
    .select({
      meetingId: humanInterviewMeetingInterviewer.meetingId,
      role: humanInterviewMeetingInterviewer.role,
    })
    .from(humanInterviewMeetingInterviewer)
    .where(
      and(
        inArray(humanInterviewMeetingInterviewer.meetingId, meetingIds),
        eq(humanInterviewMeetingInterviewer.organizationId, organizationId),
        eq(humanInterviewMeetingInterviewer.userId, viewerUserId),
      ),
    );
}

function listHumanRoundInterviewers(roundIds: string[]) {
  if (roundIds.length === 0) {
    return [];
  }
  return db
    .select({
      id: user.id,
      name: user.name,
      roundId: humanInterviewRoundInterviewer.roundId,
    })
    .from(humanInterviewRoundInterviewer)
    .innerJoin(user, eq(user.id, humanInterviewRoundInterviewer.userId))
    .where(
      and(
        inArray(humanInterviewRoundInterviewer.roundId, roundIds),
        ne(humanInterviewRoundInterviewer.status, "declined"),
      ),
    )
    .orderBy(asc(user.name));
}

function buildViewerInterviewerInviteToken({
  meetingId,
  role,
  viewerUserId,
}: {
  meetingId: string | null;
  role: "host" | "interviewer" | "observer" | undefined;
  viewerUserId: string;
}): string | null {
  if (!(meetingId && role)) {
    return null;
  }
  return buildInterviewerInviteToken({
    exp: buildInviteExpiry(),
    meetingId,
    role,
    userId: viewerUserId,
  });
}

export async function listStudioCalendarEvents({
  end,
  organizationId,
  start,
  viewerUserId,
  visibilityScope,
}: ListStudioCalendarEventsInput): Promise<StudioCalendarEvent[]> {
  if (visibilityScope.kind === "none") {
    return [];
  }

  const [candidateRows, aiRows, aiConversationRows] = await Promise.all([
    db
      .select({
        candidateName: recruitingRecordReadModel.candidateName,
        createdBy: recruitingRecordReadModel.createdBy,
        endedAt: humanInterviewMeeting.endedAt,
        format: humanInterviewRound.format,
        interviewRecordId: recruitingRecordReadModel.id,
        jobDescriptionName: jobDescription.name,
        location: humanInterviewRound.location,
        meetingId: humanInterviewMeeting.id,
        meetingStatus: humanInterviewMeeting.status,
        meetingUrl: humanInterviewRound.meetingUrl,
        roundId: humanInterviewRound.id,
        roundLabel: humanInterviewRound.label,
        roundStatus: humanInterviewRound.status,
        scheduledAt: humanInterviewRound.scheduledAt,
        startedAt: humanInterviewMeeting.startedAt,
      })
      .from(humanInterviewRound)
      .leftJoin(
        humanInterviewMeetingRound,
        eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
      )
      .leftJoin(
        humanInterviewMeeting,
        eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
      )
      .innerJoin(
        recruitingRecordReadModel,
        eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
      )
      .leftJoin(
        jobDescription,
        and(
          eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
          eq(recruitingRecordReadModel.organizationId, jobDescription.organizationId),
        ),
      )
      .where(
        and(
          eq(humanInterviewRound.organizationId, organizationId),
          ne(humanInterviewRound.status, "cancelled"),
          or(isNull(humanInterviewMeeting.status), ne(humanInterviewMeeting.status, "cancelled")),
          gte(humanInterviewRound.scheduledAt, start),
          lt(humanInterviewRound.scheduledAt, end),
          visibilityScope.kind === "restricted"
            ? or(
                inArray(recruitingRecordReadModel.createdBy, visibilityScope.userIds),
                and(
                  exists(
                    db
                      .select({ userId: humanInterviewRoundInterviewer.userId })
                      .from(humanInterviewRoundInterviewer)
                      .where(
                        and(
                          eq(humanInterviewRoundInterviewer.roundId, humanInterviewRound.id),
                          eq(humanInterviewRoundInterviewer.organizationId, organizationId),
                          eq(humanInterviewRoundInterviewer.userId, viewerUserId),
                          ne(humanInterviewRoundInterviewer.status, "declined"),
                        ),
                      ),
                  ),
                  exists(
                    db
                      .select({ userId: humanInterviewMeetingInterviewer.userId })
                      .from(humanInterviewMeetingInterviewer)
                      .where(
                        and(
                          eq(humanInterviewMeetingInterviewer.meetingId, humanInterviewMeeting.id),
                          eq(humanInterviewMeetingInterviewer.organizationId, organizationId),
                          eq(humanInterviewMeetingInterviewer.userId, viewerUserId),
                        ),
                      ),
                  ),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(humanInterviewRound.scheduledAt), asc(humanInterviewRound.sortOrder)),
    db
      .select({
        candidateName: recruitingRecordReadModel.candidateName,
        interviewRecordId: recruitingRecordReadModel.id,
        jobDescriptionName: jobDescription.name,
        roundId: aiInterviewRound.id,
        roundLabel: aiInterviewRound.roundLabel,
        scheduledAt: aiInterviewRound.scheduledAt,
        scheduledEndAt: aiInterviewRound.scheduledEndAt,
        status: aiInterviewRound.status,
      })
      .from(aiInterviewRound)
      .innerJoin(
        recruitingRecordReadModel,
        eq(recruitingRecordReadModel.id, aiInterviewRound.recruitingRecordId),
      )
      .leftJoin(
        jobDescription,
        and(
          eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
          eq(recruitingRecordReadModel.organizationId, jobDescription.organizationId),
        ),
      )
      .where(
        and(
          eq(aiInterviewRound.organizationId, organizationId),
          gte(aiInterviewRound.scheduledAt, start),
          lt(aiInterviewRound.scheduledAt, end),
          visibilityScope.kind === "restricted"
            ? inArray(recruitingRecordReadModel.createdBy, visibilityScope.userIds)
            : undefined,
        ),
      )
      .orderBy(asc(aiInterviewRound.scheduledAt), asc(aiInterviewRound.sortOrder)),
    db
      .select({
        candidateName: recruitingRecordReadModel.candidateName,
        conversationId: aiInterviewConversation.conversationId,
        endedAt: aiInterviewConversation.endedAt,
        interviewRecordId: recruitingRecordReadModel.id,
        jobDescriptionName: jobDescription.name,
        roundId: aiInterviewRound.id,
        roundLabel: aiInterviewRound.roundLabel,
        startedAt: aiInterviewConversation.startedAt,
      })
      .from(aiInterviewConversation)
      .innerJoin(aiInterviewRound, eq(aiInterviewRound.id, aiInterviewConversation.aiRoundId))
      .innerJoin(
        recruitingRecordReadModel,
        eq(recruitingRecordReadModel.id, aiInterviewRound.recruitingRecordId),
      )
      .leftJoin(
        jobDescription,
        and(
          eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
          eq(recruitingRecordReadModel.organizationId, jobDescription.organizationId),
        ),
      )
      .where(
        and(
          eq(aiInterviewConversation.organizationId, organizationId),
          eq(aiInterviewRound.organizationId, organizationId),
          eq(recruitingRecordReadModel.organizationId, organizationId),
          isNotNull(aiInterviewConversation.startedAt),
          isNotNull(aiInterviewConversation.endedAt),
          gt(aiInterviewConversation.endedAt, start),
          lt(aiInterviewConversation.startedAt, end),
          visibilityScope.kind === "restricted"
            ? inArray(recruitingRecordReadModel.createdBy, visibilityScope.userIds)
            : undefined,
        ),
      )
      .orderBy(asc(aiInterviewConversation.startedAt)),
  ]);

  const roundIds = candidateRows.map((row) => row.roundId);
  const meetingIds = uniqueMeetingIds(candidateRows);
  const aiRoundIds = aiRows.map((row) => row.roundId);
  const [interviewerRows, viewerMeetingRows, aiResultRoundRows] = await Promise.all([
    listHumanRoundInterviewers(roundIds),
    listViewerMeetingAssignments(meetingIds, organizationId, viewerUserId),
    aiRoundIds.length === 0
      ? []
      : db
          .selectDistinct({ roundId: aiInterviewConversation.aiRoundId })
          .from(aiInterviewConversation)
          .where(
            and(
              eq(aiInterviewConversation.organizationId, organizationId),
              inArray(aiInterviewConversation.aiRoundId, aiRoundIds),
              isNotNull(aiInterviewConversation.startedAt),
              isNotNull(aiInterviewConversation.endedAt),
            ),
          ),
  ]);

  const candidatesByEvent = new Map<string, StudioCalendarCandidate[]>();
  for (const row of candidateRows) {
    const eventId = eventIdFor(row);
    const candidates = candidatesByEvent.get(eventId) ?? [];
    candidates.push({
      canOpenRecruitingRecord: canOpenRecruitingRecord(row.createdBy, visibilityScope),
      candidateName: row.candidateName,
      interviewRecordId: row.interviewRecordId,
      jobDescriptionName: row.jobDescriptionName,
      roundId: row.roundId,
      roundLabel: row.roundLabel,
    });
    candidatesByEvent.set(eventId, candidates);
  }

  const eventIdByRound = new Map(candidateRows.map((row) => [row.roundId, eventIdFor(row)]));
  const viewerMeetingRoleById = new Map(
    viewerMeetingRows.map((row) => [row.meetingId, row.role] as const),
  );
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
    const viewerMeetingRole = viewerMeetingRoleById.get(row.meetingId ?? "");
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
      status: resolveHumanCalendarEventStatus(row.meetingStatus, row.roundStatus),
      title: buildInterviewCalendarTitle(candidatesByEvent.get(eventId) ?? []),
      viewerInterviewerInviteToken: buildViewerInterviewerInviteToken({
        meetingId: row.meetingId,
        role: viewerMeetingRole,
        viewerUserId,
      }),
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
      allowTextInput: aiInterviewRound.allowTextInput,
      candidateId: recruitingRecordReadModel.id,
      candidateName: recruitingRecordReadModel.candidateName,
      conversationId: aiInterviewRound.conversationId,
      disconnectedAt: aiInterviewRound.disconnectedAt,
      jobDescriptionName: jobDescription.name,
      roundId: aiInterviewRound.id,
      roundLabel: aiInterviewRound.roundLabel,
      scheduledAt: aiInterviewRound.scheduledAt,
      scheduledEndAt: aiInterviewRound.scheduledEndAt,
      sessionStartedAt: aiInterviewRound.sessionStartedAt,
      status: aiInterviewRound.status,
      targetRole: recruitingRecordReadModel.targetRole,
    })
    .from(aiInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, aiInterviewRound.recruitingRecordId),
    )
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(aiInterviewRound.id, roundId),
        eq(aiInterviewRound.organizationId, organizationId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
        visibilityScope.kind === "restricted"
          ? inArray(recruitingRecordReadModel.createdBy, visibilityScope.userIds)
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
          conversationId: aiInterviewConversation.conversationId,
          endedAt: aiInterviewConversation.endedAt,
          recordingDurationSecs: aiInterviewConversation.recordingDurationSecs,
          reportStatus: aiInterviewConversation.summaryStatus,
          startedAt: aiInterviewConversation.startedAt,
          summary: aiInterviewConversation.transcriptSummary,
          turnCount: sql<number>`greatest(
            ${count(aiInterviewConversationTurn.id)},
            jsonb_array_length(${aiInterviewConversation.transcript})
          )`.mapWith(Number),
        })
        .from(aiInterviewConversation)
        .leftJoin(
          aiInterviewConversationTurn,
          eq(aiInterviewConversationTurn.conversationId, aiInterviewConversation.conversationId),
        )
        .where(
          and(
            eq(aiInterviewConversation.conversationId, selectedConversationId),
            eq(aiInterviewConversation.aiRoundId, roundId),
            eq(aiInterviewConversation.organizationId, organizationId),
          ),
        )
        .groupBy(
          aiInterviewConversation.conversationId,
          aiInterviewConversation.endedAt,
          aiInterviewConversation.recordingDurationSecs,
          aiInterviewConversation.summaryStatus,
          aiInterviewConversation.startedAt,
          aiInterviewConversation.transcript,
          aiInterviewConversation.transcriptSummary,
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
