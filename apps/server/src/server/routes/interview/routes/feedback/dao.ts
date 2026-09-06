import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import { aiInterviewRound } from "@app/db-schema/schema";
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
    .update(aiInterviewRound)
    .set({
      candidateFeedbackCategories: input.categories,
      candidateFeedbackDetail: input.detail,
      candidateFeedbackSubmittedAt: submittedAt,
      updatedAt: submittedAt,
    })
    .where(
      and(
        eq(aiInterviewRound.id, input.roundId),
        eq(aiInterviewRound.recruitingRecordId, input.interviewRecordId),
        eq(aiInterviewRound.status, "completed"),
        isNull(aiInterviewRound.candidateFeedbackSubmittedAt),
      ),
    )
    .returning({
      categories: aiInterviewRound.candidateFeedbackCategories,
      detail: aiInterviewRound.candidateFeedbackDetail,
      submittedAt: aiInterviewRound.candidateFeedbackSubmittedAt,
    });

  return buildCandidateInterviewFeedback({
    categories: updated?.categories ?? null,
    detail: updated?.detail ?? null,
    submittedAt: updated?.submittedAt ?? null,
  });
}
