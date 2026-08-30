import { and, eq } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
} from "@arc/db-schema/schema";

export async function isHumanMeetingInterviewer(input: {
  meetingId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ userId: studioHumanInterviewMeetingInterviewer.userId })
    .from(studioHumanInterviewMeetingInterviewer)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingInterviewer.meetingId),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId),
        eq(studioHumanInterviewMeetingInterviewer.userId, input.userId),
        eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
