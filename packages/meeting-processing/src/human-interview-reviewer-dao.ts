import type { Database } from "@app/database";
import {
  humanInterviewRound,
  humanInterviewReviewerEvaluation,
  humanInterviewEvaluationSnapshot,
  humanInterviewRoundInterviewer,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewMeeting,
  user,
} from "@app/db-schema/schema";
import type {
  HumanInterviewEvaluationDraft,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import {
  aggregateHumanInterviewOutcomes,
  combineHumanInterviewEvaluations,
} from "./human-interview-reviewer-evaluation";
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function loadLockedOutcome(
  db: Pick<Database, "select">,
  roundId: string,
  organizationId: string,
) {
  const [round] = await db
    .select({
      evaluationStatus: humanInterviewRound.evaluationStatus,
      outcome: humanInterviewRound.outcome,
    })
    .from(humanInterviewRound)
    .where(
      and(
        eq(humanInterviewRound.id, roundId),
        eq(humanInterviewRound.organizationId, organizationId),
      ),
    )
    .limit(1);
  return round?.evaluationStatus === "submitted" &&
    (round.outcome === "pass" || round.outcome === "fail")
    ? round.outcome
    : null;
}

export async function loadReviewerEvaluationFields(
  db: Database,
  input: { roundId: string; organizationId: string; reviewerId?: string },
): Promise<Partial<HumanInterviewReviewRecord>> {
  const reviewerRows = await db
    .select({
      evaluation: humanInterviewReviewerEvaluation.evaluation,
      id: humanInterviewReviewerEvaluation.id,
      legacy: humanInterviewReviewerEvaluation.legacy,
      outcome: humanInterviewReviewerEvaluation.outcome,
      reviewerId: humanInterviewReviewerEvaluation.reviewerId,
      reviewerName: user.name,
      submittedAt: humanInterviewReviewerEvaluation.submittedAt,
      updatedAt: humanInterviewReviewerEvaluation.updatedAt,
      version: humanInterviewReviewerEvaluation.version,
    })
    .from(humanInterviewReviewerEvaluation)
    .leftJoin(user, eq(user.id, humanInterviewReviewerEvaluation.reviewerId))
    .where(
      and(
        eq(humanInterviewReviewerEvaluation.roundId, input.roundId),
        eq(humanInterviewReviewerEvaluation.organizationId, input.organizationId),
      ),
    )
    .orderBy(
      asc(humanInterviewReviewerEvaluation.updatedAt),
      asc(humanInterviewReviewerEvaluation.id),
    );
  const own = input.reviewerId
    ? reviewerRows.find((item) => item.reviewerId === input.reviewerId)
    : undefined;
  const [ai] = await db
    .select({ evaluation: humanInterviewEvaluationSnapshot.evaluation })
    .from(humanInterviewEvaluationSnapshot)
    .where(
      and(
        eq(humanInterviewEvaluationSnapshot.roundId, input.roundId),
        eq(humanInterviewEvaluationSnapshot.organizationId, input.organizationId),
        eq(humanInterviewEvaluationSnapshot.source, "ai_generated"),
      ),
    )
    .orderBy(desc(humanInterviewEvaluationSnapshot.createdAt))
    .limit(1);
  const fields: Partial<HumanInterviewReviewRecord> = {
    aiEvaluation: ai?.evaluation ?? null,
    currentReviewerId: input.reviewerId,
    lockedOutcome: await loadLockedOutcome(db, input.roundId, input.organizationId),
    personalEvaluation: Boolean(input.reviewerId),
    reviewerEvaluations: reviewerRows
      .filter((item) => item.submittedAt || item.legacy || item.reviewerId === input.reviewerId)
      .map((item) => ({
        ...item,
        reviewerName: item.reviewerName ?? "历史轮次评价（作者未知）",
        submittedAt: item.submittedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      })),
  };
  if (!input.reviewerId) {
    return fields;
  }
  let evaluationStatus: HumanInterviewReviewRecord["evaluationStatus"] = "not_started";
  if (own) {
    evaluationStatus = own.submittedAt ? "submitted" : "draft";
  }
  return {
    ...fields,
    evaluation: own?.evaluation ?? null,
    evaluationStatus,
    evaluationUpdatedAt: own?.updatedAt.toISOString() ?? null,
    evaluationUpdatedBy: own?.reviewerId ?? null,
    evaluationVersion: own?.version ?? 0,
    outcome: own?.outcome ?? null,
  };
}

export async function saveReviewerEvaluationTx(
  tx: Transaction,
  input: {
    roundId: string;
    organizationId: string;
    actorId: string;
    expectedVersion?: number;
    evaluation: HumanInterviewEvaluationDraft;
    outcome?: HumanInterviewRoundOutcome;
    submittedAt?: Date;
  },
): Promise<boolean> {
  // The caller holds the round lock, serializing both submissions and draft writes.
  const [existing] = await tx
    .select()
    .from(humanInterviewReviewerEvaluation)
    .where(
      and(
        eq(humanInterviewReviewerEvaluation.roundId, input.roundId),
        eq(humanInterviewReviewerEvaluation.reviewerId, input.actorId),
      ),
    )
    .limit(1);
  if (
    existing?.submittedAt ||
    (input.expectedVersion !== undefined && input.expectedVersion !== (existing?.version ?? 0))
  ) {
    return false;
  }
  const lockedOutcome = await loadLockedOutcome(tx, input.roundId, input.organizationId);
  const values = {
    evaluation: lockedOutcome
      ? { ...input.evaluation, draftOutcome: lockedOutcome }
      : input.evaluation,
    outcome: input.submittedAt ? (lockedOutcome ?? input.outcome) : input.outcome,
    submittedAt: input.submittedAt,
    updatedAt: new Date(),
    version: (existing?.version ?? 0) + 1,
  };
  await (existing
    ? tx
        .update(humanInterviewReviewerEvaluation)
        .set(values)
        .where(eq(humanInterviewReviewerEvaluation.id, existing.id))
    : tx.insert(humanInterviewReviewerEvaluation).values({
        ...values,
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        reviewerId: input.actorId,
        roundId: input.roundId,
      }));
  return true;
}

export async function loadReviewerEvaluationAggregate(
  tx: Transaction,
  input: { roundId: string; organizationId: string; roundStatus: string },
) {
  const rows = await tx
    .select({
      evaluation: humanInterviewReviewerEvaluation.evaluation,
      outcome: humanInterviewReviewerEvaluation.outcome,
      reviewerId: humanInterviewReviewerEvaluation.reviewerId,
      reviewerName: user.name,
      submittedAt: humanInterviewReviewerEvaluation.submittedAt,
    })
    .from(humanInterviewReviewerEvaluation)
    .leftJoin(user, eq(user.id, humanInterviewReviewerEvaluation.reviewerId))
    .where(
      and(
        eq(humanInterviewReviewerEvaluation.roundId, input.roundId),
        eq(humanInterviewReviewerEvaluation.organizationId, input.organizationId),
      ),
    )
    .orderBy(
      asc(humanInterviewReviewerEvaluation.submittedAt),
      asc(humanInterviewReviewerEvaluation.id),
    );
  const submissions = rows
    .filter((item) => item.submittedAt)
    .map((item) => ({
      ...item,
      reviewerName: item.reviewerName ?? "历史轮次评价（作者未知）",
    }));
  const combinedEvaluation = combineHumanInterviewEvaluations(submissions);
  const combinedOutcome =
    (await loadLockedOutcome(tx, input.roundId, input.organizationId)) ??
    aggregateHumanInterviewOutcomes(submissions.map((item) => item.outcome));
  const assigned = await tx
    .select({ userId: humanInterviewRoundInterviewer.userId })
    .from(humanInterviewRoundInterviewer)
    .where(
      and(
        eq(humanInterviewRoundInterviewer.roundId, input.roundId),
        ne(humanInterviewRoundInterviewer.status, "declined"),
      ),
    );
  const invited = await tx
    .select({ userId: humanInterviewMeetingInterviewer.userId })
    .from(humanInterviewMeetingInterviewer)
    .innerJoin(
      humanInterviewMeetingRound,
      eq(humanInterviewMeetingRound.meetingId, humanInterviewMeetingInterviewer.meetingId),
    )
    .innerJoin(
      humanInterviewMeeting,
      eq(humanInterviewMeeting.id, humanInterviewMeetingInterviewer.meetingId),
    )
    .where(
      and(
        eq(humanInterviewMeetingRound.roundId, input.roundId),
        ne(humanInterviewMeetingInterviewer.role, "observer"),
        ne(humanInterviewMeeting.status, "cancelled"),
      ),
    );
  const submittedReviewers = new Set(submissions.map((item) => item.reviewerId));
  const everyoneSubmitted = [...assigned, ...invited].every((item) =>
    submittedReviewers.has(item.userId),
  );
  // The first decisive submission completes the round; later reviewers only supplement it.
  const complete =
    input.roundStatus === "completed" ||
    combinedOutcome === "pass" ||
    combinedOutcome === "fail" ||
    everyoneSubmitted;

  return { combinedEvaluation, combinedOutcome, complete };
}
