import { and, eq, ne } from "drizzle-orm";
import type { Transaction } from "@app/server/server/routes/studio/routes/interview-notifications/dao";
import { enqueueHumanMeetingEvents } from "@app/server/server/routes/studio/routes/interview-notifications/utils/events";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
} from "@arc/db-schema/schema";

export async function enqueueHumanMeetingConfirmedIfReady(
  tx: Transaction,
  input: { actorUserId: string | null; meetingId: string; now?: Date },
): Promise<boolean> {
  const [meeting] = await tx
    .select({
      scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
      scheduledAt: studioHumanInterviewMeeting.scheduledAt,
      status: studioHumanInterviewMeeting.status,
    })
    .from(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.id, input.meetingId))
    .limit(1);
  if (!(meeting && meeting.status === "scheduled" && meeting.scheduledAt)) {
    return false;
  }

  const activeRounds = await tx
    .select({
      candidateInviteStatus: studioHumanInterviewMeetingRound.candidateInviteStatus,
      roundId: studioHumanInterviewMeetingRound.roundId,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.meetingId),
        ne(studioHumanInterviewRound.status, "cancelled"),
      ),
    );
  if (
    activeRounds.length === 0 ||
    activeRounds.some((round) => round.candidateInviteStatus !== "accepted")
  ) {
    return false;
  }

  await enqueueHumanMeetingEvents(tx, {
    actorUserId: input.actorUserId,
    meetingId: input.meetingId,
    now: input.now,
    scheduleVersion: meeting.scheduleVersion,
    type: "human_interview_confirmed",
  });
  return true;
}
