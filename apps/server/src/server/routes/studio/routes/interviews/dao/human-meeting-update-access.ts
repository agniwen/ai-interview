import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { humanInterviewMeeting, humanInterviewMeetingInterviewer } from "@app/db-schema/schema";

export async function isHumanMeetingInterviewer(input: {
  meetingId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ userId: humanInterviewMeetingInterviewer.userId })
    .from(humanInterviewMeetingInterviewer)
    .innerJoin(
      humanInterviewMeeting,
      eq(humanInterviewMeeting.id, humanInterviewMeetingInterviewer.meetingId),
    )
    .where(
      and(
        eq(humanInterviewMeetingInterviewer.meetingId, input.meetingId),
        eq(humanInterviewMeetingInterviewer.userId, input.userId),
        eq(humanInterviewMeeting.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
