import type { HumanInterviewEvaluationReviewFinding } from "@app/db-schema/human-interview-evaluation-review";
import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  humanInterviewEvaluationSnapshot,
  humanInterviewReviewerEvaluation,
  user,
} from "@app/db-schema/schema";
import type { HumanInterviewEvaluationDraft } from "@app/db-schema/studio-interviews";
import type { HumanInterviewReviewerEvaluationRecord } from "@app/shared/studio-pipeline-stages";
import { db } from "../../../../../infrastructure/db/index";

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

/** Latest AI-generated snapshot per round, kept after interviewers submit. */
export async function loadRoundAiEvaluations(roundIds: string[], organizationId: string) {
  const byRound = new Map<
    string,
    {
      evaluation: HumanInterviewEvaluationDraft;
      reviewFindings: HumanInterviewEvaluationReviewFinding[];
    }
  >();
  if (roundIds.length === 0) {
    return byRound;
  }
  const rows = await db
    .select({
      evaluation: humanInterviewEvaluationSnapshot.evaluation,
      reviewFindings: humanInterviewEvaluationSnapshot.reviewFindings,
      roundId: humanInterviewEvaluationSnapshot.roundId,
    })
    .from(humanInterviewEvaluationSnapshot)
    .where(
      and(
        inArray(humanInterviewEvaluationSnapshot.roundId, roundIds),
        eq(humanInterviewEvaluationSnapshot.organizationId, organizationId),
        eq(humanInterviewEvaluationSnapshot.source, "ai_generated"),
      ),
    )
    .orderBy(desc(humanInterviewEvaluationSnapshot.createdAt));
  for (const row of rows) {
    if (!byRound.has(row.roundId)) {
      byRound.set(row.roundId, {
        evaluation: row.evaluation,
        reviewFindings: row.reviewFindings ?? [],
      });
    }
  }
  return byRound;
}
