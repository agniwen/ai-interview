import { and, eq, or } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { humanInterviewMeeting, humanInterviewMeetingEvent } from "@app/db-schema/schema";
import type {
  HumanInterviewMeetingLifecycleSource,
  HumanInterviewMeetingProvider,
} from "@app/db-schema/studio-interviews";
import { cancelPendingHumanMeetingReminders } from "../../../../../interview-notifications/utils/events";
import { HumanInterviewMeetingError } from "./human-interview-meeting-access";

type FeishuMeetingProviderId = "feishu" | "feishu-jiguang-hr";

type LifecycleStatus = "in_progress" | "ended";

export type MeetingLifecycleApplyResult = "applied" | "duplicate" | "ignored";

export interface MeetingLifecycleEvent {
  meetingId: string;
  occurredAt: Date;
  provider: HumanInterviewMeetingProvider;
  providerEventId?: string;
  status: LifecycleStatus;
  type: string;
}

function lifecycleSource(
  provider: HumanInterviewMeetingProvider,
): HumanInterviewMeetingLifecycleSource {
  return provider;
}

/**
 * Applies LiveKit and, when configured, Feishu observations through one
 * monotonic state transition. LiveKit remains the attendee entry channel;
 * Feishu only contributes lifecycle observations for its synchronized meeting.
 */
export function applyHumanInterviewMeetingLifecycleEvent(
  event: MeetingLifecycleEvent,
): Promise<MeetingLifecycleApplyResult> {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, event.meetingId))
      .limit(1);

    if (!meeting) {
      throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
    }

    if (event.providerEventId) {
      const receipts = await tx
        .insert(humanInterviewMeetingEvent)
        .values({
          id: crypto.randomUUID(),
          meetingId: meeting.id,
          organizationId: meeting.organizationId,
          provider: event.provider,
          providerEventId: event.providerEventId,
          type: event.type,
        })
        .onConflictDoNothing()
        .returning({ id: humanInterviewMeetingEvent.id });
      if (receipts.length === 0) {
        return "duplicate";
      }
    }

    if (meeting.status === "cancelled" || meeting.status === "ended") {
      return "ignored";
    }
    if (event.provider === "feishu" && !meeting.feishuProviderId) {
      return "ignored";
    }
    if (
      meeting.lifecycleOccurredAt &&
      event.occurredAt.getTime() < meeting.lifecycleOccurredAt.getTime()
    ) {
      return "ignored";
    }
    if (event.status === "in_progress" && meeting.status !== "scheduled") {
      return "ignored";
    }

    await tx
      .update(humanInterviewMeeting)
      .set({
        endedAt: event.status === "ended" ? event.occurredAt : meeting.endedAt,
        lifecycleOccurredAt: event.occurredAt,
        lifecycleSource: lifecycleSource(event.provider),
        startedAt: event.status === "in_progress" ? event.occurredAt : meeting.startedAt,
        status: event.status,
        updatedAt: new Date(),
      })
      .where(eq(humanInterviewMeeting.id, meeting.id));
    if (event.status === "ended") {
      await cancelPendingHumanMeetingReminders(tx, meeting.id);
    }
    return "applied";
  });
}

export function forceEndHumanInterviewMeeting({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId?: string;
}): Promise<string | null> {
  const conditions = [eq(humanInterviewMeeting.id, meetingId)];
  if (organizationId) {
    conditions.push(eq(humanInterviewMeeting.organizationId, organizationId));
  }
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        id: humanInterviewMeeting.id,
        liveKitRoomName: humanInterviewMeeting.liveKitRoomName,
        scheduleVersion: humanInterviewMeeting.scheduleVersion,
        status: humanInterviewMeeting.status,
      })
      .from(humanInterviewMeeting)
      .where(and(...conditions))
      .limit(1)
      .for("update");
    if (!meeting) {
      throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
    }
    if (meeting.status === "cancelled" || meeting.status === "ended") {
      return meeting.liveKitRoomName;
    }

    const now = new Date();
    await tx
      .update(humanInterviewMeeting)
      .set({
        endedAt: now,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "ended",
        updatedAt: now,
      })
      .where(and(...conditions));
    await cancelPendingHumanMeetingReminders(tx, meeting.id);
    return meeting.liveKitRoomName;
  });
}

export async function resolveHumanInterviewMeetingByFeishuMeeting({
  meetingId,
  meetingNo,
  providerId,
}: {
  meetingId?: string;
  meetingNo?: string;
  providerId: FeishuMeetingProviderId;
}): Promise<string | null> {
  const identifiers = [
    meetingId ? eq(humanInterviewMeeting.feishuMeetingId, meetingId) : undefined,
    meetingNo ? eq(humanInterviewMeeting.feishuMeetingNo, meetingNo) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);
  if (identifiers.length === 0) {
    return null;
  }
  const [meeting] = await db
    .select({ id: humanInterviewMeeting.id })
    .from(humanInterviewMeeting)
    .where(and(eq(humanInterviewMeeting.feishuProviderId, providerId), or(...identifiers)))
    .limit(1);
  return meeting?.id ?? null;
}

export async function recordHumanInterviewFeishuMeetingId({
  feishuMeetingId,
  meetingId,
}: {
  feishuMeetingId: string;
  meetingId: string;
}): Promise<void> {
  await db
    .update(humanInterviewMeeting)
    .set({ feishuMeetingId, updatedAt: new Date() })
    .where(eq(humanInterviewMeeting.id, meetingId));
}
