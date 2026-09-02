import { getResumeReviewDimension, RESUME_REVIEW_DIMENSIONS } from "@app/shared/resume-review";
import type { ResumeReviewAction, ResumeReviewLoose } from "@app/shared/resume-review";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";

export const DIMENSION_LABELS = RESUME_REVIEW_DIMENSIONS;
export const STRUCTURED_GATE_LABELS = {
  failed: "未通过门槛",
  needs_verification: "门槛待核实",
  passed: "门槛通过",
} as const;
export const STRUCTURED_GRADE_LABELS = {
  matched: "匹配",
  recommended: "推荐",
  unmatched: "不匹配",
} as const;
export const STRUCTURED_DIMENSION_LABELS = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
} as const;
export const STRUCTURED_RADAR_DIMENSION_ORDER = [
  "skillMatch",
  "experienceRelevance",
  "stability",
  "educationBackground",
  "potential",
  "projectMatch",
] as const;

export function actionVariant(action: ResumeReviewAction) {
  if (action === "interview") {
    return "success";
  }
  if (action === "hold") {
    return "warning";
  }
  return "danger";
}

export function structuredGateVariant(status: keyof typeof STRUCTURED_GATE_LABELS) {
  if (status === "failed") {
    return "destructive";
  }
  if (status === "needs_verification") {
    return "warning";
  }
  return "success";
}

export interface ReviewDimensionDisplay {
  key: string;
  label: string;
  rationale: string;
  score: number;
  weight: number;
}

export function getReviewDimensionDisplays(review: ResumeReviewLoose): ReviewDimensionDisplay[] {
  return DIMENSION_LABELS.flatMap(({ key, label, weight }) => {
    const dim = getResumeReviewDimension(review, key);
    if (!dim) {
      return [];
    }
    return [
      {
        key,
        label,
        rationale: dim.rationale,
        score: dim.score,
        weight: Math.round(weight * 100),
      },
    ];
  });
}

export function getStructuredDimensionDisplays(
  evaluation: NonNullable<ResumeLibraryDetail["structuredResumeEvaluation"]>,
): ReviewDimensionDisplay[] {
  return STRUCTURED_RADAR_DIMENSION_ORDER.map((key) => {
    const dimension = evaluation.dimensions[key];
    return {
      key,
      label: STRUCTURED_DIMENSION_LABELS[key],
      rationale:
        evaluation.narrative.dimensionComments?.[key] ?? "查看详细评分了解该维度判断依据。",
      score: dimension.rawScore,
      weight: dimension.weight,
    };
  });
}

export function structuredConclusion(
  evaluation: NonNullable<ResumeLibraryDetail["structuredResumeEvaluation"]>,
): string {
  const gateConclusion = {
    failed: "硬性门槛未通过",
    needs_verification: "硬性门槛存在待核实项",
    passed: "硬性门槛通过",
  }[evaluation.gates.effectiveStatus];
  return `综合评分 ${evaluation.calculations.compositeScore} 分，处于“${STRUCTURED_GRADE_LABELS[evaluation.grade]}”区间；${gateConclusion}。`;
}
