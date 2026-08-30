import { safeUpdateTag } from "@app/server/server/cache-tags";
import {
  applyHumanInterviewMeetingLifecycleEvent,
  recordHumanInterviewFeishuMeetingId,
  resolveHumanInterviewMeetingByFeishuMeeting,
} from "@app/server/server/routes/studio/routes/interviews/dao/human-interview-meeting-lifecycle";
import { isFeishuHumanInterviewEnabled } from "./provider";
import type { FeishuProviderId } from "./provider";

export type FeishuMeetingLifecycleEventType =
  | "vc.meeting.meeting_ended_v1"
  | "vc.meeting.meeting_started_v1";

export interface FeishuMeetingLifecyclePayload {
  create_time?: string;
  event_id?: string;
  header?: { create_time?: string; event_id?: string; event_type?: string };
  meeting?: { end_time?: string; id?: string; meeting_no?: string; start_time?: string };
}

export interface ParsedFeishuMeetingLifecycleEvent {
  eventId: string | null;
  meetingId: string | undefined;
  meetingNo: string | undefined;
  occurredAt: Date;
  status: "ended" | "in_progress";
  type: FeishuMeetingLifecycleEventType;
}

export function parseFeishuMeetingLifecycleEvent(
  event: FeishuMeetingLifecyclePayload,
  type: FeishuMeetingLifecycleEventType,
): ParsedFeishuMeetingLifecycleEvent {
  const rawTimestamp =
    type === "vc.meeting.meeting_started_v1"
      ? (event.meeting?.start_time ?? event.create_time ?? event.header?.create_time)
      : (event.meeting?.end_time ?? event.create_time ?? event.header?.create_time);
  const numericTimestamp = rawTimestamp ? Number(rawTimestamp) : Number.NaN;
  let timestampMs = Date.now();
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    timestampMs = numericTimestamp < 100_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  }
  return {
    eventId: event.header?.event_id ?? event.event_id ?? null,
    meetingId: event.meeting?.id,
    meetingNo: event.meeting?.meeting_no,
    occurredAt: new Date(timestampMs),
    status: type === "vc.meeting.meeting_started_v1" ? "in_progress" : "ended",
    type,
  };
}

async function handleMeetingLifecycleEvent({
  event,
  providerId,
  type,
}: {
  event: FeishuMeetingLifecyclePayload;
  providerId: FeishuProviderId;
  type: FeishuMeetingLifecycleEventType;
}): Promise<void> {
  if (!isFeishuHumanInterviewEnabled()) {
    return;
  }
  const parsed = parseFeishuMeetingLifecycleEvent(event, type);
  if (!(parsed.eventId && (parsed.meetingId || parsed.meetingNo))) {
    console.warn("ignored Feishu meeting lifecycle event with incomplete correlation", {
      providerId,
      type,
    });
    return;
  }

  const meetingId = await resolveHumanInterviewMeetingByFeishuMeeting({
    meetingId: parsed.meetingId,
    meetingNo: parsed.meetingNo,
    providerId,
  });
  if (!meetingId) {
    console.warn("ignored Feishu meeting lifecycle event for unknown meeting", {
      meetingId: parsed.meetingId,
      meetingNo: parsed.meetingNo,
      providerId,
      type,
    });
    return;
  }
  if (parsed.meetingId) {
    await recordHumanInterviewFeishuMeetingId({
      feishuMeetingId: parsed.meetingId,
      meetingId,
    });
  }
  await applyHumanInterviewMeetingLifecycleEvent({
    meetingId,
    occurredAt: parsed.occurredAt,
    provider: "feishu",
    providerEventId: parsed.eventId,
    status: parsed.status,
    type: parsed.type,
  });
  safeUpdateTag("studio-interviews");
}

export function createFeishuMeetingLifecycleEventHandlers(providerId: FeishuProviderId) {
  return {
    "vc.meeting.meeting_ended_v1": (event: FeishuMeetingLifecyclePayload) =>
      handleMeetingLifecycleEvent({
        event,
        providerId,
        type: "vc.meeting.meeting_ended_v1",
      }),
    "vc.meeting.meeting_started_v1": (event: FeishuMeetingLifecyclePayload) =>
      handleMeetingLifecycleEvent({
        event,
        providerId,
        type: "vc.meeting.meeting_started_v1",
      }),
  };
}
