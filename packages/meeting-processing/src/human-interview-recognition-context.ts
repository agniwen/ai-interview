import type { Database } from "@app/database";
import {
  jobDescription,
  meetingSession,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
} from "@app/db-schema/schema";
import { and, asc, eq } from "drizzle-orm";

export async function loadHumanInterviewRecognitionDocuments(
  db: Database,
  input: { meetingId: string; organizationId: string; sourceManifestSha256: string },
): Promise<string[]> {
  const records = await db
    .select({
      jobName: jobDescription.name,
      jobPrompt: jobDescription.prompt,
      questions: studioInterview.interviewQuestions,
      resume: studioInterview.resumeText,
    })
    .from(meetingSession)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeeting.processingMeetingSessionId, meetingSession.id),
    )
    .innerJoin(
      studioHumanInterviewMeetingRound,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
    )
    .innerJoin(studioInterview, eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId))
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, studioInterview.jobDescriptionId),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        eq(meetingSession.manifestSha256, input.sourceManifestSha256),
        eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
        eq(studioHumanInterviewRound.organizationId, input.organizationId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(studioInterview.id));
  return [
    ...new Set(
      records
        .flatMap((record) => [
          [record.jobName, record.jobPrompt].filter(Boolean).join("\n"),
          record.resume ?? "",
          record.questions.map((question) => question.question).join("\n"),
        ])
        .filter(Boolean),
    ),
  ];
}
