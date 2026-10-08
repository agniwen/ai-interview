import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { humanInterviewReviewerEvaluation, user } from "@app/db-schema/schema";
import type { HumanInterviewReviewerEvaluationRecord } from "@app/shared/studio-pipeline-stages";
import { db } from "../../../../../../lib/server/db/index";

export async function loadRoundReviewerEvaluations(roundIds: string[], organizationId: string) {
  const byRound = new Map<string, HumanInterviewReviewerEvaluationRecord[]>();
  if (roundIds.length === 0) {
    return byRound;
  }
  const rows = await db
    .select({
      review: humanInterviewReviewerEvaluation,
      reviewerImage: user.image,
      reviewerName: user.name,
    })
    .from(humanInterviewReviewerEvaluation)
    .leftJoin(user, eq(user.id, humanInterviewReviewerEvaluation.reviewerId))
    .where(
      and(
        inArray(humanInterviewReviewerEvaluation.roundId, roundIds),
        eq(humanInterviewReviewerEvaluation.organizationId, organizationId),
        or(
          isNotNull(humanInterviewReviewerEvaluation.submittedAt),
          eq(humanInterviewReviewerEvaluation.legacy, true),
        ),
      ),
    )
    .orderBy(
      asc(humanInterviewReviewerEvaluation.submittedAt),
      asc(humanInterviewReviewerEvaluation.id),
    );
  for (const { review, reviewerName, reviewerImage } of rows) {
    const entries = byRound.get(review.roundId) ?? [];
    entries.push({
      evaluation: review.evaluation,
      id: review.id,
      legacy: review.legacy,
      outcome: review.outcome,
      reviewerId: review.reviewerId,
      reviewerImage,
      reviewerName: reviewerName ?? "历史评价（作者未知）",
      submittedAt: review.submittedAt?.toISOString() ?? null,
      updatedAt: review.updatedAt.toISOString(),
      version: review.version,
    });
    byRound.set(review.roundId, entries);
  }
  return byRound;
}
