import { and, eq } from "drizzle-orm";
import {
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import type { RecruitingTransaction as Tx } from "@app/database/recruiting-pipeline";
import { recruitingRecord, recruitingNodeState, humanInterviewRound } from "@app/db-schema/schema";
import { EditRoundError } from "./human-interview-round-errors";
import type { CreateRoundOptions } from "./human-interview-rounds";

// oxlint-disable-next-line complexity -- 直接入面试与正常复试晋级在同一事务验证当前有效依据。
export async function assertCanCreateHumanInterviewRound(
  tx: Tx,
  options: CreateRoundOptions,
): Promise<void> {
  const { interviewRecordId, organizationId, input, actorUserId = null } = options;
  const [record] = await tx
    .select()
    .from(recruitingRecord)
    .where(
      and(
        eq(recruitingRecord.id, interviewRecordId),
        eq(recruitingRecord.organizationId, organizationId),
      ),
    )
    .for("update");
  if (!record) {
    throw new EditRoundError("候选人记录不存在。", 404);
  }
  if (input.expectedVersion !== undefined && record.version !== input.expectedVersion) {
    throw new EditRoundError("招聘流程已更新，请刷新后重试。", 409);
  }
  if (record.currentStage === "closed") {
    throw new EditRoundError("招聘已结束，请先重新激活。", 409);
  }
  const [screening] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, interviewRecordId),
        eq(recruitingNodeState.node, "screening"),
      ),
    );
  if (screening?.result !== "pass") {
    throw new EditRoundError("请先将简历筛选标记为通过，再发起真人面试。", 409);
  }
  if (record.currentStage !== input.roundKind) {
    const direct =
      input.roundKind === "second_interview" &&
      (record.currentStage === "screening" || record.currentStage === "ai_interview");
    if (
      !direct &&
      !(record.currentStage === "second_interview" && input.roundKind === "final_interview")
    ) {
      throw new EditRoundError("当前节点不能安排此类面试，请先完成前序流程。", 400);
    }
    const rows = await tx
      .select()
      .from(recruitingNodeState)
      .where(eq(recruitingNodeState.recruitingRecordId, interviewRecordId));
    const previous: ("screening" | "ai_interview")[] =
      record.currentStage === "screening" ? ["screening", "ai_interview"] : ["ai_interview"];
    const skipNodes = direct
      ? previous.filter(
          (node) =>
            !rows.some(
              (row) => row.node === node && row.status === "completed" && row.result === "pass",
            ),
        )
      : [];
    await transitionRecruitingNodeTx(tx, {
      expectedVersion: input.expectedVersion,
      operatorId: actorUserId,
      organizationId,
      reason: direct ? "直接安排真人面试，前序未执行节点明确跳过" : undefined,
      recordId: interviewRecordId,
      skipNodes,
      targetNode: input.roundKind,
    });
  }
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, interviewRecordId),
        eq(recruitingNodeState.node, input.roundKind),
      ),
    );
  if (node?.status === "completed") {
    throw new EditRoundError("该节点已完成，请进入下一节点或先回退重新确认。", 409);
  }
  if (node?.effectiveHumanRoundId) {
    const [round] = await tx
      .select()
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.id, node.effectiveHumanRoundId));
    if (round && round.status !== "cancelled") {
      throw new EditRoundError("请先标记完成或取消当前有效轮次。", 409);
    }
  }
}

/** 旧轮次回调只保存历史；只有当前选定轮次能够更新当前节点。 */
export async function syncEffectiveHumanRoundNode(
  tx: Tx,
  input: {
    recordId: string;
    organizationId: string;
    operatorId: string | null;
    roundId: string;
    node: "second_interview" | "final_interview";
    status: "completed" | "awaiting_review" | "pending";
    result: "pass" | "fail" | null;
    clear?: boolean;
  },
): Promise<void> {
  const [record] = await tx
    .select()
    .from(recruitingRecord)
    .where(
      and(
        eq(recruitingRecord.id, input.recordId),
        eq(recruitingRecord.organizationId, input.organizationId),
      ),
    )
    .for("update");
  if (!record || record.currentStage !== input.node) {
    return;
  }
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, input.recordId),
        eq(recruitingNodeState.node, input.node),
      ),
    );
  if (node?.effectiveHumanRoundId !== input.roundId) {
    return;
  }
  await updateRecruitingNodeTx(tx, {
    ...input,
    effectiveHumanRoundId: input.clear ? null : input.roundId,
    expectedEffectiveId: input.roundId,
  });
}
