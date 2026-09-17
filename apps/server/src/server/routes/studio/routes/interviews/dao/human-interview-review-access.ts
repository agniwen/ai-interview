import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
} from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";

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
      meetingId: humanInterviewMeeting.id,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
      status: humanInterviewMeeting.status,
    })
    .from(humanInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
    )
    .innerJoin(
      humanInterviewMeetingRound,
      eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
    )
    .innerJoin(
      humanInterviewMeeting,
      eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.candidateId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        eq(humanInterviewRound.id, input.roundId),
        eq(humanInterviewRound.organizationId, input.organizationId),
        eq(humanInterviewMeeting.organizationId, input.organizationId),
        input.visibility.kind === "restricted"
          ? inArray(recruitingRecordReadModel.createdBy, input.visibility.userIds)
          : undefined,
      ),
    )
    .orderBy(
      sql`${humanInterviewMeeting.status} = 'cancelled'`,
      desc(humanInterviewMeeting.createdAt),
      desc(humanInterviewMeeting.id),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    // The system route has already checked recruiting visibility; its mutation
    // middleware separately requires humanInterview:update. Meeting assignment
    // remains the access boundary for public interviewer links only.
    canManageReview: true,
    meetingId: row.meetingId,
    organizationId: input.organizationId,
    pipelineStage: row.pipelineStage,
    role: "observer" as const,
    roundId: input.roundId,
    status: row.status,
    userId: input.userId,
  };
}
