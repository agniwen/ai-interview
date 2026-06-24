import { get } from "lodash-es";
import type {
  ResumeReviewAction,
  ResumeReviewBiasCategory,
  ResumeReviewBiasItem,
  ResumeReviewDimension,
  ResumeReviewDimensionKey,
  ResumeReviewLoose,
  ResumeReviewPoint,
} from "@arc/db-schema/resume-review";

export {
  resumeReviewActionSchema,
  resumeReviewBiasCategorySchema,
  resumeReviewBiasItemSchema,
  resumeReviewDimensionKeySchema,
  resumeReviewDimensionSchema,
  resumeReviewLooseSchema,
  resumeReviewPointSchema,
  resumeReviewSchema,
} from "@arc/db-schema/resume-review";
export type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewBiasCategory,
  ResumeReviewBiasItem,
  ResumeReviewDimension,
  ResumeReviewDimensionKey,
  ResumeReviewLoose,
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

// v2 六维度标签与权重 —— 展示与基础分计算共用。
// v2 six-dimension labels + weights; shared between UI and baseScore calc.
export const RESUME_REVIEW_DIMENSIONS: {
  key: ResumeReviewDimensionKey;
  label: string;
  weight: number;
}[] = [
  { key: "skillMatch", label: "技能匹配度", weight: 0.35 },
  { key: "experienceRelevance", label: "经验相关性", weight: 0.25 },
  { key: "projectMatch", label: "项目匹配度", weight: 0.15 },
  { key: "educationBackground", label: "学历与背景", weight: 0.1 },
  { key: "potential", label: "潜力评估", weight: 0.08 },
  { key: "stability", label: "稳定性评估", weight: 0.07 },
];

export function countResumeReviewBiasCategories(items: ResumeReviewBiasItem[]) {
  return {
    credibilityRisk: items.filter((item) => item.category === "credibility_risk").length,
    hardGap: items.filter((item) => item.category === "hard_gap").length,
    softMismatch: items.filter((item) => item.category === "soft_mismatch").length,
    stabilitySignal: items.filter((item) => item.category === "stability_signal").length,
  };
}

// 从宽松 review（兼容 v1/v2）读取某个维度；缺失返回 null。
// Read a dimension from a loose review (v1/v2 compatible); null when absent.
export function getResumeReviewDimension(
  review: ResumeReviewLoose,
  key: ResumeReviewDimensionKey,
): ResumeReviewDimension | null {
  const dim = get(review, ["dimensions", key]);
  if (!dim || typeof dim.score !== "number" || typeof dim.rationale !== "string") {
    return null;
  }
  return dim;
}

// 从宽松 review 读取基础分：v2 优先 baseScore，v1 兜底 overall.score。
// Read base score from a loose review: v2 baseScore first, v1 overall.score fallback.
export function getResumeReviewBaseScore(review: ResumeReviewLoose): number | null {
  const v2 = get(review, "overall.baseScore");
  if (typeof v2 === "number") {
    return v2;
  }
  const v1 = get(review, "overall.score");
  if (typeof v1 === "number") {
    return v1;
  }
  return null;
}

// 按权重计算基础分（仅 v2 六维度齐全时有效）。
// Compute base score by weighted sum; only meaningful for v2 six-dimension data.
export function computeResumeReviewBaseScore(
  dimensions: Record<string, ResumeReviewDimension>,
): number {
  let total = 0;
  for (const { key, weight } of RESUME_REVIEW_DIMENSIONS) {
    const dim = dimensions[key];
    if (dim && typeof dim.score === "number") {
      total += dim.score * weight;
    }
  }
  return Math.round(total);
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

function formatNextStep(review: ResumeReviewLoose) {
  const focus = review.nextStep.interviewFocus.length
    ? `面试重点：${review.nextStep.interviewFocus.join("；")}。`
    : "";
  return `${resumeReviewActionLabel[review.nextStep.action]}。${review.nextStep.rationale}。${focus}${review.nextStep.disclaimer}。`;
}

export function formatResumeReviewMarkdown(review: ResumeReviewLoose): string {
  const baseScore = getResumeReviewBaseScore(review);
  const scoreText = baseScore === null ? "—" : `${baseScore} / 100`;
  return [
    ["**候选人结论**", review.overall.conclusion].join("\n"),
    ["**综合评分**", `${scoreText}。${review.overall.scoreRationale}`].join("\n"),
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
