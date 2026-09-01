import { Inject, Injectable, NotFoundException } from "@nestjs/common";
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
import type {
  HumanInterviewMeetingStatus,
  HumanInterviewRoundStatus,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";
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
import type { StudioAiCalendarEvent, StudioCalendarEvent } from "@arc/shared/studio-calendar";
import { InterviewCoreService } from "../interviews/interview-core.service.js";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const iso = (value: Date | null) => value?.toISOString() ?? null;

function aiStatus(status: ScheduleEntryStatus): StudioAiCalendarEvent["status"] {
  if (status === "completed") {
    return "ended";
  }
  return status === "in_progress" || status === "interrupted" ? "in_progress" : "scheduled";
}

function humanStatus(
  meeting: HumanInterviewMeetingStatus | null,
  round: HumanInterviewRoundStatus,
) {
  if (meeting === "in_progress" || meeting === "ended") {
    return meeting;
  }
  return round === "completed" ? "ended" : "scheduled";
}

function humanMeetingEventId(row: { meetingId: string | null; roundId: string }) {
  return row.meetingId ?? row.roundId;
}

@Injectable()
export class CalendarService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(InterviewCoreService) private readonly interviews: InterviewCoreService,
  ) {}

  // oxlint-disable-next-line complexity -- Human rounds, AI schedules, and completed conversations are merged under one parity response contract.
  async list(organizationId: string, actorId: string, memberRole: string, start: Date, end: Date) {
    const visible = await this.interviews.visibleCreatorIds(organizationId, actorId, memberRole);
    const visibility = visible ? inArray(studioInterview.createdBy, visible) : undefined;
    const [humanRows, aiRows, conversationRows] = await Promise.all([
      this.database
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
            visibility,
          ),
        )
        .orderBy(
          asc(studioHumanInterviewRound.scheduledAt),
          asc(studioHumanInterviewRound.sortOrder),
        ),
      this.database
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
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(
          and(
            eq(studioInterviewSchedule.organizationId, organizationId),
            gte(studioInterviewSchedule.scheduledAt, start),
            lt(studioInterviewSchedule.scheduledAt, end),
            visibility,
          ),
        )
        .orderBy(asc(studioInterviewSchedule.scheduledAt), asc(studioInterviewSchedule.sortOrder)),
      this.database
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
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(
          and(
            eq(interviewConversation.organizationId, organizationId),
            eq(studioInterviewSchedule.organizationId, organizationId),
            eq(studioInterview.organizationId, organizationId),
            isNotNull(interviewConversation.startedAt),
            isNotNull(interviewConversation.endedAt),
            gt(interviewConversation.endedAt, start),
            lt(interviewConversation.startedAt, end),
            visibility,
          ),
        )
        .orderBy(asc(interviewConversation.startedAt)),
    ]);

    const humanRoundIds = humanRows.map((row) => row.roundId);
    const aiRoundIds = aiRows.map((row) => row.roundId);
    const [interviewerRows, resultRounds] = await Promise.all([
      humanRoundIds.length
        ? this.database
            .select({
              id: user.id,
              name: user.name,
              roundId: studioHumanInterviewRoundInterviewer.roundId,
            })
            .from(studioHumanInterviewRoundInterviewer)
            .innerJoin(user, eq(user.id, studioHumanInterviewRoundInterviewer.userId))
            .where(inArray(studioHumanInterviewRoundInterviewer.roundId, humanRoundIds))
            .orderBy(asc(user.name))
        : [],
      aiRoundIds.length
        ? this.database
            .selectDistinct({ roundId: interviewConversation.scheduleEntryId })
            .from(interviewConversation)
            .where(
              and(
                eq(interviewConversation.organizationId, organizationId),
                inArray(interviewConversation.scheduleEntryId, aiRoundIds),
                isNotNull(interviewConversation.startedAt),
                isNotNull(interviewConversation.endedAt),
              ),
            )
        : [],
    ]);
    const candidates = new Map<
      string,
      { candidateName: string; interviewRecordId: string; roundId: string; roundLabel: string }[]
    >();
    for (const row of humanRows) {
      const id = humanMeetingEventId(row);
      const list = candidates.get(id) ?? [];
      list.push({
        candidateName: row.candidateName,
        interviewRecordId: row.interviewRecordId,
        roundId: row.roundId,
        roundLabel: row.roundLabel,
      });
      candidates.set(id, list);
    }
    const eventByRound = new Map(humanRows.map((row) => [row.roundId, humanMeetingEventId(row)]));
    const interviewers = new Map<string, { id: string; name: string }[]>();
    for (const row of interviewerRows) {
      const id = eventByRound.get(row.roundId);
      if (!id) {
        continue;
      }
      const list = interviewers.get(id) ?? [];
      if (!list.some((value) => value.id === row.id)) {
        list.push({ id: row.id, name: row.name });
      }
      interviewers.set(id, list);
    }
    const events = new Map<string, StudioCalendarEvent>();
    for (const row of humanRows) {
      const id = humanMeetingEventId(row);
      if (!row.scheduledAt || events.has(id)) {
        continue;
      }
      const startAt = row.startedAt ?? row.scheduledAt;
      const endAt =
        row.endedAt && row.endedAt > startAt
          ? row.endedAt
          : new Date(startAt.getTime() + DEFAULT_DURATION_MS);
      events.set(id, {
        candidates: candidates.get(id) ?? [],
        endAt: endAt.toISOString(),
        format: row.format,
        id,
        interviewers: interviewers.get(id) ?? [],
        kind: "human",
        location: row.location,
        meetingUrl: row.meetingUrl,
        startAt: startAt.toISOString(),
        status: humanStatus(row.meetingStatus, row.roundStatus),
        title: row.meetingTitle ?? row.roundLabel,
      });
    }
    const completed = new Set([
      ...resultRounds.flatMap((row) => (row.roundId ? [row.roundId] : [])),
      ...conversationRows.map((row) => row.roundId),
    ]);
    const aiEvents: StudioAiCalendarEvent[] = [];
    for (const row of conversationRows) {
      if (row.startedAt && row.endedAt) {
        aiEvents.push({
          candidates: [
            {
              candidateName: row.candidateName,
              interviewRecordId: row.interviewRecordId,
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
          title: row.roundLabel,
        });
      }
    }
    for (const row of aiRows) {
      if (
        row.scheduledAt &&
        row.scheduledEndAt &&
        !(row.status === "completed" && completed.has(row.roundId))
      ) {
        aiEvents.push({
          candidates: [
            {
              candidateName: row.candidateName,
              interviewRecordId: row.interviewRecordId,
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
          status: aiStatus(row.status),
          title: row.roundLabel,
        });
      }
    }
    return {
      events: [...events.values(), ...aiEvents].toSorted(
        (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
      ),
    };
  }

  async preview(
    organizationId: string,
    actorId: string,
    memberRole: string,
    roundId: string,
    conversationId?: string,
  ) {
    const visible = await this.interviews.visibleCreatorIds(organizationId, actorId, memberRole);
    const [round] = await this.database
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
          visible ? inArray(studioInterview.createdBy, visible) : undefined,
        ),
      )
      .limit(1);
    if (!round) {
      throw new NotFoundException("AI 面试事件不存在。", {
        errorCode: "AI_CALENDAR_EVENT_NOT_FOUND",
      });
    }
    const selected = conversationId ?? round.conversationId;
    const resultRows = selected
      ? await this.database
          .select({
            conversationId: interviewConversation.conversationId,
            endedAt: interviewConversation.endedAt,
            recordingDurationSecs: interviewConversation.recordingDurationSecs,
            reportStatus: interviewConversation.summaryStatus,
            startedAt: interviewConversation.startedAt,
            summary: interviewConversation.transcriptSummary,
            turnCount:
              sql<number>`greatest(${count(interviewConversationTurn.id)}, jsonb_array_length(${interviewConversation.transcript}))`.mapWith(
                Number,
              ),
          })
          .from(interviewConversation)
          .leftJoin(
            interviewConversationTurn,
            eq(interviewConversationTurn.conversationId, interviewConversation.conversationId),
          )
          .where(
            and(
              eq(interviewConversation.conversationId, selected),
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
    const [result] = resultRows;
    const durationSecs =
      result?.recordingDurationSecs ??
      (result?.startedAt && result.endedAt
        ? Math.max(0, Math.round((result.endedAt.getTime() - result.startedAt.getTime()) / 1000))
        : null);
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
            durationSecs,
            endedAt: iso(result.endedAt),
            reportStatus: result.reportStatus,
            startedAt: iso(result.startedAt),
            summary: result.summary,
            turnCount: result.turnCount,
          }
        : null,
      round: {
        allowTextInput: round.allowTextInput,
        disconnectedAt: iso(round.disconnectedAt),
        id: round.roundId,
        label: round.roundLabel,
        scheduledAt: iso(round.scheduledAt),
        scheduledEndAt: iso(round.scheduledEndAt),
        sessionStartedAt: iso(round.sessionStartedAt),
        status: round.status,
      },
    };
  }
}
