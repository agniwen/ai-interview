import { and, eq, ne } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { studioHumanInterviewMeeting } from "@arc/db-schema/schema";
import { enqueueHumanMeetingEvents } from "@app/server/server/routes/studio/routes/interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "@app/server/server/routes/studio/routes/interview-notifications/utils/feature-flags";
import { HumanInterviewMeetingError } from "./human-interview-meeting-access";

export function cancelHumanInterviewMeeting({
  meetingId,
  organizationId,
  actorUserId = null,
  reason = null,
}: {
  actorUserId?: string | null;
  meetingId: string;
  organizationId: string;
  reason?: string | null;
}): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
        scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
        status: studioHumanInterviewMeeting.status,
      })
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!meeting) {
      throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
    }
    if (meeting.status === "in_progress") {
      throw new HumanInterviewMeetingError("进行中的会议不能删除，请先结束会议。", 400);
    }

    const now = new Date();
    const cancelled = await tx
      .update(studioHumanInterviewMeeting)
      .set({
        cancelledAt: now,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "cancelled",
        updatedAt: now,
      })
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
          ne(studioHumanInterviewMeeting.status, "in_progress"),
        ),
      )
      .returning({ id: studioHumanInterviewMeeting.id });
    if (cancelled.length === 0) {
      throw new HumanInterviewMeetingError("进行中的会议不能删除，请先结束会议。", 400);
    }
    if (isInterviewNotificationFlowEnabled()) {
      await enqueueHumanMeetingEvents(tx, {
        actorUserId,
        changeReason: reason,
        meetingId,
        now,
        scheduleVersion: meeting.scheduleVersion,
        type: "human_interview_cancelled",
      });
    }
    return meeting.liveKitRoomName;
  });
}
