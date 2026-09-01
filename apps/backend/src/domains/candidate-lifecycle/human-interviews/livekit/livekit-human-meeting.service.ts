import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import {
  interviewNotification,
  interviewNotificationEvent,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingEvent,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
} from "@arc/db-schema/schema";
import { HTTP_DATABASE } from "../../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../../infrastructure/http/http.ports.js";
import type { HumanMeetingLiveKitPort } from "./livekit.port.js";

function participant(identity: string | undefined) {
  if (!identity) {
    return null;
  }
  if (identity.startsWith("candidate_")) {
    return { id: identity.slice("candidate_".length), type: "candidate" as const };
  }
  if (identity.startsWith("interviewer_")) {
    return { id: identity.slice("interviewer_".length), type: "interviewer" as const };
  }
  return null;
}

export function liveKitLifecycleUpdate(input: {
  currentOccurredAt: Date | null;
  currentStatus: string;
  event: string;
  occurredAt: Date;
  startedAt: Date | null;
}) {
  if (["cancelled", "ended"].includes(input.currentStatus)) {
    return null;
  }
  if (input.currentOccurredAt && input.occurredAt < input.currentOccurredAt) {
    return null;
  }
  if (input.event === "room_started") {
    if (input.currentStatus !== "scheduled") {
      return null;
    }
    return {
      lifecycleOccurredAt: input.occurredAt,
      lifecycleSource: "livekit" as const,
      startedAt: input.occurredAt,
      status: "in_progress" as const,
      updatedAt: input.occurredAt,
    };
  }
  if (input.event === "room_finished") {
    return {
      endedAt: input.occurredAt,
      lifecycleOccurredAt: input.occurredAt,
      lifecycleSource: "livekit" as const,
      startedAt: input.startedAt,
      status: "ended" as const,
      updatedAt: input.occurredAt,
    };
  }
  return null;
}

@Injectable()
export class LiveKitHumanMeetingService implements HumanMeetingLiveKitPort {
  constructor(
    @Inject(HTTP_DATABASE)
    private readonly database: HttpDatabase,
  ) {}

  async handle(input: {
    event: string;
    eventId?: string;
    identity?: string;
    occurredAt: Date;
    roomName: string;
  }) {
    await this.database.transaction(async (transaction) => {
      const [meeting] = await transaction
        .select({
          id: studioHumanInterviewMeeting.id,
          lifecycleOccurredAt: studioHumanInterviewMeeting.lifecycleOccurredAt,
          startedAt: studioHumanInterviewMeeting.startedAt,
          status: studioHumanInterviewMeeting.status,
        })
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.liveKitRoomName, input.roomName))
        .for("update")
        .limit(1);
      if (!meeting) {
        return;
      }

      if (input.eventId) {
        const receipt = await transaction
          .insert(studioHumanInterviewMeetingEvent)
          .values({
            id: crypto.randomUUID(),
            meetingId: meeting.id,
            provider: "livekit",
            providerEventId: input.eventId,
            type: `livekit.${input.event}`,
          })
          .onConflictDoNothing()
          .returning({ id: studioHumanInterviewMeetingEvent.id });
        if (receipt.length === 0) {
          return;
        }
      }

      const lifecycle = liveKitLifecycleUpdate({
        currentOccurredAt: meeting.lifecycleOccurredAt,
        currentStatus: meeting.status,
        event: input.event,
        occurredAt: input.occurredAt,
        startedAt: meeting.startedAt,
      });
      if (lifecycle) {
        await transaction
          .update(studioHumanInterviewMeeting)
          .set(lifecycle)
          .where(eq(studioHumanInterviewMeeting.id, meeting.id));
        if (lifecycle.status === "ended") {
          const cancelled = await transaction
            .update(interviewNotificationEvent)
            .set({
              completedAt: input.occurredAt,
              lastErrorCode: "notification-superseded",
              lastErrorMessage: "会议时间或状态已变更，旧提醒已取消。",
              leaseExpiresAt: null,
              leaseOwner: null,
              status: "cancelled",
              updatedAt: input.occurredAt,
            })
            .where(
              and(
                eq(interviewNotificationEvent.humanMeetingId, meeting.id),
                eq(interviewNotificationEvent.type, "human_interview_reminder"),
                inArray(interviewNotificationEvent.status, ["pending", "processing", "failed"]),
              ),
            )
            .returning({ id: interviewNotificationEvent.id });
          if (cancelled.length > 0) {
            await transaction
              .update(interviewNotification)
              .set({
                error: "会议时间或状态已变更，旧提醒已取消。",
                leaseExpiresAt: null,
                leaseOwner: null,
                nextAttemptAt: null,
                status: "cancelled",
                updatedAt: input.occurredAt,
              })
              .where(
                inArray(
                  interviewNotification.eventId,
                  cancelled.map((event) => event.id),
                ),
              );
          }
        }
        return;
      }

      const actor = participant(input.identity);
      if (!actor || !["participant_joined", "participant_left"].includes(input.event)) {
        return;
      }
      const field =
        input.event === "participant_joined"
          ? { joinedAt: input.occurredAt }
          : { leftAt: input.occurredAt };
      if (actor.type === "interviewer") {
        await transaction
          .update(studioHumanInterviewMeetingInterviewer)
          .set(field)
          .where(
            and(
              eq(studioHumanInterviewMeetingInterviewer.meetingId, meeting.id),
              eq(studioHumanInterviewMeetingInterviewer.userId, actor.id),
            ),
          );
        return;
      }
      const [round] = await transaction
        .select({ id: studioHumanInterviewRound.id })
        .from(studioHumanInterviewRound)
        .where(eq(studioHumanInterviewRound.id, actor.id))
        .limit(1);
      if (round) {
        await transaction
          .update(studioHumanInterviewMeetingRound)
          .set(field)
          .where(
            and(
              eq(studioHumanInterviewMeetingRound.meetingId, meeting.id),
              eq(studioHumanInterviewMeetingRound.roundId, round.id),
            ),
          );
      }
    });
  }
}
