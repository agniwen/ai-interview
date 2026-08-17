import { and, eq, or } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingEvent,
} from "@arc/db-schema/schema";
import type {
  HumanInterviewMeetingLifecycleSource,
  HumanInterviewMeetingProvider,
} from "@arc/db-schema/studio-interviews";
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
      .from(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.id, event.meetingId))
      .limit(1);

    if (!meeting) {
      throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
    }

    if (event.providerEventId) {
      const receipts = await tx
        .insert(studioHumanInterviewMeetingEvent)
        .values({
          id: crypto.randomUUID(),
          meetingId: meeting.id,
          provider: event.provider,
          providerEventId: event.providerEventId,
          type: event.type,
        })
        .onConflictDoNothing()
        .returning({ id: studioHumanInterviewMeetingEvent.id });
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
      .update(studioHumanInterviewMeeting)
      .set({
        endedAt: event.status === "ended" ? event.occurredAt : meeting.endedAt,
        lifecycleOccurredAt: event.occurredAt,
        lifecycleSource: lifecycleSource(event.provider),
        startedAt: event.status === "in_progress" ? event.occurredAt : meeting.startedAt,
        status: event.status,
        updatedAt: new Date(),
      })
      .where(eq(studioHumanInterviewMeeting.id, meeting.id));
    return "applied";
  });
}

export async function forceEndHumanInterviewMeeting({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId?: string;
}): Promise<string | null> {
  const conditions = [eq(studioHumanInterviewMeeting.id, meetingId)];
  if (organizationId) {
    conditions.push(eq(studioHumanInterviewMeeting.organizationId, organizationId));
  }
  const [meeting] = await db
    .select({
      liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
      status: studioHumanInterviewMeeting.status,
    })
    .from(studioHumanInterviewMeeting)
    .where(and(...conditions))
    .limit(1);
  if (!meeting) {
    throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
  }
  if (meeting.status === "cancelled") {
    return meeting.liveKitRoomName;
  }

  const now = new Date();
  await db
    .update(studioHumanInterviewMeeting)
    .set({
      endedAt: now,
      lifecycleOccurredAt: now,
      lifecycleSource: "manual",
      status: "ended",
      updatedAt: now,
    })
    .where(and(...conditions, eq(studioHumanInterviewMeeting.status, "scheduled")));
  await db
    .update(studioHumanInterviewMeeting)
    .set({
      endedAt: now,
      lifecycleOccurredAt: now,
      lifecycleSource: "manual",
      status: "ended",
      updatedAt: now,
    })
    .where(and(...conditions, eq(studioHumanInterviewMeeting.status, "in_progress")));
  return meeting.liveKitRoomName;
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
    meetingId ? eq(studioHumanInterviewMeeting.feishuMeetingId, meetingId) : undefined,
    meetingNo ? eq(studioHumanInterviewMeeting.feishuMeetingNo, meetingNo) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);
  if (identifiers.length === 0) {
    return null;
  }
  const [meeting] = await db
    .select({ id: studioHumanInterviewMeeting.id })
    .from(studioHumanInterviewMeeting)
    .where(and(eq(studioHumanInterviewMeeting.feishuProviderId, providerId), or(...identifiers)))
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
    .update(studioHumanInterviewMeeting)
    .set({ feishuMeetingId, updatedAt: new Date() })
    .where(eq(studioHumanInterviewMeeting.id, meetingId));
}
