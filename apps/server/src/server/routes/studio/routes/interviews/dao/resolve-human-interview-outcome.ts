import { and, eq } from "drizzle-orm";
import type { Database } from "@app/database";
import {
  humanInterviewDocumentSync,
  interviewAuditLog,
  studioHumanInterviewRound,
  studioInterview,
} from "@app/db-schema/schema";
import { ResolveHumanInterviewOutcomeError } from "../application/resolve-human-interview-outcome";
import type { ResolveHumanInterviewOutcomeInput } from "../application/resolve-human-interview-outcome";

export function createResolveHumanInterviewOutcomeDao(db: Database) {
  return async (input: ResolveHumanInterviewOutcomeInput): Promise<void> => {
    await db.transaction(async (tx) => {
      const now = new Date();
      const [candidate] = await tx
        .select()
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.interviewRecordId),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        )
        .for("update");
      if (!candidate) {
        throw new ResolveHumanInterviewOutcomeError("候选人记录不存在。", 404);
      }
      if (candidate.pipelineStage === "closed" || candidate.pipelineStage === "offer") {
        throw new ResolveHumanInterviewOutcomeError(
          "候选人已结束或进入 Offer 阶段，不能修改本轮结论。",
          409,
        );
      }
      const [round] = await tx
        .select()
        .from(studioHumanInterviewRound)
        .where(
          and(
            eq(studioHumanInterviewRound.id, input.roundId),
            eq(studioHumanInterviewRound.organizationId, input.organizationId),
            eq(studioHumanInterviewRound.interviewRecordId, input.interviewRecordId),
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
        .from(humanInterviewDocumentSync)
        .where(
          and(
            eq(humanInterviewDocumentSync.roundId, input.roundId),
            eq(humanInterviewDocumentSync.organizationId, input.organizationId),
          ),
        )
        .for("update");
      if (sync?.status === "syncing" && sync.nextAttemptAt > now) {
        throw new ResolveHumanInterviewOutcomeError("飞书评价表正在同步，请稍后重试。", 409);
      }
      // Keep the submitted evaluation and its immutable snapshot untouched.
      await tx
        .update(studioHumanInterviewRound)
        .set({ outcome: input.outcome, updatedAt: now })
        .where(eq(studioHumanInterviewRound.id, round.id));
      await tx.insert(interviewAuditLog).values({
        action: "human_interview_round_updated",
        createdAt: now,
        detail: {
          newOutcome: input.outcome,
          oldOutcome: round.outcome,
          roundId: round.id,
          roundLabel: round.label,
        },
        id: crypto.randomUUID(),
        interviewRecordId: input.interviewRecordId,
        operatorId: input.actorId,
        organizationId: input.organizationId,
      });
      if (sync) {
        await tx
          .update(humanInterviewDocumentSync)
          .set({
            attemptCount: 0,
            error: null,
            leaseOwner: null,
            nextAttemptAt: now,
            status: "pending",
            syncedAt: null,
          })
          .where(eq(humanInterviewDocumentSync.snapshotId, sync.snapshotId));
      }
    });
  };
}
