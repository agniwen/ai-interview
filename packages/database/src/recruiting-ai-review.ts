import { and, asc, eq, gt, gte } from "drizzle-orm";
import { aiInterviewRound, recruitingNodeState } from "@app/db-schema/schema";
import { lockRecruitingRecord } from "./recruiting-records";
import type { RecruitingTransaction } from "./recruiting-records";
import { RecruitingPipelineError, updateRecruitingNodeTx } from "./recruiting-pipeline";
import type { RecruitingPipelineCommand } from "./recruiting-pipeline";

/** 人工确认当前 AI 轮次；同批还有轮次时继续安排，最后一轮通过才完成 AI 节点。 */
export async function reviewAiInterviewRoundTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & { roundId: string; outcome: "pass" | "fail"; reason?: string },
) {
  const record = await lockRecruitingRecord(tx, input.recordId, input.organizationId);
  if (!record) {
    throw new RecruitingPipelineError("招聘记录不存在。", "not_found");
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== record.version) {
    throw new RecruitingPipelineError("招聘流程已更新，请刷新后重试。", "conflict");
  }
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, input.recordId),
        eq(recruitingNodeState.node, "ai_interview"),
      ),
    );
  if (record.currentStage !== "ai_interview" || node?.effectiveAiRoundId !== input.roundId) {
    throw new RecruitingPipelineError("该 AI 面试轮次已不是当前有效依据。", "conflict");
  }
  const [round] = await tx
    .select()
    .from(aiInterviewRound)
    .where(
      and(
        eq(aiInterviewRound.id, input.roundId),
        eq(aiInterviewRound.recruitingRecordId, input.recordId),
        eq(aiInterviewRound.organizationId, input.organizationId),
      ),
    )
    .for("update");
  if (!round || round.status !== "completed") {
    throw new RecruitingPipelineError("请等待 AI 面试结束后再确认结果。", "invalid");
  }
  const now = input.now ?? new Date();
  await tx
    .update(aiInterviewRound)
    .set({
      reviewNotes: input.reason ?? null,
      reviewOutcome: input.outcome,
      reviewedAt: now,
      reviewedBy: input.operatorId,
    })
    .where(eq(aiInterviewRound.id, round.id));
  const [next] =
    input.outcome === "pass"
      ? await tx
          .select()
          .from(aiInterviewRound)
          .where(
            and(
              eq(aiInterviewRound.recruitingRecordId, input.recordId),
              eq(aiInterviewRound.organizationId, input.organizationId),
              eq(aiInterviewRound.status, "pending"),
              gt(aiInterviewRound.sortOrder, round.sortOrder),
              // 回退会重置 enteredAt，旧排期不会自动恢复；迁移缺时间时以有效轮次的创建批次为界。
              gte(aiInterviewRound.createdAt, node.enteredAt ?? round.createdAt),
            ),
          )
          .orderBy(
            asc(aiInterviewRound.sortOrder),
            asc(aiInterviewRound.createdAt),
            asc(aiInterviewRound.id),
          )
          .limit(1)
      : [];
  if (next) {
    return updateRecruitingNodeTx(tx, {
      ...input,
      effectiveAiRoundId: next.id,
      expectedEffectiveId: round.id,
      node: "ai_interview",
      now,
      reason: input.reason ?? "当前 AI 轮次通过，继续同批下一轮面试",
      result: null,
      status: "scheduled",
    });
  }
  return updateRecruitingNodeTx(tx, {
    ...input,
    closeReason: "interview_failed",
    effectiveAiRoundId: round.id,
    expectedEffectiveId: round.id,
    node: "ai_interview",
    now,
    result: input.outcome,
    status: "completed",
  });
}
