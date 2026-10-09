import { sql } from "drizzle-orm";
import { humanInterviewMeeting, meetingSession } from "@app/db-schema/schema";
import type { MeetingRecordingType } from "@app/shared/meeting-recording";

// Recruiting context links are not provenance: ordinary Echo recordings can also have them.
export const meetingRecordingType = sql<MeetingRecordingType>`case when exists (
  select 1 from ${humanInterviewMeeting}
  where ${humanInterviewMeeting.processingMeetingSessionId} = ${meetingSession.id}
    and ${humanInterviewMeeting.organizationId} = ${meetingSession.organizationId}
) then 'human_interview' else 'voice_recording' end`;
