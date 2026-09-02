import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
} from "@app/db-schema/schema";
import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";

export async function loadHumanInterviewLiveTranscriptDraft(input: {
  meetingId: string;
  userId: string;
}): Promise<{ draft: MeetingLiveTranscriptDraft | null; version: number }> {
  const [row] = await db
    .select({
      draft: studioHumanInterviewMeetingInterviewer.liveTranscriptDraft,
      version: studioHumanInterviewMeetingInterviewer.liveTranscriptDraftVersion,
    })
    .from(studioHumanInterviewMeetingInterviewer)
    .where(
      and(
        eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId),
        eq(studioHumanInterviewMeetingInterviewer.userId, input.userId),
      ),
    )
    .limit(1);
  return row ?? { draft: null, version: 0 };
}

export async function saveHumanInterviewLiveTranscriptDraft(input: {
  draft: MeetingLiveTranscriptDraft;
  expectedVersion: number;
  meetingId: string;
  organizationId: string;
  userId: string;
}): Promise<{ version: number } | null> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({ status: studioHumanInterviewMeeting.status })
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, input.meetingId),
          eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
          inArray(studioHumanInterviewMeeting.status, ["scheduled", "in_progress"]),
        ),
      )
      .for("share")
      .limit(1);
    if (!meeting) {
      return null;
    }
    const [saved] = await tx
      .update(studioHumanInterviewMeetingInterviewer)
      .set({
        liveTranscriptDraft: input.draft,
        liveTranscriptDraftVersion: sql`${studioHumanInterviewMeetingInterviewer.liveTranscriptDraftVersion} + 1`,
      })
      .where(
        and(
          eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId),
          eq(studioHumanInterviewMeetingInterviewer.userId, input.userId),
          eq(
            studioHumanInterviewMeetingInterviewer.liveTranscriptDraftVersion,
            input.expectedVersion,
          ),
          inArray(studioHumanInterviewMeetingInterviewer.role, ["host", "interviewer"]),
        ),
      )
      .returning({ version: studioHumanInterviewMeetingInterviewer.liveTranscriptDraftVersion });
    return saved ?? null;
  });
}
