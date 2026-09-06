import { z } from "zod";

/** 仅用于读取旧表和迁移输入；新业务不得输出旧节点。 */
export const legacyPipelineStageValues = [
  "screening",
  "written_test",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
] as const;
export const legacyPipelineStageSchema = z.enum(legacyPipelineStageValues);
export type LegacyPipelineStage = z.infer<typeof legacyPipelineStageSchema>;

export const recruitingPipelineNodeValues = [
  "screening",
  "ai_interview",
  "second_interview",
  "final_interview",
  "income_proof",
  "offer",
  "background_check",
  "onboarding",
] as const;
export const recruitingPipelineNodeSchema = z.enum(recruitingPipelineNodeValues);
export const pipelineStageValues = [...recruitingPipelineNodeValues, "closed"] as const;
export const pipelineStageSchema = z.enum(pipelineStageValues);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const pipelineStageMeta = {
  ai_interview: { label: "AI 初面", tone: "warning" },
  background_check: { label: "背调", tone: "info" },
  closed: { label: "已结束", tone: "outline" },
  final_interview: { label: "终试", tone: "warning" },
  income_proof: { label: "流水提供", tone: "info" },
  offer: { label: "谈薪发 Offer", tone: "info" },
  onboarding: { label: "入职", tone: "success" },
  screening: { label: "简历筛选", tone: "outline" },
  second_interview: { label: "复试", tone: "warning" },
} as const satisfies Record<
  PipelineStage,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
>;

export const recruitingNodeStatusValues = [
  "inactive",
  "pending",
  "scheduled",
  "in_progress",
  "awaiting_review",
  "negotiating",
  "awaiting_send",
  "awaiting_response",
  "completed",
  "skipped",
] as const;
export const recruitingNodeStatusSchema = z.enum(recruitingNodeStatusValues);
export const recruitingNodeStatusMeta = {
  awaiting_response: { label: "待回复" },
  awaiting_review: { label: "待确认" },
  awaiting_send: { label: "待发 Offer" },
  completed: { label: "已完成" },
  in_progress: { label: "进行中" },
  inactive: { label: "未开始" },
  negotiating: { label: "谈薪中" },
  pending: { label: "待处理" },
  scheduled: { label: "已安排" },
  skipped: { label: "已跳过" },
} as const;
export const recruitingNodeResultSchema = z.enum(["pass", "fail", "withdrawn"]);
export const recruitingNodeResultMeta = {
  fail: { label: "淘汰" },
  pass: { label: "通过" },
  withdrawn: { label: "放弃" },
} as const;
export const recruitingCloseReasonValues = [
  "resume_rejected",
  "interview_failed",
  "salary_disagreement",
  "offer_declined",
  "background_check_failed",
  "candidate_withdrew",
  "onboarding_no_show",
  "position_closed",
  "onboarded",
  "other",
] as const;
export const recruitingCloseReasonSchema = z.enum(recruitingCloseReasonValues);

export function normalizeLegacyPipelineStage(
  stage: PipelineStage | LegacyPipelineStage,
): PipelineStage {
  if (stage === "written_test") {
    return "screening";
  }
  if (stage === "human_interview") {
    return "second_interview";
  }
  return stage;
}
