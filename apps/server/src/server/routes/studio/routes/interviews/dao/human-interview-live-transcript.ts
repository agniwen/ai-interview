import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { humanInterviewMeeting, humanInterviewMeetingInterviewer } from "@app/db-schema/schema";
import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";

export async function loadHumanInterviewLiveTranscriptDraft(input: {
  meetingId: string;
  userId: string;
}): Promise<{ draft: MeetingLiveTranscriptDraft | null; version: number }> {
  const [row] = await db
    .select({
      draft: humanInterviewMeetingInterviewer.liveTranscriptDraft,
      version: humanInterviewMeetingInterviewer.liveTranscriptDraftVersion,
    })
    .from(humanInterviewMeetingInterviewer)
    .where(
      and(
        eq(humanInterviewMeetingInterviewer.meetingId, input.meetingId),
        eq(humanInterviewMeetingInterviewer.userId, input.userId),
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
      .select({ status: humanInterviewMeeting.status })
      .from(humanInterviewMeeting)
      .where(
        and(
          eq(humanInterviewMeeting.id, input.meetingId),
          eq(humanInterviewMeeting.organizationId, input.organizationId),
          inArray(humanInterviewMeeting.status, ["scheduled", "in_progress"]),
        ),
      )
      .for("share")
      .limit(1);
    if (!meeting) {
      return null;
    }
    const [saved] = await tx
      .update(humanInterviewMeetingInterviewer)
      .set({
        liveTranscriptDraft: input.draft,
        liveTranscriptDraftVersion: sql`${humanInterviewMeetingInterviewer.liveTranscriptDraftVersion} + 1`,
      })
      .where(
        and(
          eq(humanInterviewMeetingInterviewer.meetingId, input.meetingId),
          eq(humanInterviewMeetingInterviewer.userId, input.userId),
          eq(humanInterviewMeetingInterviewer.liveTranscriptDraftVersion, input.expectedVersion),
          inArray(humanInterviewMeetingInterviewer.role, ["host", "interviewer"]),
        ),
      )
      .returning({ version: humanInterviewMeetingInterviewer.liveTranscriptDraftVersion });
    return saved ?? null;
  });
}
