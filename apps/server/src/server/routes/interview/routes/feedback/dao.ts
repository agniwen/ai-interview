import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import { studioInterviewSchedule } from "@app/db-schema/schema";
import type {
  CandidateInterviewFeedback,
  CandidateInterviewFeedbackInput,
} from "@app/db-schema/studio-interviews";
import { buildCandidateInterviewFeedback } from "@app/db-schema/studio-interviews";

export async function submitCandidateInterviewFeedback(
  input: CandidateInterviewFeedbackInput & { interviewRecordId: string; roundId: string },
): Promise<CandidateInterviewFeedback | null> {
  const submittedAt = new Date();
  const [updated] = await db
    .update(studioInterviewSchedule)
    .set({
      candidateFeedbackCategories: input.categories,
      candidateFeedbackDetail: input.detail,
      candidateFeedbackSubmittedAt: submittedAt,
      updatedAt: submittedAt,
    })
    .where(
      and(
        eq(studioInterviewSchedule.id, input.roundId),
        eq(studioInterviewSchedule.interviewRecordId, input.interviewRecordId),
        eq(studioInterviewSchedule.status, "completed"),
        isNull(studioInterviewSchedule.candidateFeedbackSubmittedAt),
      ),
    )
    .returning({
      categories: studioInterviewSchedule.candidateFeedbackCategories,
      detail: studioInterviewSchedule.candidateFeedbackDetail,
      submittedAt: studioInterviewSchedule.candidateFeedbackSubmittedAt,
    });

  return buildCandidateInterviewFeedback({
    categories: updated?.categories ?? null,
    detail: updated?.detail ?? null,
    submittedAt: updated?.submittedAt ?? null,
  });
}
