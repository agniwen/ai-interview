import type {
  ResumeReviewAction,
  ResumeReviewBiasCategory,
  ResumeReviewBiasItem,
  ResumeReviewDimension,
  ResumeReviewDimensionKey,
  ResumeReviewLoose,
  ResumeReviewPoint,
} from "@app/db-schema/resume-review";
import { RESUME_REVIEW_DIMENSION_DEFINITIONS } from "@app/db-schema/resume-review";
import type { ResumeReviewStatus } from "@app/db-schema/studio-interviews";

export {
  RESUME_REVIEW_SCHEMA_VERSION,
  resumeReviewActionSchema,
  resumeReviewBiasCategorySchema,
  resumeReviewBiasItemSchema,
  resumeReviewDimensionKeySchema,
  resumeReviewDimensionSchema,
  resumeReviewLooseSchema,
  resumeReviewPointSchema,
  resumeReviewSchema,
} from "@app/db-schema/resume-review";
export type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewBiasCategory,
  ResumeReviewBiasItem,
  ResumeReviewDimension,
  ResumeReviewDimensionKey,
  ResumeReviewLoose,
  ResumeReviewPoint,
} from "@app/db-schema/resume-review";

export const resumeReviewActionLabel = {
  hold: "暂缓",
  interview: "进入面试",
  reject: "淘汰",
} satisfies Record<ResumeReviewAction, string>;

export const resumeReviewBiasCategoryLabel = {
  credibility_risk: "真实性存疑",
  hard_gap: "硬缺口",
  soft_mismatch: "软错位",
  stability_signal: "稳定性信号",
} satisfies Record<ResumeReviewBiasCategory, string>;

export const RESUME_REVIEW_DIMENSIONS = RESUME_REVIEW_DIMENSION_DEFINITIONS;

export interface ResumeReviewFrameworkOptions {
  seniority?: "general" | "intern" | "junior" | "mid" | "senior";
  targetRole?: string;
}

export function getResumeReviewFramework(options: ResumeReviewFrameworkOptions = {}) {
  return {
    dimensions: RESUME_REVIEW_DIMENSIONS.map((dimension) => ({
      checklist: [...dimension.checklist],
      key: dimension.key,
      name: dimension.label,
      weight: Math.round(dimension.weight * 100),
    })),
    seniority: options.seniority ?? "general",
    targetRole: options.targetRole ?? "软件工程岗位",
  };
}

export function formatResumeReviewFrameworkWeights(): string {
  return RESUME_REVIEW_DIMENSIONS.map((dimension) => Math.round(dimension.weight * 100)).join("/");
}

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
  return review.dimensions[key] ?? null;
}

// 从宽松 review 读取基础分：新版优先 baseScore，v1 兜底 overall.score。
// Read base score from a loose review: current baseScore first, v1 overall.score fallback.
export function getResumeReviewBaseScore(review: ResumeReviewLoose): number | null {
  return review.overall.baseScore ?? review.overall.score ?? null;
}

// 按产品六维权重计算基础分。
// Compute base score by the product six-dimension weighted sum.
export function computeResumeReviewBaseScore(
  dimensions: Record<string, ResumeReviewDimension>,
): number {
  let total = 0;
  for (const { key, weight } of RESUME_REVIEW_DIMENSIONS) {
    const dim = dimensions[key];
    if (dim) {
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

export type ResumeReviewScoreSentiment = "negative" | "neutral" | "positive";
export type ResumeReviewActionTone = "danger" | "muted" | "success" | "warning";

export interface ResumeLibraryReviewCardDescription {
  label: string;
  scoreSentiment: ResumeReviewScoreSentiment | null;
  tone: ResumeReviewActionTone;
}

/** Score band for card thumb icons: ≥70 up, 50–69 neutral, <50 down. */
export function getResumeReviewScoreSentiment(score: number): ResumeReviewScoreSentiment {
  if (score >= 70) {
    return "positive";
  }
  if (score >= 50) {
    return "neutral";
  }
  return "negative";
}

/** Map next-step action to semantic tone (text color, not badge). */
export function getResumeReviewActionTone(
  action: ResumeReviewAction | null | undefined,
): ResumeReviewActionTone {
  if (action === "interview") {
    return "success";
  }
  if (action === "hold") {
    return "warning";
  }
  if (action === "reject") {
    return "danger";
  }
  return "muted";
}

/**
 * 招聘台卡片「下一步建议」展示文案（含分数）。
 * Card copy for next-step suggestion on the resume library list, with score.
 */
export function describeResumeLibraryReviewCard(input: {
  baseScore: number | null;
  nextStepAction: ResumeReviewAction | null;
  status: ResumeReviewStatus;
}): ResumeLibraryReviewCardDescription {
  const { baseScore, nextStepAction, status } = input;

  if (status === "queued" || status === "processing") {
    return {
      label: "生成中…",
      scoreSentiment: null,
      tone: "muted",
    };
  }

  if (status === "failed") {
    return {
      label: "生成失败",
      scoreSentiment: null,
      tone: "muted",
    };
  }

  if (status !== "ready" || nextStepAction === null) {
    return {
      label: "未生成",
      scoreSentiment: null,
      tone: "muted",
    };
  }

  const actionLabel = `建议${resumeReviewActionLabel[nextStepAction]}`;
  return {
    label: baseScore === null ? actionLabel : `${actionLabel}（${baseScore}分）`,
    scoreSentiment: baseScore === null ? null : getResumeReviewScoreSentiment(baseScore),
    tone: getResumeReviewActionTone(nextStepAction),
  };
}
