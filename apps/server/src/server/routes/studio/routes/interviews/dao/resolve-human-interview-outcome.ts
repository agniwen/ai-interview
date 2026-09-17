import { syncHumanInterviewRoundNodeTx } from "@app/database/recruiting-pipeline";
import { isOfferStage } from "@app/shared/candidate-pipeline-machine";
import {
  recruitingRecord,
  humanInterviewEvaluationDocumentSync,
  recruitingEvent,
  humanInterviewRound,
} from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import type { Database } from "@app/database";
import { ResolveHumanInterviewOutcomeError } from "../application/resolve-human-interview-outcome";
import type { ResolveHumanInterviewOutcomeInput } from "../application/resolve-human-interview-outcome";

export function createResolveHumanInterviewOutcomeDao(db: Database) {
  return async (input: ResolveHumanInterviewOutcomeInput): Promise<void> => {
    await db.transaction(async (tx) => {
      const now = new Date();
      const [candidate] = await tx
        .select()
        .from(recruitingRecord)
        .where(
          and(
            eq(recruitingRecord.id, input.interviewRecordId),
            eq(recruitingRecord.organizationId, input.organizationId),
          ),
        )
        .for("update");
      if (!candidate) {
        throw new ResolveHumanInterviewOutcomeError("候选人记录不存在。", 404);
      }
      if (
        candidate.currentStage === "closed" ||
        isOfferStage(candidate.currentStage) ||
        candidate.currentStage === "onboarding"
      ) {
        throw new ResolveHumanInterviewOutcomeError(
          "候选人已结束或进入 Offer 阶段，不能修改本轮结论。",
          409,
        );
      }
      const [round] = await tx
        .select()
        .from(humanInterviewRound)
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
            eq(humanInterviewRound.recruitingRecordId, input.interviewRecordId),
          ),
        )
        .for("update");
      if (!round) {
        throw new ResolveHumanInterviewOutcomeError("面试轮次不存在。", 404);
      }
      if (round.status !== "completed" || round.outcome !== "inconclusive") {
        throw new ResolveHumanInterviewOutcomeError(
          "只能修改已完成且结论为待定的历史轮次，请刷新页面。",
          409,
        );
      }
      const [sync] = await tx
        .select()
        .from(humanInterviewEvaluationDocumentSync)
        .where(
          and(
            eq(humanInterviewEvaluationDocumentSync.roundId, input.roundId),
            eq(humanInterviewEvaluationDocumentSync.organizationId, input.organizationId),
          ),
        )
        .for("update");
      if (sync?.status === "syncing" && sync.nextAttemptAt > now) {
        throw new ResolveHumanInterviewOutcomeError("飞书评价表正在同步，请稍后重试。", 409);
      }
      // Keep the submitted evaluation and its immutable snapshot untouched.
      await tx
        .update(humanInterviewRound)
        .set({ outcome: input.outcome, updatedAt: now })
        .where(eq(humanInterviewRound.id, round.id));
      await syncHumanInterviewRoundNodeTx(tx, {
        now,
        operatorId: input.actorId,
        organizationId: input.organizationId,
        outcome: input.outcome,
        recordId: input.interviewRecordId,
        roundId: input.roundId,
      });
      await tx.insert(recruitingEvent).values({
        action: "human_interview_round_updated",
        createdAt: now,
        detail: {
          newOutcome: input.outcome,
          oldOutcome: round.outcome,
          roundId: round.id,
          roundLabel: round.label,
        },
        id: crypto.randomUUID(),
        operatorId: input.actorId,
        organizationId: input.organizationId,
        recruitingRecordId: input.interviewRecordId,
      });
      if (sync) {
        await tx
          .update(humanInterviewEvaluationDocumentSync)
          .set({
            attemptCount: 0,
            error: null,
            leaseOwner: null,
            nextAttemptAt: now,
            status: "pending",
          })
          .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, sync.snapshotId));
      }
    });
  };
}
