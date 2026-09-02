import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../lib/server/db/index";
import {
  meetingSession,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
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
        meetingId: studioHumanInterviewMeeting.id,
        scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
      })
      .from(studioHumanInterviewRound)
      .innerJoin(
        studioHumanInterviewMeetingRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
      )
      .innerJoin(
        meetingSession,
        eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
      )
      .where(
        and(
          eq(studioHumanInterviewRound.id, input.roundId),
          eq(studioHumanInterviewRound.organizationId, input.organizationId),
          eq(studioHumanInterviewRound.evaluationStatus, "draft"),
          eq(studioHumanInterviewRound.evaluationTranscriptRevisionId, input.transcriptRevisionId),
          isNull(studioHumanInterviewRound.evaluationUpdatedBy),
          eq(meetingSession.id, input.meetingSessionId),
        ),
      )
      .orderBy(desc(studioHumanInterviewMeeting.createdAt))
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
