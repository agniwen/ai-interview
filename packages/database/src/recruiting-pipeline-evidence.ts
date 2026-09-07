import { and, eq } from "drizzle-orm";
import type { recruitingNodeState } from "@app/db-schema/schema";
import {
  aiInterviewRound,
  humanInterviewRound,
  recruitingInitialInterviewVersion,
  recruitingOffer,
} from "@app/db-schema/schema";
import type { RecruitingTransaction, RecruitingNodeUpdate } from "./recruiting-pipeline";
import { RecruitingPipelineError } from "./recruiting-pipeline-errors";
type NodeRow = typeof recruitingNodeState.$inferSelect;
// oxlint-disable-next-line complexity -- 不同依据分别核验真实执行状态及复合归属，不能只依赖客户端传入的结论。
export async function validateEvidence(
  tx: RecruitingTransaction,
  input: RecruitingNodeUpdate,
  values: Pick<
    NodeRow,
    | "effectiveAiRoundId"
    | "effectiveInitialInterviewVersionId"
    | "effectiveHumanRoundId"
    | "effectiveOfferId"
  >,
) {
  if (values.effectiveInitialInterviewVersionId) {
    if (input.node !== "ai_interview" || values.effectiveAiRoundId) {
      throw new RecruitingPipelineError(
        "人工初面依据只能用于初面节点，且不能同时选择 AI 轮次。",
        "invalid",
      );
    }
    const [version] = await tx
      .select({ id: recruitingInitialInterviewVersion.id })
      .from(recruitingInitialInterviewVersion)
      .where(
        and(
          eq(recruitingInitialInterviewVersion.id, values.effectiveInitialInterviewVersionId),
          eq(recruitingInitialInterviewVersion.recruitingRecordId, input.recordId),
          eq(recruitingInitialInterviewVersion.organizationId, input.organizationId),
          eq(recruitingInitialInterviewVersion.status, "ready"),
        ),
      );
    if (!version) {
      throw new RecruitingPipelineError("请等待人工初面评价表生成成功后再确认结果。", "invalid");
    }
  }
  if (values.effectiveAiRoundId) {
    if (input.node !== "ai_interview") {
      throw new RecruitingPipelineError("AI 面试依据只能用于 AI 初面节点。", "invalid");
    }
    const [round] = await tx
      .select()
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.id, values.effectiveAiRoundId),
          eq(aiInterviewRound.recruitingRecordId, input.recordId),
          eq(aiInterviewRound.organizationId, input.organizationId),
        ),
      );
    if (
      !round ||
      (input.result === "pass" && (round.status !== "completed" || round.reviewOutcome !== "pass"))
    ) {
      throw new RecruitingPipelineError("请先确认本次 AI 面试评价通过。", "invalid");
    }
  }
  if (values.effectiveHumanRoundId) {
    if (input.node !== "second_interview" && input.node !== "final_interview") {
      throw new RecruitingPipelineError("真人面试依据只能用于复试或终试。", "invalid");
    }
    const [round] = await tx
      .select()
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.id, values.effectiveHumanRoundId),
          eq(humanInterviewRound.recruitingRecordId, input.recordId),
          eq(humanInterviewRound.organizationId, input.organizationId),
          eq(humanInterviewRound.roundKind, input.node),
        ),
      );
    if (
      !round ||
      (input.result === "pass" &&
        (round.status !== "completed" || round.outcome !== "pass" || !round.feedback?.trim()))
    ) {
      throw new RecruitingPipelineError("请先完成本轮面试、填写反馈并确认通过。", "invalid");
    }
  }
  if (values.effectiveOfferId) {
    if (input.node !== "offer") {
      throw new RecruitingPipelineError("Offer 依据只能用于谈薪发 Offer 节点。", "invalid");
    }
    const [offer] = await tx
      .select({ id: recruitingOffer.id, status: recruitingOffer.status })
      .from(recruitingOffer)
      .where(
        and(
          eq(recruitingOffer.id, values.effectiveOfferId),
          eq(recruitingOffer.recruitingRecordId, input.recordId),
          eq(recruitingOffer.organizationId, input.organizationId),
        ),
      );
    if (!offer || (input.result === "pass" && offer.status !== "accepted")) {
      throw new RecruitingPipelineError("请先确认本次招聘的 Offer 已被接受。", "invalid");
    }
  }
  if (input.result === "pass" && input.node === "offer" && !values.effectiveOfferId) {
    throw new RecruitingPipelineError("请先选择本次有效 Offer。", "invalid");
  }
  if (
    input.result === "pass" &&
    ((input.node === "ai_interview" &&
      !values.effectiveAiRoundId &&
      !values.effectiveInitialInterviewVersionId) ||
      ((input.node === "second_interview" || input.node === "final_interview") &&
        !values.effectiveHumanRoundId))
  ) {
    throw new RecruitingPipelineError("面试通过必须选择本次有效面试轮次。", "invalid");
  }
}

/** 只更新当前有效节点；失败/放弃与关闭记录在同一事务完成。 */
