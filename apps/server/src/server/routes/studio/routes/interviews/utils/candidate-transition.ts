import { z } from "zod";
import {
  candidateOutcomeSchema,
  closedMetaSchema,
  recruitingCloseReasonSchema,
  recruitingNodeResultSchema,
  recruitingNodeStatusSchema,
  recruitingPipelineNodeSchema,
  studioInterviewQuestionClientSchema,
} from "@app/db-schema/studio-interviews";

const expectedVersion = z.number().int().nonnegative();
const reason = z.string().trim().min(1, "请填写调整原因").max(1000);
const optionalId = z.string().min(1).nullable().optional();

/** 人工动作必须提交所见版本；数据库事务负责最终的顺序、依据和归属核验。 */
export const candidateTransitionInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("screening_advance"),
    expectedVersion,
    targetNode: z.enum(["ai_interview", "second_interview"]),
  }),
  z
    .object({
      action: z.literal("advance"),
      expectedVersion,
      interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50).optional(),
      reason: reason.optional(),
      skipNodes: z
        .array(z.enum(["screening", "ai_interview"]))
        .max(2)
        .optional(),
      targetNode: recruitingPipelineNodeSchema,
    })
    .refine(
      (input) =>
        !input.interviewQuestions ||
        input.targetNode === "second_interview" ||
        input.targetNode === "final_interview",
      { message: "面试准备题目只能在进入真人面试时更新", path: ["interviewQuestions"] },
    ),
  z.object({
    action: z.literal("reopen"),
    expectedVersion,
    reason,
    targetNode: recruitingPipelineNodeSchema,
    targetStatus: z.literal("pending"),
  }),
  z
    .object({
      action: z.literal("update_node"),
      closeReason: recruitingCloseReasonSchema.optional(),
      effectiveAiRoundId: optionalId,
      effectiveHumanRoundId: optionalId,
      effectiveOfferId: optionalId,
      expectedVersion,
      node: recruitingPipelineNodeSchema,
      reason: reason.optional(),
      result: recruitingNodeResultSchema.nullable().optional(),
      targetStatus: recruitingNodeStatusSchema.exclude(["inactive", "skipped"]),
    })
    .refine((input) => (input.targetStatus === "completed") === Boolean(input.result), {
      message: "完成节点必须提供结论；未完成不能填写结论",
      path: ["result"],
    }),
  z.object({
    action: z.literal("close"),
    closeReason: recruitingCloseReasonSchema,
    details: closedMetaSchema.omit({ previousStage: true }).partial().optional(),
    expectedVersion,
    outcome: candidateOutcomeSchema.exclude(["in_pipeline"]),
    reason: reason.optional(),
  }),
]);
export type CandidateTransitionInput = z.infer<typeof candidateTransitionInputSchema>;
