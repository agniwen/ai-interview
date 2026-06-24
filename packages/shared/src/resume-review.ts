import type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewBiasCategory,
  ResumeReviewBiasItem,
  ResumeReviewPoint,
} from "@arc/db-schema/resume-review";

export {
  resumeReviewActionSchema,
  resumeReviewBiasCategorySchema,
  resumeReviewBiasItemSchema,
  resumeReviewDimensionSchema,
  resumeReviewPointSchema,
  resumeReviewSchema,
} from "@arc/db-schema/resume-review";
export type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewBiasCategory,
  ResumeReviewBiasItem,
  ResumeReviewDimension,
  ResumeReviewPoint,
} from "@arc/db-schema/resume-review";

export const resumeReviewActionLabel: Record<ResumeReviewAction, string> = {
  hold: "暂缓",
  interview: "进入面试",
  reject: "淘汰",
};

export const resumeReviewBiasCategoryLabel: Record<ResumeReviewBiasCategory, string> = {
  credibility_risk: "真实性存疑",
  hard_gap: "硬缺口",
  soft_mismatch: "软错位",
  stability_signal: "稳定性信号",
};

export function countResumeReviewBiasCategories(items: ResumeReviewBiasItem[]) {
  return {
    credibilityRisk: items.filter((item) => item.category === "credibility_risk").length,
    hardGap: items.filter((item) => item.category === "hard_gap").length,
    softMismatch: items.filter((item) => item.category === "soft_mismatch").length,
    stabilitySignal: items.filter((item) => item.category === "stability_signal").length,
  };
}

function formatPoint(point: ResumeReviewPoint) {
  const evidence = point.evidence?.trim() || "待核实";
  return `- ${point.point}：${evidence}。影响：${point.impact}。`;
}

function formatBiasScan(items: ResumeReviewBiasItem[]) {
  if (items.length === 0) {
    return "未发现关键偏差";
  }

  const counts = countResumeReviewBiasCategories(items);
  return [
    `发现 ${items.length} 个关键偏差：硬缺口 ${counts.hardGap} 项 / 软错位 ${counts.softMismatch} 项 / 真实性存疑 ${counts.credibilityRisk} 项 / 稳定性信号 ${counts.stabilitySignal} 项。`,
    ...items.map(
      (item) =>
        `- ${item.description} → ${resumeReviewBiasCategoryLabel[item.category]} → ${item.impact}`,
    ),
  ].join("\n");
}

function formatNextStep(review: ResumeReview) {
  const focus = review.nextStep.interviewFocus.length
    ? `面试重点：${review.nextStep.interviewFocus.join("；")}。`
    : "";
  return `${resumeReviewActionLabel[review.nextStep.action]}。${review.nextStep.rationale}。${focus}${review.nextStep.disclaimer}。`;
}

export function formatResumeReviewMarkdown(review: ResumeReview): string {
  return [
    ["**候选人结论**", review.overall.conclusion].join("\n"),
    ["**综合评分**", `${review.overall.score} / 100。${review.overall.scoreRationale}`].join("\n"),
    ["**优点**", review.strengths.map(formatPoint).join("\n")].join("\n"),
    ["**缺点**", review.weaknesses.map(formatPoint).join("\n")].join("\n"),
    ["**偏差扫描**", formatBiasScan(review.biasScan.items)].join("\n"),
    [
      "**团队定位建议**",
      `${review.teamPositioning.suggestion}。依据：${review.teamPositioning.rationale}。`,
    ].join("\n"),
    [
      "**职级建议**",
      `${review.levelRecommendation.level}。依据：${review.levelRecommendation.rationale}。`,
    ].join("\n"),
    ["**下一步建议**", formatNextStep(review)].join("\n"),
  ].join("\n\n");
}
