import { and, eq } from "drizzle-orm";
import type { recruitingNodeState } from "@app/db-schema/schema";
import { aiInterviewRound, humanInterviewRound } from "@app/db-schema/schema";
import type { RecruitingPipelineCommand, RecruitingTransaction } from "./recruiting-pipeline";
type NodeRow = typeof recruitingNodeState.$inferSelect;

/** 只保留目标节点原本有效且已完成的面试，供人工重新确认；未完成轮次和下游依据继续失效。 */
export async function reopenInterviewEvidence(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand,
  target: NodeRow | undefined,
): Promise<Partial<typeof recruitingNodeState.$inferInsert>> {
  if (target?.node === "ai_interview" && target.effectiveAiRoundId) {
    const [round] = await tx
      .select({ id: aiInterviewRound.id })
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.id, target.effectiveAiRoundId),
          eq(aiInterviewRound.recruitingRecordId, input.recordId),
          eq(aiInterviewRound.organizationId, input.organizationId),
          eq(aiInterviewRound.status, "completed"),
        ),
      );
    if (round) {
      return { effectiveAiRoundId: round.id, status: "awaiting_review" };
    }
  }
  if (
    target &&
    (target.node === "second_interview" || target.node === "final_interview") &&
    target.effectiveHumanRoundId
  ) {
    const [round] = await tx
      .select({ id: humanInterviewRound.id })
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.id, target.effectiveHumanRoundId),
          eq(humanInterviewRound.recruitingRecordId, input.recordId),
          eq(humanInterviewRound.organizationId, input.organizationId),
          eq(humanInterviewRound.roundKind, target.node),
          eq(humanInterviewRound.status, "completed"),
        ),
      );
    if (round) {
      return { effectiveHumanRoundId: round.id, status: "awaiting_review" };
    }
  }
  return {};
}
