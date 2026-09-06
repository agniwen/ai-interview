import { and, eq, ne } from "drizzle-orm";
import type { Transaction } from "../../../../../interview-notifications/dao";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import {
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
} from "@app/db-schema/schema";

export async function enqueueHumanMeetingConfirmedIfReady(
  tx: Transaction,
  input: { actorUserId: string | null; meetingId: string; now?: Date },
): Promise<boolean> {
  const [meeting] = await tx
    .select({
      scheduleVersion: humanInterviewMeeting.scheduleVersion,
      scheduledAt: humanInterviewMeeting.scheduledAt,
      status: humanInterviewMeeting.status,
    })
    .from(humanInterviewMeeting)
    .where(eq(humanInterviewMeeting.id, input.meetingId))
    .limit(1);
  if (!(meeting && meeting.status === "scheduled" && meeting.scheduledAt)) {
    return false;
  }

  const activeRounds = await tx
    .select({
      candidateInviteStatus: humanInterviewMeetingRound.candidateInviteStatus,
      roundId: humanInterviewMeetingRound.roundId,
    })
    .from(humanInterviewMeetingRound)
    .innerJoin(humanInterviewRound, eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId))
    .where(
      and(
        eq(humanInterviewMeetingRound.meetingId, input.meetingId),
        ne(humanInterviewRound.status, "cancelled"),
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
