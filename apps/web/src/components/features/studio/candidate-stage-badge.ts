import { pipelineStageMeta } from "@app/db-schema/recruiting-contracts";
import type { PipelineStage } from "@app/db-schema/recruiting-contracts";

export type CandidateStageBadgeVariant = "info" | "pink";

export function getCandidateStageBadgeVariant(
  stage: string | null | undefined,
): CandidateStageBadgeVariant | null {
  if (stage === "second_interview" || stage === "final_interview") {
    return "info";
  }
  if (
    stage === "income_proof" ||
    stage === "salary_negotiation" ||
    stage === "offer" ||
    stage === "background_check" ||
    stage === "onboarding"
  ) {
    return "pink";
  }
  return null;
}

export function getCandidateStageBadgeHoverClass(stage: string | null | undefined): string | null {
  if (stage === "second_interview" || stage === "final_interview") {
    return "hover:bg-sky-line";
  }
  if (
    stage === "income_proof" ||
    stage === "salary_negotiation" ||
    stage === "offer" ||
    stage === "background_check" ||
    stage === "onboarding"
  ) {
    return "hover:bg-pink-line";
  }
  return null;
}

export type RecruitingStatusTone = "success" | "warning" | "info" | "outline";

/** 招聘台状态色调到 Badge 变体的映射；info 用默认中性色。Recruiting-desk tone → Badge variant. */
export const recruitingStatusToneBadgeVariant = {
  info: "default",
  outline: "outline",
  success: "success",
  warning: "warning",
} as const satisfies Record<RecruitingStatusTone, "default" | RecruitingStatusTone>;

/**
 * 只知道阶段（无节点子状态）时的徽标色，与招聘台阶段徽标的基础色一致。
 * Badge variant when only the stage is known, matching the recruiting desk's stage badge.
 */
export function getPipelineStageBadgeVariant(stage: PipelineStage) {
  return (
    getCandidateStageBadgeVariant(stage) ??
    recruitingStatusToneBadgeVariant[pipelineStageMeta[stage].tone]
  );
}
