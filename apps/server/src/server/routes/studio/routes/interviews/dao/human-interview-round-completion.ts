import { and, desc, eq, ne } from "drizzle-orm";
import type { db } from "../../../../../../lib/server/db/index";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";
import { humanInterviewMeeting, humanInterviewMeetingRound } from "@app/db-schema/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function enqueueHumanInterviewRoundCompletion(
  tx: Tx,
  input: {
    actorUserId: string | null;
    now: Date;
    organizationId: string;
    roundId: string;
  },
): Promise<void> {
  if (!isInterviewNotificationFlowEnabled()) {
    return;
  }
  const [meeting] = await tx
    .select({
      id: humanInterviewMeeting.id,
      scheduleVersion: humanInterviewMeeting.scheduleVersion,
    })
    .from(humanInterviewMeetingRound)
    .innerJoin(
      humanInterviewMeeting,
      eq(humanInterviewMeetingRound.meetingId, humanInterviewMeeting.id),
    )
    .where(
      and(
        eq(humanInterviewMeetingRound.roundId, input.roundId),
        eq(humanInterviewMeeting.organizationId, input.organizationId),
        ne(humanInterviewMeeting.status, "cancelled"),
      ),
    )
    .orderBy(desc(humanInterviewMeeting.createdAt))
    .limit(1);
  if (!meeting) {
    return;
  }
  await enqueueHumanMeetingEvents(tx, {
    actorUserId: input.actorUserId,
    dedupeDiscriminator: `round-completed:${input.roundId}`,
    humanRoundId: input.roundId,
    meetingId: meeting.id,
    now: input.now,
    scheduleVersion: meeting.scheduleVersion,
    type: "human_interview_completed",
  });
}
