import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../lib/server/db/index";
import {
  meetingSession,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
} from "@app/db-schema/schema";
import type { HumanInterviewEvaluationJobData } from "@app/meeting-processing-queue/human-interview-evaluation";
import { enqueueHumanMeetingEvents } from "./utils/events";
import { isInterviewNotificationFlowEnabled } from "./utils/feature-flags";

export async function enqueueHumanInterviewEvaluationReady(
  input: HumanInterviewEvaluationJobData,
): Promise<void> {
  if (!isInterviewNotificationFlowEnabled()) {
    return;
  }
  await db.transaction(async (tx) => {
    const [context] = await tx
      .select({
        meetingId: humanInterviewMeeting.id,
        scheduleVersion: humanInterviewMeeting.scheduleVersion,
      })
      .from(humanInterviewRound)
      .innerJoin(
        humanInterviewMeetingRound,
        eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
      )
      .innerJoin(
        humanInterviewMeeting,
        eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
      )
      .innerJoin(
        meetingSession,
        eq(meetingSession.id, humanInterviewMeeting.processingMeetingSessionId),
      )
      .where(
        and(
          eq(humanInterviewRound.id, input.roundId),
          eq(humanInterviewRound.organizationId, input.organizationId),
          eq(humanInterviewRound.evaluationStatus, "draft"),
          eq(humanInterviewRound.evaluationTranscriptRevisionId, input.transcriptRevisionId),
          isNull(humanInterviewRound.evaluationUpdatedBy),
          eq(meetingSession.id, input.meetingSessionId),
        ),
      )
      .orderBy(desc(humanInterviewMeeting.createdAt))
      .limit(1);
    if (!context) {
      return;
    }
    await enqueueHumanMeetingEvents(tx, {
      actorUserId: null,
      dedupeDiscriminator: `evaluation-ready:${input.roundId}:${input.transcriptRevisionId}`,
      humanRoundId: input.roundId,
      meetingId: context.meetingId,
      scheduleVersion: context.scheduleVersion,
      type: "human_evaluation_summary_ready",
    });
  });
}
