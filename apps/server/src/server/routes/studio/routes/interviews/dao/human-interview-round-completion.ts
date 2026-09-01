import { and, desc, eq, ne } from "drizzle-orm";
import type { db } from "../../../../../../lib/server/db/index";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
} from "@arc/db-schema/schema";

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
      id: studioHumanInterviewMeeting.id,
      scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.roundId, input.roundId),
        eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
        ne(studioHumanInterviewMeeting.status, "cancelled"),
      ),
    )
    .orderBy(desc(studioHumanInterviewMeeting.createdAt))
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
