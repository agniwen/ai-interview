import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import type { Database } from "@app/database";
import {
  jobDescription,
  meetingSession,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
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
      questions: recruitingRecordReadModel.interviewQuestions,
      resume: recruitingRecordReadModel.resumeText,
    })
    .from(meetingSession)
    .innerJoin(
      humanInterviewMeeting,
      eq(humanInterviewMeeting.processingMeetingSessionId, meetingSession.id),
    )
    .innerJoin(
      humanInterviewMeetingRound,
      eq(humanInterviewMeetingRound.meetingId, humanInterviewMeeting.id),
    )
    .innerJoin(humanInterviewRound, eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId))
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
    )
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        eq(meetingSession.manifestSha256, input.sourceManifestSha256),
        eq(humanInterviewMeeting.organizationId, input.organizationId),
        eq(humanInterviewRound.organizationId, input.organizationId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(recruitingRecordReadModel.id));
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
