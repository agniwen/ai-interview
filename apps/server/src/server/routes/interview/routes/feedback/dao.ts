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

  if (updated) {
    return buildCandidateInterviewFeedback(updated);
  }
  const [existing] = await db
    .select({
      categories: aiInterviewRound.candidateFeedbackCategories,
      detail: aiInterviewRound.candidateFeedbackDetail,
      submittedAt: aiInterviewRound.candidateFeedbackSubmittedAt,
    })
    .from(aiInterviewRound)
    .where(
      and(
        eq(aiInterviewRound.id, input.roundId),
        eq(aiInterviewRound.recruitingRecordId, input.interviewRecordId),
        eq(aiInterviewRound.status, "completed"),
      ),
    )
    .limit(1);
  // The response may have been lost after the first commit. Accept an exact
  // retry without changing the original submission or its timestamp.
  if (
    !existing ||
    existing.detail !== input.detail ||
    JSON.stringify(existing.categories?.toSorted()) !== JSON.stringify(input.categories.toSorted())
  ) {
    return null;
  }
  return buildCandidateInterviewFeedback(existing);
}
