import { and, eq, ne } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { humanInterviewMeeting } from "@app/db-schema/schema";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";
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
        liveKitRoomName: humanInterviewMeeting.liveKitRoomName,
        scheduleVersion: humanInterviewMeeting.scheduleVersion,
        status: humanInterviewMeeting.status,
      })
      .from(humanInterviewMeeting)
      .where(
        and(
          eq(humanInterviewMeeting.id, meetingId),
          eq(humanInterviewMeeting.organizationId, organizationId),
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
      .update(humanInterviewMeeting)
      .set({
        cancelledAt: now,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "cancelled",
        updatedAt: now,
      })
      .where(
        and(
          eq(humanInterviewMeeting.id, meetingId),
          eq(humanInterviewMeeting.organizationId, organizationId),
          ne(humanInterviewMeeting.status, "in_progress"),
        ),
      )
      .returning({ id: humanInterviewMeeting.id });
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
