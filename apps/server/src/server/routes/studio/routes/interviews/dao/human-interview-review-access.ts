import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
} from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";
import { loadHumanInterviewMeetingInterviewerScope } from "./human-interview-meetings";

export async function loadStudioHumanInterviewReviewScope(input: {
  candidateId: string;
  roundId: string;
  organizationId: string;
  userId: string;
  visibility: RecruitingVisibilityScope;
}) {
  if (
    input.visibility.kind === "none" ||
    (input.visibility.kind === "restricted" && input.visibility.userIds.length === 0)
  ) {
    return null;
  }
  const [row] = await db
    .select({
      meetingId: studioHumanInterviewMeeting.id,
      pipelineStage: studioInterview.pipelineStage,
    })
    .from(studioHumanInterviewRound)
    .innerJoin(studioInterview, eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId))
    .innerJoin(
      studioHumanInterviewMeetingRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
    )
    .where(
      and(
        eq(studioInterview.id, input.candidateId),
        eq(studioInterview.organizationId, input.organizationId),
        eq(studioHumanInterviewRound.id, input.roundId),
        eq(studioHumanInterviewRound.organizationId, input.organizationId),
        eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
        input.visibility.kind === "restricted"
          ? inArray(studioInterview.createdBy, input.visibility.userIds)
          : undefined,
      ),
    )
    .orderBy(
      sql`${studioHumanInterviewMeeting.status} = 'cancelled'`,
      desc(studioHumanInterviewMeeting.createdAt),
      desc(studioHumanInterviewMeeting.id),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const scope = await loadHumanInterviewMeetingInterviewerScope({
    meetingId: row.meetingId,
    organizationId: input.organizationId,
    roundId: input.roundId,
    userId: input.userId,
  });
  return scope ? { ...scope, pipelineStage: row.pipelineStage } : null;
}
